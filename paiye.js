// ============================================================
// 🤖 Paiye v4 — AI Career Agent
//    Simple UI • Powerful Backend • 6 Job Sources
// ============================================================

require('dotenv').config();
const TelegramClient = require('./telegramClient');
const { megaSearch } = require('./jobMcp');
const { qaPipeline, extractSkillsFromResume, generateAtsAdvice, getJobAge } = require('./jobQa');
const AIChat = require('./aiChat');
const userData = require('./userData');
const { parseResume, cleanupFile, UPLOADS_DIR } = require('./resumeParser');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// ─── Config ───
const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) { console.error('❌ Missing TELEGRAM_TOKEN'); process.exit(1); }

const DEFAULT_LIMIT = 5;
const MAX_MSG = 4000;
const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');

// ─── Init ───
const bot = new TelegramClient(TOKEN);
const aiChat = new AIChat();
const AI_MODE = new Set();
const AWAITING_RESUME = new Set();
let SUBSCRIBERS = loadSubscribers();

// ─── Helpers ───
function esc(t) { return (t || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&'); }
function strip(t) { return (t || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 150); }

function loadSubscribers() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      return new Map(Object.entries(JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'))));
    }
  } catch {}
  return new Map();
}

function saveSubscribers() {
  const obj = {};
  for (const [k, v] of SUBSCRIBERS) obj[k] = v;
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(obj, null, 2));
}

// ─── Job Card (clean & simple) ───
function jobCard(job, i) {
  const score = job.score || 50;
  const icon = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔵';
  const salary = job.salary ? `\n   💰 ${esc(job.salary)}` : '';
  return (
    `${i}. ${icon} *${esc(job.title)}*\n` +
    `   🏢 ${esc(job.company)}\n` +
    `   📍 ${esc(job.location)}${salary}\n` +
    `   🔗 [Apply](${job.url})`
  );
}

// ─── Main Keyboard ───
function mainKb() {
  return {
    inline_keyboard: [
      [{ text: '🔍 Find Job', callback_data: 'find_prompt' }, { text: '🌍 Remote', callback_data: 'remote' }],
      [{ text: '🇳🇬 Nigeria', callback_data: 'nigeria' }, { text: '🔥 Trending', callback_data: 'trending' }],
      [{ text: '📄 Resume', callback_data: 'resume' }, { text: '💬 AI Chat', callback_data: 'chat_ai' }],
      [{ text: '📥 Subscribe', callback_data: 'subscribe' }, { text: '❓ Help', callback_data: 'help' }],
    ]
  };
}

// ═══════════════════════════════════════════════════════════
// COMMANDS
// ═══════════════════════════════════════════════════════════

// /start
async function cmdStart(msg) {
  const name = msg.from?.first_name || 'there';
  AI_MODE.delete(msg.chat.id);
  await bot.sendMessage(msg.chat.id,
    `Hey ${esc(name)}! 👋\n\n` +
    `I'm *Paiye* — your AI Career Agent 🔥\n\n` +
    `Tell me what job you want, I'll find it!\n\n` +
    `• /find react developer — search any job\n` +
    `• /remote — remote jobs\n` +
    `• /nigeria — jobs for Nigeria 🇳🇬\n` +
    `• /trending — hot jobs now 🔥\n` +
    `• /resume — upload your CV\n` +
    `• /ai — chat with AI`,
    { parse_mode: 'Markdown', reply_markup: mainKb() }
  );
}

// /help
async function cmdHelp(msg) {
  await bot.sendMessage(msg.chat.id,
    `📘 *Paiye Commands*\n\n` +
    `*Find Jobs*\n` +
    `• /find <query> — find any job\n` +
    `• /find react developer --10 — get 10 results\n` +
    `• /remote — remote jobs\n` +
    `• /nigeria — Nigeria jobs\n` +
    `• /trending — hot jobs\n\n` +
    `*Career Tools*\n` +
    `• /resume — upload CV\n` +
    `• /analyze — ATS check\n` +
    `• /advice <#> — ATS tips for a job\n` +
    `• /ai — chat AI\n` +
    `• /subscribe — daily jobs`,
    { parse_mode: 'Markdown', reply_markup: mainKb() }
  );
}

// /find <query> — THE main command (with QA pipeline)
async function cmdFind(msg, args) {
  const chatId = msg.chat.id;
  
  if (!args) {
    return bot.sendMessage(chatId,
      `🔍 *What job do you want?*\n\n` +
      `Examples:\n` +
    `• /find react developer\n` +
    `• /find data scientist remote\n` +
    `• /find product manager Lagos\n` +
    `• /find AI engineer --10`,
      { parse_mode: 'Markdown' }
    );
  }
  
  // Parse limit
  let limit = DEFAULT_LIMIT;
  let query = args;
  const m = args.match(/--(\d+)/);
  if (m) { limit = Math.min(parseInt(m[1]), 20); query = args.replace(/--\d+/, '').trim(); }
  
  // Get user skills from resume if available
  const resume = userData.getResume(chatId);
  let userSkills = [];
  if (resume?.text) {
    const extracted = extractSkillsFromResume(resume.text);
    userSkills = extracted.all;
  }
  
  const sent = await bot.sendMessage(chatId, `🔍 Searching *${esc(query)}*...`, { parse_mode: 'Markdown' });
  bot.sendChatAction(chatId, 'typing');
  
  try {
    // Search from multiple sources (get extra for QA filtering)
    const rawJobs = await megaSearch(query, { limit: limit + 5 });
    
    // Run QA pipeline
    const jobs = await qaPipeline(rawJobs, {
      maxAge: 7,
      verifyLinks: false,
      userSkills,
      resumeText: resume?.text || '',
    });
    
    if (!jobs.length) {
      return bot.editMessageText(chatId, sent.result?.message_id,
        `😕 No fresh jobs for *${esc(query)}*\n\nTry:\n• Simpler keywords\n• /trending for hot jobs\n• /remote for remote jobs`,
        { parse_mode: 'Markdown' }
      );
    }
    
    // Build message with match scores
    let msg = `🎯 *${esc(query)}* — ${jobs.length} fresh jobs\n\n`;
    jobs.slice(0, limit).forEach((j, i) => {
      const matchIcon = j.matchScore >= 80 ? '🟢' : j.matchScore >= 60 ? '🟡' : '🔵';
      const age = getJobAge(j);
      msg += `${i + 1}. ${matchIcon} *${esc(j.title)}*\n`;
      msg += `   🏢 ${esc(j.company)}\n`;
      msg += `   📍 ${esc(j.location)} · 💯 ${j.matchScore}% match\n`;
      if (j.salary) msg += `   💰 ${esc(j.salary)}\n`;
      msg += `   📅 ${age} · 🔗 [Apply](${j.url})\n\n`;
    });
    
    msg += `_💡 /advice <number> for ATS tips · /find <query> --10 for more_`;
    
    await bot.editMessageText(chatId, sent.result?.message_id, msg, {
      parse_mode: 'Markdown', disable_web_page_preview: true
    });
  } catch (err) {
    console.error('❌ /find:', err.message);
    await bot.editMessageText(chatId, sent.result?.message_id, '❌ Try again in a moment.');
  }
}

// /remote
async function cmdRemote(msg) {
  const chatId = msg.chat.id;
  const sent = await bot.sendMessage(chatId, '🌍 Finding remote jobs...');
  bot.sendChatAction(chatId, 'typing');
  
  try {
    const jobs = await megaSearch('remote', { limit: DEFAULT_LIMIT });
    let m = '🌍 *Remote Jobs*\n\n';
    jobs.forEach((j, i) => { m += jobCard(j, i + 1) + '\n\n'; });
    await bot.editMessageText(chatId, sent.result?.message_id, m, {
      parse_mode: 'Markdown', disable_web_page_preview: true
    });
  } catch (err) {
    await bot.editMessageText(chatId, sent.result?.message_id, '❌ Try again.');
  }
}

// /nigeria
async function cmdNigeria(msg) {
  const chatId = msg.chat.id;
  const sent = await bot.sendMessage(chatId, '🇳🇬 Finding Nigeria-friendly jobs...');
  bot.sendChatAction(chatId, 'typing');
  
  try {
    const jobs = await megaSearch('remote africa', { limit: DEFAULT_LIMIT });
    const ng = jobs.filter(j => {
      const loc = (j.location || '').toLowerCase();
      return loc.includes('remote') || loc.includes('africa') || loc.includes('nigeria') || loc.includes('worldwide');
    });
    
    const display = ng.length ? ng : jobs;
    let m = '🇳🇬 *Nigeria-Friendly Jobs*\n\n';
    display.slice(0, DEFAULT_LIMIT).forEach((j, i) => { m += jobCard(j, i + 1) + '\n\n'; });
    m += '_Open to applicants worldwide including Nigeria_';
    
    await bot.editMessageText(chatId, sent.result?.message_id, m, {
      parse_mode: 'Markdown', disable_web_page_preview: true
    });
  } catch (err) {
    await bot.editMessageText(chatId, sent.result?.message_id, '❌ Try again.');
  }
}

// /trending
async function cmdTrending(msg) {
  const chatId = msg.chat.id;
  const sent = await bot.sendMessage(chatId, '🔥 Finding trending jobs...');
  bot.sendChatAction(chatId, 'typing');
  
  try {
    const queries = ['AI engineer', 'react developer', 'product manager', 'data scientist'];
    const allJobs = [];
    for (const q of queries.slice(0, 2)) {
      allJobs.push(...await megaSearch(q, { limit: 2 }));
    }
    const seen = new Set();
    const unique = allJobs.filter(j => {
      const k = `${j.title}|${j.company}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    
    let m = '🔥 *Trending Jobs*\n\n';
    unique.slice(0, DEFAULT_LIMIT).forEach((j, i) => { m += jobCard(j, i + 1) + '\n\n'; });
    await bot.editMessageText(chatId, sent.result?.message_id, m, {
      parse_mode: 'Markdown', disable_web_page_preview: true
    });
  } catch (err) {
    await bot.editMessageText(chatId, sent.result?.message_id, '❌ Try again.');
  }
}

// /subscribe
async function cmdSubscribe(msg) {
  const chatId = String(msg.chat.id);
  SUBSCRIBERS.set(chatId, { since: new Date().toISOString() });
  saveSubscribers();
  await bot.sendMessage(chatId,
    `✅ *Subscribed!*\n\n📥 Daily jobs at *7AM WAT*\n• 5 AI/ML\n• 5 Writing\n• 5 Data\n\n/unsubscribe to stop`,
    { parse_mode: 'Markdown', reply_markup: mainKb() }
  );
}

// /unsubscribe
async function cmdUnsubscribe(msg) {
  SUBSCRIBERS.delete(String(msg.chat.id));
  saveSubscribers();
  await bot.sendMessage(msg.chat.id, '⏸️ Unsubscribed. /subscribe to re-join.', { reply_markup: mainKb() });
}

// /advice <number> — ATS advice for a job
async function cmdAdvice(msg, args) {
  const chatId = msg.chat.id;
  
  if (!args) {
    return bot.sendMessage(chatId,
      '📋 *ATS Advice*\n\nUsage: `/advice 1`\n\nFirst search for jobs with /find, then ask for advice on any job!',
      { parse_mode: 'Markdown' }
    );
  }
  
  if (!userData.hasResume(chatId)) {
    return bot.sendMessage(chatId,
      '📄 Upload your resume first for personalized advice!\n\n/resume',
      { parse_mode: 'Markdown', reply_markup: mainKb() }
    );
  }
  
  // Get the job index (1-based)
  const jobIndex = parseInt(args) - 1;
  if (isNaN(jobIndex) || jobIndex < 0) {
    return bot.sendMessage(chatId, '❌ Use a number: /advice 1', { parse_mode: 'Markdown' });
  }
  
  // For now, we'll search again and get the job
  // In production, you'd cache the last search results
  const sent = await bot.sendMessage(chatId, '📋 Generating ATS advice...');
  bot.sendChatAction(chatId, 'typing');
  
  try {
    const resume = userData.getResume(chatId);
    const skills = extractSkillsFromResume(resume.text);
    
    // Re-search to get the job (in production, cache this)
    const jobs = await megaSearch('remote', { limit: 20 });
    const processed = await qaPipeline(jobs, { userSkills: skills.all, maxAge: 7 });
    
    if (jobIndex >= processed.length) {
      return bot.editMessageText(chatId, sent.result?.message_id,
        `❌ Job #${jobIndex + 1} not found. Only ${processed.length} jobs available.`,
        { parse_mode: 'Markdown' }
      );
    }
    
    const job = processed[jobIndex];
    const advice = generateAtsAdvice(job, job.matchDetails, resume.text);
    
    await bot.editMessageText(chatId, sent.result?.message_id, advice, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error('❌ /advice:', err.message);
    await bot.editMessageText(chatId, sent.result?.message_id, '❌ Could not generate advice.');
  }
}

// /resume
async function cmdResume(msg) {
  const chatId = msg.chat.id;
  const has = userData.hasResume(chatId);
  
  if (has) {
    const r = userData.getResume(chatId);
    await bot.sendMessage(chatId,
      `📄 *Resume Ready*\n\n✅ ${esc(r.fileName)} (${r.text.length} chars)\n\n• /analyze — ATS check\n• /advice <#> — ATS tips\n• /find — search matching jobs`,
      { parse_mode: 'Markdown', reply_markup: mainKb() }
    );
  } else {
    AWAITING_RESUME.add(chatId);
    await bot.sendMessage(chatId,
      '📤 *Send your resume*\n\nPDF, DOCX, or TXT — just attach and send!',
      { parse_mode: 'Markdown' }
    );
  }
}

// /analyze
async function cmdAnalyze(msg) {
  const chatId = msg.chat.id;
  if (!userData.hasResume(chatId)) {
    return bot.sendMessage(chatId, '📄 Upload your resume first! /resume', { reply_markup: mainKb() });
  }
  if (!aiChat.ready) {
    return bot.sendMessage(chatId, '🤖 AI needs an API key. Set GROQ_API_KEY in .env', { reply_markup: mainKb() });
  }
  
  const resume = userData.getResume(chatId);
  const sent = await bot.sendMessage(chatId, '🔍 Analyzing your resume...');
  bot.sendChatAction(chatId, 'typing');
  
  try {
    const prompt = `Analyze this resume for ATS. Give:\n1. ATS Score (0-100)\n2. Top 3 strengths\n3. Top 3 issues\n4. Missing keywords (5-10)\n5. Best roles for this profile\n\nResume:\n${resume.text}`;
    const analysis = await aiChat.chat(chatId + '-ats', prompt);
    await bot.editMessageText(chatId, sent.result?.message_id, analysis, { parse_mode: 'Markdown', reply_markup: mainKb() });
  } catch (err) {
    await bot.editMessageText(chatId, sent.result?.message_id, '❌ Analysis failed.');
  }
}

// /ai
async function cmdAI(msg) {
  const chatId = msg.chat.id;
  AI_MODE.add(chatId);
  aiChat.reset(chatId);
  await bot.sendMessage(chatId,
    '💬 *AI Chat Mode*\n\nAsk me anything about careers, jobs, or tech.\n/start to exit.',
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Menu', callback_data: 'main_menu' }]] } }
  );
}

// /profile
async function cmdProfile(msg) {
  const chatId = msg.chat.id;
  const p = userData.getProfile(chatId);
  const has = userData.hasResume(chatId);
  
  let text = '👤 *Your Profile*\n\n';
  if (p) {
    text += `🎯 Roles: ${p.targetRoles?.length ? p.targetRoles.join(', ') : 'Not set'}\n`;
    text += `💡 Skills: ${p.skills?.length ? p.skills.join(', ') : 'Not set'}\n`;
    text += `📄 Resume: ${has ? '✅' : '❌'}`;
  } else {
    text += has ? '📄 Resume uploaded! Use /find to search.' : 'No profile yet. Upload resume: /resume';
  }
  
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: mainKb() });
}

// /interview <url>
async function cmdInterview(msg, url) {
  const chatId = msg.chat.id;
  if (!url) return bot.sendMessage(chatId, '🎯 /interview <job-url>', { parse_mode: 'Markdown' });
  if (!aiChat.ready) return bot.sendMessage(chatId, '🤖 AI needs API key.', { reply_markup: mainKb() });
  
  const sent = await bot.sendMessage(chatId, '🎯 Generating interview questions...');
  bot.sendChatAction(chatId, 'typing');
  
  try {
    const prompt = `Generate interview prep for this job: ${url}\n\nInclude:\n1. 5 Technical Questions\n2. 5 Behavioral Questions (STAR)\n3. 3 Questions to Ask\n4. Key Topics to Research`;
    const prep = await aiChat.chat(chatId + '-interview', prompt);
    await bot.editMessageText(chatId, sent.result?.message_id, `🎯 *Interview Prep*\n🔗 ${url}\n\n${prep}`, {
      parse_mode: 'Markdown', disable_web_page_preview: true
    });
  } catch (err) {
    await bot.editMessageText(chatId, sent.result?.message_id, '❌ Failed.');
  }
}

// /tailor <url>
async function cmdTailor(msg, url) {
  const chatId = msg.chat.id;
  if (!url) return bot.sendMessage(chatId, '✂️ /tailor <job-url>', { parse_mode: 'Markdown' });
  if (!userData.hasResume(chatId)) return bot.sendMessage(chatId, '📄 Upload resume first! /resume', { reply_markup: mainKb() });
  if (!aiChat.ready) return bot.sendMessage(chatId, '🤖 AI needs API key.', { reply_markup: mainKb() });
  
  const resume = userData.getResume(chatId);
  const sent = await bot.sendMessage(chatId, '✂️ Tailoring your resume...');
  bot.sendChatAction(chatId, 'typing');
  
  try {
    const prompt = `Tailor this resume for: ${url}\n\nInclude:\n1. Skills to highlight\n2. Resume changes\n3. Keywords to add\n4. Suggested summary\n\nResume:\n${resume.text}`;
    const tailored = await aiChat.chat(chatId + '-tailor', prompt);
    await bot.editMessageText(chatId, sent.result?.message_id, `✂️ *Tailored Resume*\n🔗 ${url}\n\n${tailored}`, {
      parse_mode: 'Markdown', disable_web_page_preview: true
    });
  } catch (err) {
    await bot.editMessageText(chatId, sent.result?.message_id, '❌ Failed.');
  }
}

// /feedback
async function cmdFeedback(msg, text) {
  if (!text) return bot.sendMessage(msg.chat.id, '📝 /feedback <your message>');
  fs.appendFileSync(path.join(__dirname, 'feedback.log'), `[${new Date().toISOString()}] ${msg.chat.id}: ${text}\n`);
  await bot.sendMessage(msg.chat.id, '✅ Thanks! Noted.', { reply_markup: mainKb() });
}

// ═══════════════════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════════════════
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  
  // Resume upload
  if (msg.document && AWAITING_RESUME.has(chatId)) {
    AWAITING_RESUME.delete(chatId);
    await bot.sendMessage(chatId, '📄 Processing...');
    try {
      const fileId = msg.document.file_id;
      const localPath = await bot.downloadFile(fileId, UPLOADS_DIR);
      const parsed = await parseResume(localPath, msg.document.file_name || 'resume.pdf');
      cleanupFile(localPath);
      userData.setResume(chatId, { text: parsed.text, fileName: parsed.fileName, fileType: parsed.fileType });
      await bot.sendMessage(chatId,
        `✅ *Resume saved!*\n\n📄 ${esc(parsed.fileName)}\n📝 ${parsed.text.length} chars\n\n• /analyze — ATS check\n• /advice <#> — ATS tips\n• /find — search matching jobs`,
        { parse_mode: 'Markdown', reply_markup: mainKb() }
      );
    } catch (err) {
      await bot.sendMessage(chatId, '❌ Could not process file. Send PDF, DOCX, or TXT.', { reply_markup: mainKb() });
    }
    return;
  }
  
  // Commands
  if (text.startsWith('/')) {
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');
    
    switch (cmd) {
      case '/start': case '/menu': return cmdStart(msg);
      case '/help': return cmdHelp(msg);
      case '/find': case '/search': return cmdFind(msg, args);
      case '/remote': return cmdRemote(msg);
      case '/nigeria': return cmdNigeria(msg);
      case '/trending': return cmdTrending(msg);
      case '/subscribe': return cmdSubscribe(msg);
      case '/unsubscribe': return cmdUnsubscribe(msg);
      case '/resume': return cmdResume(msg);
      case '/analyze': return cmdAnalyze(msg);
      case '/ai': return cmdAI(msg);
      case '/advice': return cmdAdvice(msg, args);
      case '/profile': return cmdProfile(msg);
      case '/interview': return cmdInterview(msg, args);
      case '/tailor': return cmdTailor(msg, args);
      case '/feedback': return cmdFeedback(msg, args);
      default: return bot.sendMessage(chatId, '🤔 Type /start for commands.', { reply_markup: mainKb() });
    }
  }
  
  // AI chat mode
  if (AI_MODE.has(chatId)) {
    bot.sendChatAction(chatId, 'typing');
    try {
      const response = await aiChat.chat(chatId, text);
      await bot.sendMessage(chatId, response, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Menu', callback_data: 'main_menu' }]] }
      });
    } catch (err) {
      await bot.sendMessage(chatId, '😕 Sorry, try again.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Menu', callback_data: 'main_menu' }]] }
      });
    }
    return;
  }
  
  // Default
  await bot.sendMessage(chatId,
    `Hey! I'm *Paiye* 🔥\n\nTell me what job you want:\n• /find react developer\n• /remote\n• /nigeria\n• /ai — chat with me`,
    { parse_mode: 'Markdown', reply_markup: mainKb() }
  );
});

// ═══════════════════════════════════════════════════════════
// CALLBACK HANDLER (inline buttons)
// ═══════════════════════════════════════════════════════════
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  await bot.answerCallbackQuery(query.id);
  
  const fakeMsg = { chat: { id: chatId }, from: query.from, text: '' };
  
  switch (data) {
    case 'find_prompt':
      return bot.sendMessage(chatId, '🔍 *What job do you want?*\n\nType: /find <query>', { parse_mode: 'Markdown' });
    case 'remote': return cmdRemote(fakeMsg);
    case 'nigeria': return cmdNigeria(fakeMsg);
    case 'trending': return cmdTrending(fakeMsg);
    case 'subscribe': return cmdSubscribe(fakeMsg);
    case 'help': return cmdHelp(fakeMsg);
    case 'resume': return cmdResume(fakeMsg);
    case 'analyze': return cmdAnalyze(fakeMsg);
    case 'chat_ai': return cmdAI(fakeMsg);
    case 'main_menu':
      AI_MODE.delete(chatId);
      return cmdStart(fakeMsg);
  }
});

// ═══════════════════════════════════════════════════════════
// DAILY JOB PUSH (7:00 AM WAT)
// ═══════════════════════════════════════════════════════════
cron.schedule('0 7 * * *', async () => {
  console.log('⏰ Daily push...');
  if (!SUBSCRIBERS.size) return;
  
  try {
    const queries = ['AI engineer remote', 'writing remote', 'data annotation remote'];
    const allJobs = [];
    for (const q of queries) {
      const jobs = await megaSearch(q, { limit: 5 });
      allJobs.push(...jobs);
    }
    
    const seen = new Set();
    const unique = allJobs.filter(j => {
      const k = `${j.title}|${j.company}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    
    for (const [chatId] of SUBSCRIBERS) {
      try {
        let m = '🌅 *Good Morning! Your daily jobs* ☕\n\n';
        unique.slice(0, 15).forEach((j, i) => { m += jobCard(j, i + 1) + '\n\n'; });
        m += '💡 /find <query> for custom search';
        await bot.sendMessage(chatId, m, { parse_mode: 'Markdown', disable_web_page_preview: true });
      } catch (err) {
        console.error(`❌ Push to ${chatId}:`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Daily push:', err.message);
  }
});

// ═══════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════
async function main() {
  await bot.start();
  
  // Register commands
  try {
    await bot.setCommands([
      { command: 'find', description: 'Find any job (e.g., /find react developer)' },
      { command: 'remote', description: 'Browse remote jobs' },
      { command: 'nigeria', description: 'Jobs open to Nigeria' },
      { command: 'trending', description: 'Hot jobs right now' },
      { command: 'resume', description: 'Upload your CV' },
      { command: 'analyze', description: 'ATS resume check' },
      { command: 'ai', description: 'Chat with AI' },
      { command: 'subscribe', description: 'Daily job delivery' },
      { command: 'interview', description: 'Interview prep (send job URL)' },
      { command: 'tailor', description: 'Tailor resume to job' },
      { command: 'help', description: 'Show all commands' },
    ]);
    await bot.setDescription('Paiye — AI Career Agent. Find any job, anywhere. Remote, Nigeria, worldwide.');
    await bot.setShortDescription('🔍 AI Career Agent — find any job you want!');
    console.log('✅ Commands registered');
  } catch (err) {
    console.log('⚠️ Commands:', err.message);
  }
  
  console.log('');
  console.log('🤖 Paiye v4 — AI Career Agent');
  console.log('🌍 6 job sources • AI chat • Resume analysis');
  console.log(`📂 ${SUBSCRIBERS.size} subscribers`);
  console.log(`🤖 AI: ${aiChat.ready ? 'ON' : 'OFF'}`);
  console.log('');
}

main().catch(err => { console.error('❌ Fatal:', err.message); process.exit(1); });
