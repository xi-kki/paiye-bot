// ============================================================
// 🤖 @Paiye_Bot — Job Match Engine v3
//   Custom Telegram client | No 409 conflicts | AI Chat
// ============================================================

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const TelegramClient = require('./telegramClient');
const { searchJobs: rawSearchJobs } = require('./jobEngine');
const JobCache = require('./cache');
const AIChat = require('./aiChat');
const userData = require('./userData');
const { parseResume, cleanupFile, UPLOADS_DIR } = require('./resumeParser');

// ─── Config ───
const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) {
  console.error('❌ TELEGRAM_TOKEN not set in .env file!');
  process.exit(1);
}

const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS_PER_CATEGORY = 5;
const MAX_MESSAGE_LENGTH = 3800;

// ─── Init ───
const bot = new TelegramClient(TOKEN);
const jobCache = new JobCache(CACHE_TTL_MS);
const aiChat = new AIChat();
const AI_MODE = new Set();
const AWAITING_RESUME = new Set(); // Users who we're waiting to send a file

async function searchJobs(waitForFresh = false) {
  return jobCache.get(rawSearchJobs, waitForFresh);
}

// ─── Subscribers ───
function loadSubscribers() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      const raw = fs.readFileSync(SUBSCRIBERS_FILE, 'utf8');
      const data = JSON.parse(raw);
      const map = new Map();
      for (const [key, val] of Object.entries(data)) map.set(String(key), val);
      console.log(`📂 Loaded ${map.size} subscriber(s)`);
      return map;
    }
  } catch (err) {
    console.error('⚠️ Could not load subscribers:', err.message);
  }
  return new Map();
}

function saveSubscribers(map) {
  try {
    const obj = {};
    for (const [key, val] of map.entries()) obj[key] = val;
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('⚠️ Could not save subscribers:', err.message);
  }
}

const SUBSCRIBERS = loadSubscribers();
let conflictCount = 0;
const MAX_CONFLICT_RETRIES = 5;

// ─── Helpers ───
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Save subscribers debounced ───
let saveTimer = null;
function saveSubDebounced() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSubscribers(SUBSCRIBERS), 500);
}

// ═══════════════════════════════════════════════════════════
// INLINE KEYBOARDS
// ═══════════════════════════════════════════════════════════
function mainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🤖 AI/ML Jobs', callback_data: 'jobs_ai' },
        { text: '✍️ Writing Jobs', callback_data: 'jobs_writing' }
      ],
      [
        { text: '🏷️ Data Jobs', callback_data: 'jobs_data' },
        { text: '🇳🇬 Nigeria Jobs', callback_data: 'jobs_nigeria' }
      ],
      [
        { text: '📥 Subscribe Daily', callback_data: 'subscribe' },
        { text: '💬 Chat AI', callback_data: 'chat_ai' }
      ],
      [
        { text: '📄 Resume', callback_data: 'resume' },
        { text: '🔄 Refresh', callback_data: 'refresh' }
      ],
      [
        { text: '❓ Help', callback_data: 'help' }
      ]
    ]
  };
}

function chatKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🔙 Back to Menu', callback_data: 'main_menu' }]
    ]
  };
}

function resumeKeyboard(hasResume) {
  const buttons = [];
  if (hasResume) {
    buttons.push([{ text: '📊 ATS Analysis', callback_data: 'analyze' }]);
    buttons.push([{ text: '🔄 Upload New', callback_data: 'upload_resume' }]);
  } else {
    buttons.push([{ text: '📤 Upload Resume', callback_data: 'upload_resume' }]);
  }
  buttons.push([{ text: '🔙 Back to Menu', callback_data: 'main_menu' }]);
  return { inline_keyboard: buttons };
}

// ═══════════════════════════════════════════════════════════
// JOB CARD FORMATTER
// ═══════════════════════════════════════════════════════════
function formatJobCard(job, index) {
  const salaryLine = job.salary ? `💰 Salary: ${job.salary}\n` : '';
  const confidence = job.confidence || 0;
  let badge = confidence >= 50 ? '⭐ GREAT MATCH' : confidence >= 30 ? '👍 GOOD MATCH' : confidence >= 15 ? '🔹 POSSIBLE' : '👀 YOUR CALL';
  const title = (job.title || 'Untitled').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  const company = (job.company || 'Unknown').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  const source = (job.source || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  const desc = (job.description || '').substring(0, 200).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  const url = job.url || '';

  return (
    `${index}. ${badge} *${title}*\n` +
    `   🏢 ${company} | _${source}_\n` +
    `   💯 ${confidence}% match\n` +
    `${salaryLine ? '   ' + salaryLine : ''}` +
    `   📝 ${desc}...\n` +
    `   🔗 [Apply Here](${url})\n`
  );
}

function escapeMD(text) {
  return (text || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════
// SEND LONG MESSAGE (handles 4096 char limit)
// ═══════════════════════════════════════════════════════════
async function sendLong(chatId, text, options = {}) {
  if (text.length <= MAX_MESSAGE_LENGTH) {
    return bot.sendMessage(chatId, text, options);
  }
  const parts = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      parts.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n\n', MAX_MESSAGE_LENGTH);
    if (splitAt === -1 || splitAt < MAX_MESSAGE_LENGTH / 2)
      splitAt = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    if (splitAt === -1 || splitAt < MAX_MESSAGE_LENGTH / 2)
      splitAt = MAX_MESSAGE_LENGTH;
    parts.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt).trimStart();
  }
  for (let i = 0; i < parts.length; i++) {
    const opts = { ...options };
    if (i < parts.length - 1) opts.parse_mode = undefined;
    await bot.sendMessage(chatId, `📄 Part ${i + 1}/${parts.length}\n\n${parts[i]}`, opts);
  }
}

// ═══════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();

  // ── Handle file uploads (resume) ──
  if (msg.document && AWAITING_RESUME.has(chatId)) {
    await handleResumeUpload(msg, chatId);
    return;
  }

  // ── Handle commands ──
  if (text.startsWith('/')) {
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    switch (cmd) {
      case '/start': case '/menu': return cmdStart(msg);
      case '/help': return cmdHelp(msg);
      case '/ai': return cmdAI(msg);
      case '/jobs-ai': return cmdJobs(msg, 'ai', '🤖 AI/ML');
      case '/jobs-writing': return cmdJobs(msg, 'writing', '✍️ Content/Writing');
      case '/jobs-data': return cmdJobs(msg, 'data-annotation', '🏷️ Data Annotation');
      case '/jobs': case '/search': return cmdSearch(msg, args);
      case '/nigeria': return cmdNigeria(msg);
      case '/subscribe': return cmdSubscribe(msg);
      case '/unsubscribe': return cmdUnsubscribe(msg);
      case '/refresh': return cmdRefresh(msg);
      case '/feedback': return cmdFeedback(msg, args);
      case '/resume': return cmdResume(msg);
      case '/analyze': return cmdAnalyze(msg);
      case '/profile': return cmdProfile(msg, args);
      case '/interview': return cmdInterview(msg, args);
      case '/tailor': return cmdTailor(msg, args);
      default: return cmdUnknown(msg);
    }
  }

  // ── AI Chat Mode ──
  if (AI_MODE.has(chatId)) {
    bot.sendChatAction(chatId, 'typing');
    try {
      const response = await aiChat.chat(chatId, text);
      await bot.sendMessage(chatId, response, {
        parse_mode: 'Markdown',
        reply_markup: chatKeyboard()
      });
    } catch (err) {
      console.error('❌ AI Chat error:', err.message);
      await bot.sendMessage(chatId, '😕 Sorry, I had trouble responding.', {
        reply_markup: chatKeyboard()
      });
    }
    return;
  }

  // ── Generic non-command message ──
  await bot.sendMessage(chatId,
    `Hey! I'm *@Paiye_Bot* — your AI job match engine 🤖\n\n` +
    `💬 Type */ai* to chat with me about anything\n` +
    `🔍 Type */search* + what you want (e.g., "/search senior AI engineer remote")\n` +
    `📄 Type */resume* to upload & analyze your CV\n` +
    `📋 Type */start* to see all commands\n` +
    `🎯 Or use the buttons below!`,
    { parse_mode: 'Markdown', reply_markup: mainKeyboard() }
  );
});

// ═══════════════════════════════════════════════════════════
// CALLBACK QUERY HANDLER (inline keyboard buttons)
// ═══════════════════════════════════════════════════════════
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const msgId = query.message.message_id;

  await bot.answerCallbackQuery(query.id);

  // Create a fake message object for command handlers
  const fakeMsg = {
    chat: { id: chatId },
    from: query.from,
    text: '',
    message_id: msgId
  };

  switch (data) {
    case 'jobs_ai': return cmdJobs(fakeMsg, 'ai', '🤖 AI/ML');
    case 'jobs_writing': return cmdJobs(fakeMsg, 'writing', '✍️ Content/Writing');
    case 'jobs_data': return cmdJobs(fakeMsg, 'data-annotation', '🏷️ Data Annotation');
    case 'jobs_nigeria': return cmdNigeria(fakeMsg);
    case 'subscribe': return cmdSubscribe(fakeMsg);
    case 'refresh': return cmdRefresh(fakeMsg);
    case 'help': return cmdHelp(fakeMsg);
    case 'chat_ai':
      AI_MODE.add(chatId);
      aiChat.reset(chatId);
      return bot.sendMessage(chatId,
        '💬 *AI Chat Mode activated!*\n\nSend any message and I\'ll respond.\n_Type /start or /menu to exit._',
        { parse_mode: 'Markdown', reply_markup: chatKeyboard() });
    case 'resume': return cmdResume(fakeMsg);
    case 'analyze': return cmdAnalyze(fakeMsg);
    case 'upload_resume':
      AWAITING_RESUME.add(chatId);
      return bot.sendMessage(chatId,
        '📤 Send me your resume as a *PDF, DOCX, or TXT* file.\n\nJust attach and send the file!',
        { parse_mode: 'Markdown' });
    case 'main_menu':
      AI_MODE.delete(chatId);
      return cmdStart(fakeMsg);
  }
});

// ═══════════════════════════════════════════════════════════
// COMMAND: /start
// ═══════════════════════════════════════════════════════════
async function cmdStart(msg) {
  const chatId = msg.chat.id;
  const name = msg.from?.first_name || 'there';
  AI_MODE.delete(chatId);

  const hasResume = userData.hasResume(chatId);
  const extras = hasResume
    ? '\n📄 *Resume:* Stored and ready for analysis (/analyze)'
    : '\n📄 Upload your resume for ATS analysis (/resume)';

  await bot.sendMessage(chatId,
    `Hey ${escapeMD(name)}! 👋\n\n` +
    `I'm *@Paiye_Bot — your AI Career Agent* 🔥\n\n` +
    `I find *remote jobs* open to *Nigeria & worldwide*! 🌍\n\n` +
    `*What I can do:*\n` +
    `• 🔍 /search \\<query\\> — Natural language job search\n` +
    `• 🤖 /jobs\\-ai — AI/ML roles\n` +
    `• ✍️ /jobs\\-writing — Content/Writing roles\n` +
    `• 🏷️ /jobs\\-data — Data Annotation roles\n` +
    `• 📄 /resume — Upload & analyze your CV\n` +
    `• 💬 /ai — Chat with AI assistant\n` +
    `• 📥 /subscribe — 15 jobs daily at 7AM WAT\n` +
    `• 🇳🇬 /nigeria — Nigeria\\-friendly remote jobs\n` +
    `${extras}\n\n` +
    `🎯 _Targeting \\$50/hr or \\$10k/month+ roles!_`,
    { parse_mode: 'Markdown', reply_markup: mainKeyboard() }
  );
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /help
// ═══════════════════════════════════════════════════════════
async function cmdHelp(msg) {
  await bot.sendMessage(msg.chat.id,
    '📘 *@Paiye_Bot — Complete Guide*\n\n' +
    '*🔍 Job Search*\n' +
    '• /search \\<query\\> — Search in plain English (e.g., "senior ML engineer remote \\$150k")\n' +
    '• /jobs\\-ai — Top 5 AI/ML matches\n' +
    '• /jobs\\-data — Top 5 Data Annotation matches\n' +
    '• /jobs\\-writing — Top 5 Content/Writing matches\n' +
    '• /nigeria — Remote jobs open to Nigeria 🇳🇬\n' +
    '• /refresh — Force re\\-fetch all job sources\n\n' +
    '*📄 Resume & Career*\n' +
    '• /resume — Upload your resume for ATS analysis\n' +
    '• /analyze — Get AI feedback on your resume\n' +
    '• /interview \\<job\\-url\\> — Generate interview questions\n' +
    '• /tailor \\<job\\-url\\> — Tailor resume for a specific job\n' +
    '• /profile — Set up your job preferences\n\n' +
    '*💬 AI Chat*\n' +
    '• /ai — Chat with AI about anything (career, tech, casual)\n\n' +
    '*📥 Daily Delivery*\n' +
    '• /subscribe — Get 15 jobs every morning at 7AM WAT\n' +
    '• /unsubscribe — Stop daily jobs\n\n' +
    '*📊 Job Sources:* RemoteOK, WeWorkRemotely, Himalayas, Remotive, Arc.dev + more\n' +
    '*💰 Targets:* \\$50+/hr or \\$10k+/month (Data: \\$15+/hr)',
    { parse_mode: 'Markdown', reply_markup: mainKeyboard() }
  );
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /ai
// ═══════════════════════════════════════════════════════════
async function cmdAI(msg) {
  const chatId = msg.chat.id;
  AI_MODE.add(chatId);
  aiChat.reset(chatId);

  const hasResume = userData.hasResume(chatId);
  await bot.sendMessage(chatId,
    '💬 *AI Chat Mode activated!*\n\n' +
    'Chat with me about *anything* — jobs, career, tech, or casual.\n' +
    (hasResume ? '📄 I can also answer questions about your resume!\n' : '') +
    '_Type /start or /menu to exit._',
    { parse_mode: 'Markdown', reply_markup: chatKeyboard() }
  );
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /jobs-ai | /jobs-writing | /jobs-data
// ═══════════════════════════════════════════════════════════
async function cmdJobs(msg, profileId, label) {
  const chatId = msg.chat.id;
  const sentMsg = await bot.sendMessage(chatId,
    `🔍 Searching ${escapeMD(label)} jobs... *(cached 30min)*`);

  try {
    const results = await searchJobs(false);
    const jobs = (results[profileId]?.jobs || []).slice(0, MAX_JOBS_PER_CATEGORY);

    if (jobs.length === 0) {
      return bot.editMessageText(chatId, sentMsg.result?.message_id,
        '😕 No matches right now. Try /refresh to re\\-scan.', { parse_mode: 'Markdown' });
    }

    const cacheTag = jobCache.isFresh ? '📦' : '🔄';
    let message = `*${label} Jobs* ${cacheTag}\n\n`;
    jobs.forEach((j, i) => { message += formatJobCard(j, i + 1) + '\n'; });
    message += '📬 Subscribe for daily delivery: /subscribe';

    await bot.editMessageText(chatId, sentMsg.result?.message_id, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: mainKeyboard()
    });
  } catch (err) {
    console.error('❌ /jobs error:', err.message);
    await bot.sendMessage(chatId, '❌ Error searching jobs. Try again.');
  }
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /search <natural language query>
// ═══════════════════════════════════════════════════════════
async function cmdSearch(msg, query) {
  const chatId = msg.chat.id;

  if (!query) {
    return bot.sendMessage(chatId,
      '🔍 *Deep Search:* Tell me what you want!\n\n' +
      'Examples:\n' +
      '• `/search senior AI engineer remote`\n' +
      '• `/search writing jobs paying $80k+`\n' +
      '• `/search data annotation entry level`\n' +
      '• `/search react developer Nigeria friendly`',
      { parse_mode: 'Markdown' });
  }

  const sentMsg = await bot.sendMessage(chatId,
    `🔍 Searching for "*${escapeMD(query)}*"...`);

  try {
    const results = await searchJobs(false);

    // Collect all jobs across all profiles
    const allJobs = [];
    for (const profileId of ['ai', 'writing', 'data-annotation']) {
      if (results[profileId]?.jobs) {
        results[profileId].jobs.forEach(j => allJobs.push(j));
      }
    }

    // Use AI to rank results if available, otherwise simple keyword match
    let ranked;
    const queryLC = query.toLowerCase();

    // Simple keyword scoring as fallback
    ranked = allJobs
      .map(job => {
        const text = (job.title + ' ' + job.company + ' ' + (job.description || '') + ' ' + (job.tags || '')).toLowerCase();
        const queryWords = queryLC.split(/\s+/).filter(w => w.length > 2);
        let score = 0;
        for (const word of queryWords) {
          if (text.includes(word)) score += 10;
          if ((job.title || '').toLowerCase().includes(word)) score += 30;
          if ((job.tags || '').toLowerCase().includes(word)) score += 15;
        }
        // Seniority boost
        if (queryLC.includes('senior') && (job.title || '').toLowerCase().includes('senior')) score += 20;
        if (queryLC.includes('junior') && (job.title || '').toLowerCase().includes('junior')) score += 20;
        // Salary boost
        if (queryLC.includes('$') && job.salary) {
          const match = queryLC.match(/\$(\d+)/);
          if (match) {
            const targetSalary = parseInt(match[1]) * 1000;
            const salaryNums = job.salary.match(/\d+/g);
            if (salaryNums && parseInt(salaryNums[0]) >= targetSalary) score += 25;
          }
        }
        // Location boost
        if ((queryLC.includes('nigeria') || queryLC.includes('anywhere') || queryLC.includes('global'))
            && job.locationStatus !== 'restricted') score += 20;
        // Boost for remote queries
        if (queryLC.includes('remote') && job.location !== 'On-site') score += 10;

        return { ...job, searchScore: score };
      })
      .filter(j => j.searchScore > 0)
      .sort((a, b) => b.searchScore - a.searchScore)
      .slice(0, 8);

    if (ranked.length === 0) {
      return bot.editMessageText(chatId, sentMsg.result?.message_id,
        `😕 No matches for "${escapeMD(query)}". Try different keywords or /refresh for fresh data.`,
        { parse_mode: 'Markdown' });
    }

    userData.addSearchHistory(chatId, query);

    let message = `*🔍 Results for:* ${escapeMD(query)}\n`;
    message += `📊 ${ranked.length} matches found\n\n`;
    ranked.forEach((job, i) => {
      const badge = job.searchScore >= 50 ? '⭐' : job.searchScore >= 25 ? '👍' : '🔹';
      const title = (job.title || 'Untitled').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
      const company = (job.company || 'Unknown').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
      message += `${i + 1}. ${badge} *${title}*\n   🏢 ${company} | 💯 ${job.confidence || '?'}% match\n`;
      if (job.salary) message += `   💰 ${job.salary}\n`;
      message += `   🔗 ${job.url || 'N/A'}\n\n`;
    });
    message += '💡 _Use /subscribe for daily delivery!_';

    await bot.editMessageText(chatId, sentMsg.result?.message_id, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: mainKeyboard()
    });
  } catch (err) {
    console.error('❌ /search error:', err.message);
    await bot.sendMessage(chatId, '❌ Search failed. Try again.');
  }
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /nigeria
// ═══════════════════════════════════════════════════════════
async function cmdNigeria(msg) {
  const chatId = msg.chat.id;
  const sentMsg = await bot.sendMessage(chatId, '🇳🇬 Scanning for Nigeria-friendly remote jobs...');

  try {
    const results = await searchJobs(false);
    const allJobs = [];
    for (const profileId of ['ai', 'writing', 'data-annotation']) {
      if (results[profileId]?.jobs) {
        const label = profileId === 'ai' ? '🤖 AI/ML' : profileId === 'writing' ? '✍️ Writing' : '🏷️ Data';
        results[profileId].jobs.forEach(j => allJobs.push({ ...j, profileType: label }));
      }
    }

    const nigeriaJobs = allJobs
      .filter(j => j.locationStatus !== 'restricted' && (j.confidence || 0) >= 40)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 8);

    if (nigeriaJobs.length === 0) {
      return bot.editMessageText(chatId, sentMsg.result?.message_id,
        '😕 No Nigeria-friendly high-confidence matches. Try /refresh to re\\-scan.',
        { parse_mode: 'Markdown' });
    }

    let message = '🇳🇬 *Top Remote Jobs (Open to Nigeria)* 🌍\n\n';
    nigeriaJobs.forEach((job, i) => {
      const conf = job.confidence || 0;
      const bar = conf >= 70 ? '🟢' : conf >= 50 ? '🟡' : '🔴';
      const title = (job.title || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
      const company = (job.company || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
      message += `${i + 1}. ${bar} *${title}*\n   🏢 ${company} | ${conf}% | ${job.profileType}\n`;
      if (job.salary) message += `   💰 ${job.salary}\n`;
      message += `   🔗 ${job.url || 'N/A'}\n\n`;
    });
    message += '💡 _Scored by resume match + geography_';

    await bot.editMessageText(chatId, sentMsg.result?.message_id, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: mainKeyboard()
    });
  } catch (err) {
    console.error('❌ /nigeria error:', err.message);
    await bot.sendMessage(chatId, '❌ Error searching. Try again.');
  }
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /subscribe
// ═══════════════════════════════════════════════════════════
async function cmdSubscribe(msg) {
  const chatId = String(msg.chat.id);
  SUBSCRIBERS.set(chatId, { subscribed: true, since: new Date().toISOString() });
  saveSubDebounced();
  await bot.sendMessage(chatId,
    '✅ *You\'re subscribed!* 🎉\n\n' +
    '📥 Every morning at *7:00 AM (WAT)*:\n' +
    '• 🤖 5 AI/ML matches\n' +
    '• ✍️ 5 Writing matches\n' +
    '• 🏷️ 5 Data Annotation matches\n\n' +
    'Use /unsubscribe to stop anytime.',
    { parse_mode: 'Markdown', reply_markup: mainKeyboard() }
  );
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /unsubscribe
// ═══════════════════════════════════════════════════════════
async function cmdUnsubscribe(msg) {
  const chatId = String(msg.chat.id);
  SUBSCRIBERS.delete(chatId);
  saveSubDebounced();
  await bot.sendMessage(chatId,
    '⏸️ Unsubscribed from daily jobs.\n\nUse /subscribe to re\\-subscribe anytime!',
    { parse_mode: 'Markdown', reply_markup: mainKeyboard() }
  );
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /refresh
// ═══════════════════════════════════════════════════════════
async function cmdRefresh(msg) {
  const chatId = msg.chat.id;
  const sentMsg = await bot.sendMessage(chatId, '🔄 Refreshing all job sources... *(~15s)*');

  try {
    const results = await jobCache.forceRefresh(rawSearchJobs);
    const counts = {
      ai: results['ai']?.jobs?.length || 0,
      writing: results['writing']?.jobs?.length || 0,
      data: results['data-annotation']?.jobs?.length || 0
    };

    await bot.editMessageText(chatId, sentMsg.result?.message_id,
      '✅ *Refresh complete!*\n\n' +
      `• 🤖 AI/ML: ${counts.ai} scored\n` +
      `• ✍️ Writing: ${counts.writing} scored\n` +
      `• 🏷️ Data: ${counts.data} scored\n\n` +
      'Use /search or job buttons to explore!',
      { parse_mode: 'Markdown', reply_markup: mainKeyboard() }
    );
  } catch (err) {
    await bot.sendMessage(chatId, '❌ Refresh failed. Try again.');
  }
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /feedback
// ═══════════════════════════════════════════════════════════
async function cmdFeedback(msg, text) {
  const chatId = msg.chat.id;
  if (!text) {
    return bot.sendMessage(chatId,
      '📝 Send feedback like:\n`/feedback I want more senior AI roles`',
      { parse_mode: 'Markdown' });
  }
  try {
    fs.appendFileSync(path.join(__dirname, 'feedback.log'),
      `[${new Date().toISOString()}] ${chatId}: ${text}\n`);
  } catch (_) {}
  await bot.sendMessage(chatId,
    `✅ Thanks! I've noted: "${escapeMD(text)}"\n\nMy operator will review this. 🎯`,
    { parse_mode: 'Markdown' });
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /resume — Upload or view resume status
// ═══════════════════════════════════════════════════════════
async function cmdResume(msg) {
  const chatId = msg.chat.id;
  const hasResume = userData.hasResume(chatId);
  const resume = userData.getResume(chatId);

  let text = '📄 *Resume Manager*\n\n';
  if (hasResume) {
    const fileName = resume.fileName || 'Unknown';
    const chars = resume.text?.length || 0;
    text += `✅ Resume stored: *${escapeMD(fileName)}* (${chars} chars)\n\n`;
    text += '• /analyze — Get ATS optimization feedback\n';
    text += '• /search — Search jobs matching your profile\n';
    text += '• /interview \\<url\\> — Practice for a specific role\n\n';
    text += 'Want to upload a new one? Hit the button below! 📤';
  } else {
    text += '❌ No resume uploaded yet.\n\nUpload your resume and I\'ll:\n' +
      '• Check ATS optimization 🎯\n' +
      '• Find jobs matching your skills 🔍\n' +
      '• Suggest improvements 💡\n\n' +
      'Click "Upload Resume" to send your CV!';
  }

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: resumeKeyboard(hasResume)
  });
}

// ═══════════════════════════════════════════════════════════
// Handle Resume File Upload
// ═══════════════════════════════════════════════════════════
async function handleResumeUpload(msg, chatId) {
  AWAITING_RESUME.delete(chatId);
  await bot.sendMessage(chatId, '📄 Processing your resume...');

  try {
    const fileId = msg.document.file_id;
    const fileName = msg.document.file_name || 'resume.pdf';
    const localPath = await bot.downloadFile(fileId, UPLOADS_DIR);
    const parsed = await parseResume(localPath, fileName);
    cleanupFile(localPath);

    userData.setResume(chatId, {
      text: parsed.text,
      fileName: parsed.fileName,
      fileType: parsed.fileType
    });

    const charCount = parsed.text.length;
    await bot.sendMessage(chatId,
      `✅ *Resume saved!* 📄\n\n` +
      `📄 ${escapeMD(parsed.fileName)}\n` +
      `📝 ${charCount} characters extracted\n\n` +
      `What's next?\n` +
      `• /analyze — Check ATS optimization 🎯\n` +
      `• /search — Find jobs matching your skills 🔍\n` +
      `• /profile — Set up your job preferences\n` +
      `• Just chat in /ai mode about your career! 💬`,
      { parse_mode: 'Markdown', reply_markup: mainKeyboard() }
    );
  } catch (err) {
    console.error('❌ Resume upload error:', err.message);
    await bot.sendMessage(chatId,
      '❌ Sorry, I couldn\'t process that file. Try sending a PDF, DOCX, or TXT file.',
      { reply_markup: mainKeyboard() }
    );
  }
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /analyze — ATS Resume Analysis
// ═══════════════════════════════════════════════════════════
async function cmdAnalyze(msg) {
  const chatId = msg.chat.id;

  if (!userData.hasResume(chatId)) {
    AWAITING_RESUME.add(chatId);
    return bot.sendMessage(chatId,
      '📤 No resume found! Send me your resume as a *PDF, DOCX, or TXT* file.\n\n' +
      'Just attach and send the file!',
      { parse_mode: 'Markdown' });
  }

  if (!aiChat.ready) {
    return bot.sendMessage(chatId,
      '🤖 AI analysis requires an AI API key. Configure Groq/Anthropic/OpenAI in .env',
      { reply_markup: mainKeyboard() });
  }

  const resume = userData.getResume(chatId);
  const sentMsg = await bot.sendMessage(chatId, '🔍 Analyzing your resume with AI... *(~15s)*');
  bot.sendChatAction(chatId, 'typing');

  try {
    const prompt =
      'You are an expert ATS (Applicant Tracking System) resume reviewer. ' +
      'Analyze this resume and provide feedback in this format:\n\n' +
      '📊 *ATS Score: X/100*\n\n' +
      '*✅ Strengths*\n• [list 2-3 strengths]\n\n' +
      '*⚠️ Issues Found*\n• [list specific issues: formatting, keywords, bullet points]\n\n' +
      '*📋 Missing Keywords*\n• [suggest 5-10 keywords relevant to this profile]\n\n' +
      '*💡 Recommendations*\n• [3-5 actionable improvements]\n\n' +
      '*🎯 Best Roles*\n• [3 roles this resume fits best]\n\n' +
      'Be specific and constructive. Base everything on the actual resume text.\n\n' +
      'RESUME TEXT:\n```\n' + resume.text + '\n```';

    const analysis = await aiChat.chat(chatId + '-analysis', prompt);
    await bot.editMessageText(chatId, sentMsg.result?.message_id, analysis, {
      parse_mode: 'Markdown',
      reply_markup: mainKeyboard()
    });
  } catch (err) {
    console.error('❌ Analyze error:', err.message);
    await bot.sendMessage(chatId, '❌ Analysis failed. Try again later.', {
      reply_markup: mainKeyboard()
    });
  }
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /profile
// ═══════════════════════════════════════════════════════════
async function cmdProfile(msg, args) {
  const chatId = msg.chat.id;
  const profile = userData.getProfile(chatId);
  const resume = userData.getResume(chatId);

  if (!profile) {
    // Auto-create profile from resume if available
    if (resume) {
      userData.setProfile(chatId, {
        source: 'auto-from-resume',
        skills: [],
        targetRoles: [],
        minSalary: 50000,
        updatedAt: new Date().toISOString()
      });
    }
  }

  const p = userData.getProfile(chatId);
  let text = '👤 *Your Profile*\n\n';

  if (p) {
    text += `🎯 Target Roles: ${p.targetRoles?.length ? p.targetRoles.join(', ') : 'Not set'}\n`;
    text += `💡 Skills: ${p.skills?.length ? p.skills.join(', ') : 'Not set'}\n`;
    text += `💰 Min Salary: $${p.minSalary || 'Not set'}/yr\n`;
    text += `📄 Resume: ${resume ? '✅ Loaded' : '❌ Not uploaded'}\n`;
    text += `🔍 Recent searches: ${(userData.getSearchHistory(chatId).length || 0)}\n\n`;
    text += 'Use /search to find matching jobs!';
  } else {
    text += 'No profile yet.\nUpload your resume (/resume) and I\'ll auto-detect your profile!';
  }

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: mainKeyboard()
  });
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /interview <job-url>
// ═══════════════════════════════════════════════════════════
async function cmdInterview(msg, url) {
  const chatId = msg.chat.id;

  if (!url) {
    return bot.sendMessage(chatId,
      '🎯 *Interview Practice*\n\nSend a job URL to get custom interview questions:\n' +
      '`/interview https://remoteok.com/remote-jobs/some-job`\n\n' +
      'I\'ll generate questions based on the role!',
      { parse_mode: 'Markdown' });
  }

  if (!aiChat.ready) {
    return bot.sendMessage(chatId,
      '🤖 AI interview prep requires an AI API key. Configure in .env',
      { reply_markup: mainKeyboard() });
  }

  const sentMsg = await bot.sendMessage(chatId, '🎯 Generating interview questions...');
  bot.sendChatAction(chatId, 'typing');

  try {
    const prompt =
      'You are an expert interview coach. For the job at this URL, generate:\n\n' +
      '1️⃣ *5 Technical Questions* (role-specific)\n' +
      '2️⃣ *5 Behavioral Questions* (STAR method)\n' +
      '3️⃣ *3 Questions to Ask the Interviewer*\n' +
      '4️⃣ *Key Topics to Research* before the interview\n\n' +
      'Job URL: ' + url + '\n\n' +
      'Make questions specific to the role. Include brief answer tips.';

    const questions = await aiChat.chat(chatId + '-interview', prompt);

    await bot.editMessageText(chatId, sentMsg.result?.message_id,
      `🎯 *Interview Prep*\n🔗 ${url}\n\n${questions}`,
      { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (err) {
    console.error('❌ Interview error:', err.message);
    await bot.sendMessage(chatId, '❌ Failed to generate questions. Try again.', {
      reply_markup: mainKeyboard()
    });
  }
}

// ═══════════════════════════════════════════════════════════
// COMMAND: /tailor <job-url>
// ═══════════════════════════════════════════════════════════
async function cmdTailor(msg, url) {
  const chatId = msg.chat.id;

  if (!url) {
    return bot.sendMessage(chatId,
      '✂️ *Resume Tailoring*\n\nSend a job URL to tailor your resume:\n' +
      '`/tailor https://remoteok.com/remote-jobs/some-job`\n\n' +
      'I\'ll suggest how to customize your resume for that role!',
      { parse_mode: 'Markdown' });
  }

  if (!userData.hasResume(chatId)) {
    return bot.sendMessage(chatId,
      '📄 I need your resume first! Use /resume to upload it.',
      { reply_markup: mainKeyboard() });
  }

  if (!aiChat.ready) {
    return bot.sendMessage(chatId,
      '🤖 AI tailoring requires an AI API key.', { reply_markup: mainKeyboard() });
  }

  const resume = userData.getResume(chatId);
  const sentMsg = await bot.sendMessage(chatId, '✂️ Tailoring your resume for this role...');
  bot.sendChatAction(chatId, 'typing');

  try {
    const prompt =
      'You are a professional resume writer. Given this resume and job URL, ' +
      'suggest how to tailor the resume for this specific role.\n\n' +
      'Format:\n' +
      '🎯 *Role Match Analysis*\n\n' +
      '*Key Skills to Highlight*\n• [list]\n\n' +
      '*Resume Changes*\n• [specific rewrites for each section]\n\n' +
      '*Keywords to Add*\n• [from job description]\n\n' +
      '*Suggested Summary/Cover Letter*\n[2-3 sentence pitch]\n\n' +
      'Job URL: ' + url + '\n\n' +
      'RESUME:\n```\n' + resume.text + '\n```';

    const tailored = await aiChat.chat(chatId + '-tailor', prompt);
    await bot.editMessageText(chatId, sentMsg.result?.message_id,
      `✂️ *Resume Tailoring*\n🔗 ${url}\n\n${tailored}`,
      { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (err) {
    console.error('❌ Tailor error:', err.message);
    await bot.sendMessage(chatId, '❌ Failed to tailor resume. Try again.', {
      reply_markup: mainKeyboard()
    });
  }
}

// ═══════════════════════════════════════════════════════════
// COMMAND: Unknown
// ═══════════════════════════════════════════════════════════
async function cmdUnknown(msg) {
  await bot.sendMessage(msg.chat.id,
    '🤔 Unknown command. Type /start to see what I can do!',
    { reply_markup: mainKeyboard() });
}

// ═══════════════════════════════════════════════════════════
// DAILY JOB PUSH (7:00 AM WAT)
// ═══════════════════════════════════════════════════════════
cron.schedule('0 7 * * *', async () => {
  console.log('⏰ Running daily job push...');
  if (SUBSCRIBERS.size === 0) return console.log('📭 No subscribers.');

  try {
    const results = await jobCache.forceRefresh(rawSearchJobs);

    for (const [chatId] of SUBSCRIBERS) {
      try {
        const aiJobs = (results['ai']?.jobs || []).slice(0, 5);
        const dataJobs = (results['data-annotation']?.jobs || []).slice(0, 5);
        const writingJobs = (results['writing']?.jobs || []).slice(0, 5);

        let message = '🌅 *Good Morning! Here are your daily matches* ☕\n\n';
        if (aiJobs.length > 0) {
          message += '*🤖 AI/ML Jobs*\n';
          aiJobs.forEach((j, i) => { message += formatJobCard(j, i + 1) + '\n'; });
        }
        if (dataJobs.length > 0) {
          message += '*🏷️ Data Annotation Jobs*\n';
          dataJobs.forEach((j, i) => { message += formatJobCard(j, i + 1) + '\n'; });
        }
        if (writingJobs.length > 0) {
          message += '*✍️ Content Jobs*\n';
          writingJobs.forEach((j, i) => { message += formatJobCard(j, i + 1) + '\n'; });
        }
        if (aiJobs.length === 0 && writingJobs.length === 0 && dataJobs.length === 0) {
          message += '😕 No matches today. Try /refresh.';
        }
        message += '\n💡 Use /search for custom queries!';

        await sendLong(chatId, message, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });
        console.log(`✅ Daily jobs sent to ${chatId}`);
      } catch (err) {
        console.error(`❌ Failed to send to ${chatId}:`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Daily push failed:', err.message);
  }
});

// ═══════════════════════════════════════════════════════════
// START THE BOT
// ═══════════════════════════════════════════════════════════
async function main() {
  // Start polling
  await bot.start();

  console.log('');
  console.log('🤖 @Paiye_Bot — AI Career Agent v3 is LIVE!');
  console.log('⏰ Daily job delivery: 7:00 AM WAT');
  console.log('📦 Cache TTL: 30 minutes');
  console.log(`📂 ${SUBSCRIBERS.size} subscriber(s)`);
  console.log(`🤖 AI Chat: ${aiChat.ready ? `ACTIVE (${aiChat.provider})` : 'DISABLED'}`);
  console.log('✅ All commands active');
  console.log('');

  // Warm cache in background
  console.log('🔥 Warming job cache...');
  jobCache.forceRefresh(rawSearchJobs).then(r => {
    const total = (r['ai']?.jobs?.length || 0) + (r['writing']?.jobs?.length || 0) + (r['data-annotation']?.jobs?.length || 0);
    console.log(`✅ Cache warmed: ${total} scored jobs ready`);
  }).catch(err => {
    console.log(`⚠️ Cache warm: ${err.message}`);
  });

  // Auto-save subscribers every 5 min
  setInterval(() => {
    if (SUBSCRIBERS.size > 0) saveSubscribers(SUBSCRIBERS);
  }, 5 * 60 * 1000);

  // Log cache stats every 15 min
  setInterval(() => {
    if (jobCache.age >= 0) {
      console.log(`📊 Cache: ${jobCache.age}s old, ${jobCache.isFresh ? 'fresh' : 'stale'}`);
    }
  }, 15 * 60 * 1000);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
