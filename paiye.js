// ============================================================
// 🤖 Paiye v5 — AI Career Agent
//    Job Search • ATS • AI Chat • Company Research
//    Application Tracker • Rate Limits • Compliance
// ============================================================

require('dotenv').config();
const TelegramClient = require('./telegramClient');
const { megaSearch, searchInternships } = require('./jobMcp');
const { qaPipeline, extractSkillsFromResume, generateAtsAdvice, getJobAge } = require('./jobQa');
const AIChat = require('./aiChat');
const userData = require('./userData');
const { parseResume, cleanupFile, UPLOADS_DIR } = require('./resumeParser');
const { defaultLimiter } = require('./rateLimiter');
const { adminManager } = require('./adminManager');
const { complianceManager } = require('./complianceManager');
const { CompanyResearch } = require('./companyResearch');
const { appTracker } = require('./applicationTracker');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// ─── Config ───
const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) { console.error('❌ Missing TELEGRAM_TOKEN'); process.exit(1); }

const DEFAULT_LIMIT = 5;
const MAX_MSG = 4000;
const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');
const OWNER_ID = process.env.OWNER_ID || null;

// ─── Init ───
const bot = new TelegramClient(TOKEN);
const aiChat = new AIChat();
const companyResearch = new CompanyResearch();
const AI_MODE = new Set();
const AWAITING_RESUME = new Set();
const AWAITING_TRACK_JOB = new Map(); // chatId -> { step, data }
let SUBSCRIBERS = loadSubscribers();

// Apply rate limit mode from env
const rlMode = process.env.RATE_LIMIT_MODE || 'lenient';
if (['strict', 'lenient', 'log_only'].includes(rlMode)) {
  defaultLimiter.setMode(rlMode);
}

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

// Rate limit wrapper — decorates a handler
async function rateLimited(chatId, command, handler) {
  if (OWNER_ID && String(chatId) === String(OWNER_ID)) {
    return handler(); // Owner bypasses limits
  }
  if (adminManager.isBlocked(chatId)) {
    await bot.sendMessage(chatId, '⛔ You have been blocked from using this bot.');
    return;
  }

  const rl = defaultLimiter.checkAndRecord(command);
  if (!rl.allowed) {
    const waitSec = Math.ceil(rl.waitMs / 1000);
    await bot.sendMessage(chatId,
      `⏱️ *Too fast!* Please wait ${waitSec}s before using ${command} again.\n\n_This helps us respect job source APIs._`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  return handler();
}

// ─── Job Card (clean & simple) ───
function jobCard(job, i) {
  const score = job.score || job.matchScore || 50;
  const icon = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔵';
  const salary = job.salary ? `\n   💰 ${esc(job.salary)}` : '';
  return (
    `${i}. ${icon} *${esc(job.title)}*\n` +
    `   🏢 ${esc(job.company)}\n` +
    `   📍 ${esc(job.location)}${salary}\n` +
    `   🔗 [Apply](${job.url})`
  );
}

// ─── Keyboards ───
function mainKb() {
  return {
    inline_keyboard: [
      [{ text: '🔍 Find', callback_data: 'find_prompt' }, { text: '🌍 Remote', callback_data: 'remote' }],
      [{ text: '🇳🇬 Nigeria', callback_data: 'nigeria' }, { text: '🎓 Internships', callback_data: 'internships' }, { text: '🔥 Trending', callback_data: 'trending' }],
      [{ text: '💬 AI Chat', callback_data: 'chat_ai' }, { text: '🏢 Company', callback_data: 'company_prompt' }],
      [{ text: '📄 Resume', callback_data: 'resume' }, { text: '📋 Track', callback_data: 'track_prompt' }],
      [{ text: '📥 Subscribe', callback_data: 'subscribe' }, { text: '❓ Help', callback_data: 'help' }],
    ]
  };
}

function adminKb() {
  return {
    inline_keyboard: [
      [{ text: '📊 Stats', callback_data: 'admin_stats' }, { text: '📋 Audit', callback_data: 'admin_audit' }],
      [{ text: '⏱️ Rate Limits', callback_data: 'admin_ratelimit' }, { text: '⚖️ Compliance', callback_data: 'admin_compliance' }],
      [{ text: '📺 Broadcast', callback_data: 'admin_broadcast' }, { text: '🔄 Refresh', callback_data: 'admin_refresh' }],
      [{ text: '🔙 Menu', callback_data: 'main_menu' }],
    ]
  };
}

// ═══════════════════════════════════════════════════════════
// COMMANDS — FIND JOBS
// ═══════════════════════════════════════════════════════════

// /start
async function cmdStart(msg) {
  const name = msg.from?.first_name || 'there';
  AI_MODE.delete(msg.chat.id);
  await bot.sendMessage(msg.chat.id,
    `Hey ${esc(name)}! 👋\n\n` +
    `I'm *Paiye* — your AI Career Agent 🔥\n\n` +
    `*Find Jobs*\n` +
    `• /find react developer — any job\n` +
    `• /remote — remote jobs\n` +
    `• /nigeria — 🇳🇬 jobs for Nigeria\n` +
    `• /internships — 🎓 trainee & intern roles\n` +
    `• /trending — 🔥 hot jobs now\n` +
    `• /mcp-search AI engineer — across ALL sources\n\n` +
    `*Career Tools*\n` +
    `• /resume — upload CV for ATS analysis\n` +
    `• /company stripe — research any company\n` +
    `• /track — track your applications\n` +
    `• /ai — chat with AI for career advice\n` +
    `• /subscribe — daily jobs at 7AM WAT`,
    { parse_mode: 'Markdown', reply_markup: mainKb() }
  );
}

// /help
async function cmdHelp(msg) {
  await bot.sendMessage(msg.chat.id,
    `📘 *Paiye Commands v5*\n\n` +
    `───────────────\n` +
    `*🔍 FIND JOBS*\n` +
    `───────────────\n` +
    `• /find <query> -- N — search any job\n` +
    `• /mcp-search <query> — search ALL sources (MCP)\n` +
    `• /remote — remote jobs\n` +
    `• /nigeria — Nigeria jobs\n` +
    `• /internships — 🎓 internships & trainee roles\n` +
    `• /trending — hot jobs now\n` +
    `• /subscribe — daily delivery 7AM WAT\n\n` +
    `───────────────\n` +
    `*🧠 CAREER TOOLS*\n` +
    `───────────────\n` +
    `• /resume — upload your CV\n` +
    `• /analyze — ATS score & tips\n` +
    `• /advice <#> — ATS tips for a job\n` +
    `• /interview <job-url> — interview prep\n` +
    `• /tailor <job-url> — tailor resume\n` +
    `• /ai — chat about careers\n\n` +
    `───────────────\n` +
    `*🏢 COMPANY RESEARCH*\n` +
    `───────────────\n` +
    `• /company <name> — salary, reviews, info\n` +
    `• /hot — AI trends + market analysis\n\n` +
    `───────────────\n` +
    `*📋 APPLICATION TRACKER*\n` +
    `───────────────\n` +
    `• /track — view all entries\n` +
    `• /track-add <company> | <role> | <url> — add new\n` +
    `• /track-status <#> <status> — update status\n` +
    `• /track-note <#> <note> — add note\n` +
    `• /track-del <#> — delete entry\n\n` +
    `───────────────\n` +
    `*👑 ADMIN*\n` +
    `───────────────\n` +
    `• /admin — admin panel\n` +
    `• /stats — bot statistics\n` +
    `• /broadcast <msg> — message all users\n` +
    `• /block <userid> — block a user\n` +
    `• /unblock <userid> — unblock a user\n` +
    `• /refresh — force re-fetch job cache\n\n` +
    `*Need help?* /feedback <your message>`,
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
    const rawJobs = await megaSearch(query, { limit: limit + 5 });
    const jobs = await qaPipeline(rawJobs, {
      maxAge: 7,
      verifyLinks: false,
      userSkills,
      resumeText: resume?.text || '',
    });

    if (!jobs.length) {
      return bot.editMessageText(chatId, sent.result?.message_id,
        `😕 No fresh jobs for *${esc(query)}*\n\nTry:\n• Simpler keywords\n• /remote for remote jobs\n• /mcp-search ${esc(query)} for more sources`,
        { parse_mode: 'Markdown' }
      );
    }

    let msgText = `🎯 *${esc(query)}* — ${jobs.length} fresh jobs\n\n`;
    jobs.slice(0, limit).forEach((j, i) => {
      const matchIcon = j.matchScore >= 80 ? '🟢' : j.matchScore >= 60 ? '🟡' : '🔵';
      const age = getJobAge(j);
      msgText += `${i + 1}. ${matchIcon} *${esc(j.title)}*\n`;
      msgText += `   🏢 ${esc(j.company)}\n`;
      msgText += `   📍 ${esc(j.location)} · 💯 ${j.matchScore}% match\n`;
      if (j.salary) msgText += `   💰 ${esc(j.salary)}\n`;
      msgText += `   📅 ${age} · 🔗 [Apply](${j.url})\n\n`;
    });

    msgText += `_💡 /advice <number> for ATS tips · /find <query> --10 for more_`;

    await bot.editMessageText(chatId, sent.result?.message_id, msgText, {
      parse_mode: 'Markdown', disable_web_page_preview: true
    });
  } catch (err) {
    console.error('❌ /find:', err.message);
    await bot.editMessageText(chatId, sent.result?.message_id, '❌ Search failed. Try again in a moment.');
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

// /internships
async function cmdInternships(msg) {
  const chatId = msg.chat.id;
  const sent = await bot.sendMessage(chatId, '🎓 Finding internships...');
  bot.sendChatAction(chatId, 'typing');

  try {
    let jobs = await searchInternships('', DEFAULT_LIMIT); // LinkedIn/Wellfound/YC via Fantastic.jobs
    if (!jobs.length) {
      jobs = await megaSearch('internship', { limit: DEFAULT_LIMIT }); // fallback: any source (Jobzilla trainee category etc.)
    }
    let m = '🎓 *Internships & Trainee Roles*\n\n';
    jobs.slice(0, DEFAULT_LIMIT).forEach((j, i) => { m += jobCard(j, i + 1) + '\n\n'; });
    m += '_Fresh from LinkedIn, Wellfound & Y Combinator_';

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

// /mcp-search <query> — Unified MCP search across ALL sources
async function cmdMcpSearch(msg, args) {
  const chatId = msg.chat.id;
  if (!args) {
    return bot.sendMessage(chatId,
      '🔬 *MCP Search*\n\nSearch across ALL connected job boards simultaneously.\n\n' +
      'Usage: `/mcp-search senior AI engineer remote`\nAlias: `/mcp <query>`',
      { parse_mode: 'Markdown' }
    );
  }

  // Parse limit
  let limit = 8;
  let query = args;
  const m = args.match(/--(\d+)/);
  if (m) { limit = Math.min(parseInt(m[1]), 30); query = args.replace(/--\d+/, '').trim(); }

  const sent = await bot.sendMessage(chatId, `🔬 MCP searching *${esc(query)}* across all sources...`, { parse_mode: 'Markdown' });
  bot.sendChatAction(chatId, 'typing');

  try {
    // Check source compliance
    const srcCheck = complianceManager.checkSourceAction('jobspy');
    if (!srcCheck.allowed && defaultLimiter.mode === 'strict') {
      return bot.editMessageText(chatId, sent.result?.message_id,
        `⚠️ MCP search restricted: ${srcCheck.warnings.join(', ')}.\n\nUsing standard search instead.`,
        { parse_mode: 'Markdown' }
      );
    }

    // If admin approved/compliant, do the search
    // JobSpy runs headless so we use standard megaSearch + extra sources
    const rawJobs = await megaSearch(query, { limit: limit + 5 });

    // Also attempt compliance-tracked search
    const qaJobs = await qaPipeline(rawJobs, { maxAge: 14, verifyLinks: false });

    if (!qaJobs.length) {
      return bot.editMessageText(chatId, sent.result?.message_id,
        `😕 No results from MCP search for *${esc(query)}*\n\nTry /find ${esc(query)}`,
        { parse_mode: 'Markdown' }
      );
    }

    let msgText = `🔬 *MCP Search* — ${qaJobs.length} results\n\n`;
    qaJobs.slice(0, limit).forEach((j, i) => {
      const score = j.matchScore || 50;
      const icon = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔵';
      msgText += `${i + 1}. ${icon} *${esc(j.title)}*\n`;
      msgText += `   🏢 ${esc(j.company)} · 📍 ${esc(j.location)}\n`;
      msgText += `   💯 ${score}% · 🔗 [Apply](${j.url})\n\n`;
    });

    await bot.editMessageText(chatId, sent.result?.message_id, msgText, {
      parse_mode: 'Markdown', disable_web_page_preview: true
    });
  } catch (err) {
    console.error('❌ MCP search:', err.message);
    await bot.editMessageText(chatId, sent.result?.message_id, '❌ MCP search failed. Try /find instead.');
  }
}

// ═══════════════════════════════════════════════════════════
// COMMANDS — SOURCES INFO
// ═══════════════════════════════════════════════════════════

// /sources — List all job sources
async function cmdSources(chatId) {
  const msg = `📡 *Job Sources* — 13 active sources

🟢 *Free (No API Key):*
1️⃣ Himalayas — Remote jobs worldwide
2️⃣ RemoteOK — Remote tech jobs
3️⃣ Remotive — Remote startup jobs
4️⃣ Jobicy — Remote jobs aggregator
5️⃣ Arbeitnow — Africa-friendly jobs
6️⃣ Findwork — Developer jobs
7️⃣ Jooble — Global job aggregator
8️⃣ Working Nomads — Remote/async jobs
9️⃣ Authentic Jobs — Web/design/dev

🔵 *Free Tier (API Key optional):*
🔟 The Muse — Tech/startup jobs
1️⃣1️⃣ JSearch — LinkedIn jobs (needs RAPIDAPI_KEY)
1️⃣2️⃣ Adzuna — Global jobs (needs ADZUNA keys)
1️⃣3️⃣ AI Training — Scale AI, Turing, Surge, Encord, Toloka, Labelbox, Snorkel, Truveta & more

📌 *AI Training career pages:* Mercor, micro1, Bespoke Labs, DeepFrame, Sepal AI, Plato, DataCurve, Argilla
💡 All sources are searched automatically with /find and /mcp-search

🔍 Try: /mcp-search <query> to search ALL sources`;
  
  return bot.sendMessage(chatId, msg, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  });
}

// ═══════════════════════════════════════════════════════════
// COMMANDS — COMPANY RESEARCH
// ═══════════════════════════════════════════════════════════

// /company <name>
async function cmdCompany(msg, name) {
  const chatId = msg.chat.id;
  if (!name) {
    return bot.sendMessage(chatId,
      '🏢 *Company Research*\n\nUsage: `/company <name>`\n\nExamples:\n' +
      '• /company OpenAI\n• /company Google\n• /company Stripe\n• /company Anthropic',
      { parse_mode: 'Markdown' }
    );
  }

  const sent = await bot.sendMessage(chatId, `🏢 Researching *${esc(name)}*...`, { parse_mode: 'Markdown' });
  bot.sendChatAction(chatId, 'typing');

  try {
    const company = await companyResearch.fetchInfo(name);
    if (!company) {
      return bot.editMessageText(chatId, sent.result?.message_id,
        `😕 No data for *${esc(name)}*\n\n` +
        `_I have ${Object.keys(require('./companyResearch').COMPANY_DB).length} companies in my database._\n\n` +
        `Try one of: Google, Meta, OpenAI, Anthropic, Stripe, Apple, Amazon, Netflix`,
        { parse_mode: 'Markdown' }
      );
    }

    const report = companyResearch.formatReport(company);
    await bot.editMessageText(chatId, sent.result?.message_id, report, {
      parse_mode: 'Markdown'
    });
  } catch (err) {
    console.error('❌ /company:', err.message);
    await bot.editMessageText(chatId, sent.result?.message_id, '❌ Research failed.');
  }
}

// /hot — AI/market trends + hot roles
async function cmdHot(msg) {
  const chatId = msg.chat.id;
  if (!aiChat.ready) {
    return bot.sendMessage(chatId, '🤖 AI needs API key for trend analysis. Set GROQ_API_KEY.', { reply_markup: mainKb() });
  }

  const sent = await bot.sendMessage(chatId, '🔥 Analyzing job market trends...');
  bot.sendChatAction(chatId, 'typing');

  try {
    // Fetch trending jobs
    const trends = [
      { q: 'AI engineer', limit: 3 },
      { q: 'blockchain developer', limit: 2 },
      { q: 'product manager', limit: 2 },
      { q: 'data scientist', limit: 2 },
    ];

    const allJobs = [];
    for (const t of trends) {
      const jobs = await megaSearch(t.q, { limit: t.limit });
      allJobs.push(...jobs);
    }

    const seen = new Set();
    const unique = allJobs.filter(j => {
      const k = `${j.title}|${j.company}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const topJobs = unique.slice(0, 8);
    const jobList = topJobs.map((j, i) => `${i + 1}. *${esc(j.title)}* @ ${esc(j.company)} — [Apply](${j.url})`).join('\n');

    const prompt = `Analyze these current job market trends. Give insights for job seekers:\n\n${jobList}\n\n` +
      `Include:\n1. Top 3 hottest roles right now\n2. Key skills in demand\n3. Salary expectations\n4. Remote work trends\n5. 1 actionable tip\n\nFormat with markdown. Be concise.`;

    const analysis = await aiChat.chat(chatId + '-hot', prompt);

    let msgText = `🔥 *Job Market Trends*\n\n`;
    msgText += jobList + '\n\n';
    msgText += analysis;

    await bot.editMessageText(chatId, sent.result?.message_id, msgText, {
      parse_mode: 'Markdown', disable_web_page_preview: true
    });
  } catch (err) {
    console.error('❌ /hot:', err.message);
    await bot.editMessageText(chatId, sent.result?.message_id, '❌ Trend analysis failed.');
  }
}

// ═══════════════════════════════════════════════════════════
// COMMANDS — APPLICATION TRACKER
// ═══════════════════════════════════════════════════════════

// /track
async function cmdTrack(msg) {
  const chatId = msg.chat.id;
  const list = appTracker.formatList(chatId);
  if (!list) {
    return bot.sendMessage(chatId,
      '📋 *No tracked applications*\n\n' +
      'Add one:\n`/track-add OpenAI | ML Engineer | https://...`\n\n' +
      'Or use the format: `/track-add Company | Role | URL`',
      { parse_mode: 'Markdown', reply_markup: mainKb() }
    );
  }
  await bot.sendMessage(chatId, list, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Add', callback_data: 'track_add_prompt' }, { text: '🔙 Menu', callback_data: 'main_menu' }]
      ]
    }
  });
}

// /track-add <Company> | <Role> | <URL>
async function cmdTrackAdd(msg, args) {
  const chatId = msg.chat.id;
  if (!args) {
    // Start interactive flow instead of failing
    AWAITING_TRACK_JOB.set(chatId, { step: 'company', data: {} });
    return bot.sendMessage(chatId,
      '📋 *New Application*\n\nStep 1/3: What company?',
      { parse_mode: 'Markdown' }
    );
  }

  // Parse pipe-delimited format: Company | Role | URL
  const parts = args.split('|').map(s => s.trim());
  const company = parts[0] || 'Unknown';
  const role = parts[1] || 'Unknown';
  const url = parts[2] || '';

  try {
    const entry = appTracker.add(chatId, { company, role, url, status: 'draft' });
    await bot.sendMessage(chatId,
      `✅ *Tracked!* #${entry.id}\n\n` +
      `🎯 ${entry.role} @ ${entry.company}\n` +
      `📊 Status: 📝 Draft\n\n` +
      `Next:\n• /track-status ${entry.id} <status>\n• /track-note ${entry.id} <note>\n• /track`,
      { parse_mode: 'Markdown', reply_markup: mainKb() }
    );
  } catch (err) {
    await bot.sendMessage(chatId, '❌ Could not add: ' + err.message);
  }
}

// /track-status <id> <status>
async function cmdTrackStatus(msg, args) {
  const chatId = msg.chat.id;
  if (!args) {
    const valid = appTracker.constructor.STATUSES.map(s => `${s.emoji} ${s.value} — ${s.label}`).join('\n');
    return bot.sendMessage(chatId,
      '📊 *Update Status*\n\nUsage: `/track-status <#> <status>`\n\nValid statuses:\n' + valid,
      { parse_mode: 'Markdown' }
    );
  }

  const parts = args.split(/\s+/);
  const appId = parseInt(parts[0]);
  const newStatus = parts.slice(1).join(' ').toLowerCase();

  if (isNaN(appId)) return bot.sendMessage(chatId, '❌ Use: /track-status 3 interview');
  if (!newStatus) return bot.sendMessage(chatId, '❌ Missing status. Use: /track-status 3 interview');

  try {
    const app = appTracker.updateStatus(chatId, appId, newStatus);
    await bot.sendMessage(chatId,
      `✅ *Updated #${app.id}*\n\n` +
      `🎯 ${app.role} @ ${app.company}\n` +
      `📊 Status: ${appTracker.constructor.STATUS_EMOJI[newStatus] || '📝'} ${appTracker.constructor.STATUS_LABEL[newStatus] || newStatus}\n\n` +
      `/track — view all`,
      { parse_mode: 'Markdown', reply_markup: mainKb() }
    );
  } catch (err) {
    await bot.sendMessage(chatId, `❌ ${err.message}`);
  }
}

// /track-note <id> <note>
async function cmdTrackNote(msg, args) {
  const chatId = msg.chat.id;
  if (!args) {
    return bot.sendMessage(chatId, '📌 Usage: `/track-note 3 Had a great first round`', { parse_mode: 'Markdown' });
  }

  const parts = args.split(/\s+/);
  const appId = parseInt(parts[0]);
  const note = parts.slice(1).join(' ');

  if (isNaN(appId)) return bot.sendMessage(chatId, '❌ Use: /track-note 3 Great culture fit');
  if (!note) return bot.sendMessage(chatId, '❌ Missing note.');

  try {
    appTracker.updateNotes(chatId, appId, note);
    await bot.sendMessage(chatId,
      `✅ Note added to #${appId}: "${note}"`,
      { parse_mode: 'Markdown', reply_markup: mainKb() }
    );
  } catch (err) {
    await bot.sendMessage(chatId, `❌ ${err.message}`);
  }
}

// /track-del <id>
async function cmdTrackDel(msg, args) {
  const chatId = msg.chat.id;
  if (!args) return bot.sendMessage(chatId, '❌ Usage: /track-del 3');

  const appId = parseInt(args);
  if (isNaN(appId)) return bot.sendMessage(chatId, '❌ Usage: /track-del 3');

  try {
    appTracker.delete(chatId, appId);
    await bot.sendMessage(chatId, `🗑️ Deleted #${appId}`, { reply_markup: mainKb() });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════
// COMMANDS — ADMIN
// ═══════════════════════════════════════════════════════════

// /admin
async function cmdAdmin(msg) {
  const chatId = msg.chat.id;
  if (!adminManager.isAdmin(chatId)) {
    return bot.sendMessage(chatId, '⛔ Admin only. /help for commands.', { reply_markup: mainKb() });
  }

  const stats = adminManager.getStats();
  await bot.sendMessage(chatId,
    `👑 *Admin Panel*\n\n` +
    `📊 Stats:\n` +
    `• 👤 Admins: ${stats.admins}\n` +
    `• 🚫 Blocked: ${stats.blockedUsers}\n` +
    `• 📋 Audit: ${stats.auditEntries} entries\n` +
    `• 📺 Last broadcast: ${stats.lastBroadcast}\n\n` +
    `Commands:\n` +
    `• /stats — detailed bot stats\n` +
    `• /broadcast <msg> — all subscribers\n` +
    `• /block <id> <reason> — block user\n` +
    `• /unblock <id> — unblock user\n` +
    `• /refresh — force cache refresh`,
    { parse_mode: 'Markdown', reply_markup: adminKb() }
  );
}

// /stats
async function cmdStats(msg) {
  const chatId = msg.chat.id;
  if (!adminManager.isAdmin(chatId)) {
    return bot.sendMessage(chatId, '⛔ Admin only.', { reply_markup: mainKb() });
  }

  const trackStats = appTracker.getStats();
  const rlStats = defaultLimiter.getAllStats();

  let text = '📊 *Bot Statistics*\n\n';
  text += `── Subscribers ──\n`;
  text += `📥 ${SUBSCRIBERS.size} active\n\n`;
  text += `── Application Tracker ──\n`;
  text += `📋 ${trackStats.totalApps} applications\n`;
  text += `👤 ${trackStats.totalUsers} users using it\n`;
  if (trackStats.statusCounts) {
    for (const [status, count] of Object.entries(trackStats.statusCounts)) {
      const emoji = appTracker.constructor.STATUS_EMOJI[status] || '📋';
      text += `${emoji} ${status}: ${count}\n`;
    }
  }
  text += `\n── Command Usage ──\n`;
  for (const [key, s] of Object.entries(rlStats)) {
    if (s) text += `/${key}: ${s.currentCalls}/${s.maxCalls} calls\n`;
  }
  text += `\n── System ──\n`;
  text += `🤖 AI: ${aiChat.ready ? 'ON' : 'OFF'}\n`;
  text += `⏱️ Rate limit mode: ${defaultLimiter.mode}\n`;

  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

// /broadcast <message>
async function cmdBroadcast(msg, text) {
  const chatId = msg.chat.id;
  if (!adminManager.isAdmin(chatId)) {
    return bot.sendMessage(chatId, '⛔ Admin only.', { reply_markup: mainKb() });
  }
  if (!text) {
    return bot.sendMessage(chatId,
      '📺 *Broadcast*\n\nUsage: `/broadcast <message>`\n\n' +
      `Sends to ${SUBSCRIBERS.size} subscriber(s).`,
      { parse_mode: 'Markdown' }
    );
  }

  const sent = await bot.sendMessage(chatId, `📺 Broadcasting to ${SUBSCRIBERS.size} users...`);
  let success = 0;
  let failed = 0;

  for (const [subId] of SUBSCRIBERS) {
    try {
      await bot.sendMessage(subId, `📺 *Broadcast*\n\n${text}`, { parse_mode: 'Markdown' });
      success++;
    } catch (err) {
      failed++;
      console.error(`❌ Broadcast to ${subId}:`, err.message);
    }
  }

  adminManager.recordBroadcast();
  adminManager.log(chatId, 'broadcast', `Sent to ${success}/${SUBSCRIBERS.size} users`, { text: text.substring(0, 100) });

  await bot.editMessageText(chatId, sent.result?.message_id,
    `✅ Broadcast complete: ${success} sent, ${failed} failed`,
    { parse_mode: 'Markdown' }
  );
}

// /block <id> [reason]
async function cmdBlock(msg, args) {
  const chatId = msg.chat.id;
  if (!adminManager.isAdmin(chatId)) {
    return bot.sendMessage(chatId, '⛔ Admin only.');
  }
  if (!args) return bot.sendMessage(chatId, '❌ Usage: /block 123456789 spam');

  const parts = args.split(/\s+/);
  const targetId = parts[0];
  const reason = parts.slice(1).join(' ');

  try {
    const result = adminManager.blockUser(chatId, targetId, reason);
    await bot.sendMessage(chatId, result);
  } catch (err) {
    await bot.sendMessage(chatId, `❌ ${err.message}`);
  }
}

// /unblock <id>
async function cmdUnblock(msg, args) {
  const chatId = msg.chat.id;
  if (!adminManager.isAdmin(chatId)) {
    return bot.sendMessage(chatId, '⛔ Admin only.');
  }
  if (!args) return bot.sendMessage(chatId, '❌ Usage: /unblock 123456789');

  try {
    const result = adminManager.unblockUser(chatId, args);
    await bot.sendMessage(chatId, result);
  } catch (err) {
    await bot.sendMessage(chatId, `❌ ${err.message}`);
  }
}

// /refresh
async function cmdRefresh(msg) {
  const chatId = msg.chat.id;
  if (!adminManager.isAdmin(chatId)) {
    return bot.sendMessage(chatId, '⛔ Admin only.', { reply_markup: mainKb() });
  }

  await bot.sendMessage(chatId, '🔄 Refreshing...');
  defaultLimiter.reset();
  await bot.sendMessage(chatId, '✅ Rate limiter reset. Cache flushed.');

  const result = adminManager.log(chatId, 'refresh', 'Manual cache/limit refresh');
}

// ═══════════════════════════════════════════════════════════
// COMMANDS — EXISTING FEATURES (preserved exactly)
// ═══════════════════════════════════════════════════════════

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

// /advice <number>
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
      '📄 Upload your resume first!\n\n/resume',
      { parse_mode: 'Markdown', reply_markup: mainKb() }
    );
  }

  const jobIndex = parseInt(args) - 1;
  if (isNaN(jobIndex) || jobIndex < 0) {
    return bot.sendMessage(chatId, '❌ Use a number: /advice 1', { parse_mode: 'Markdown' });
  }

  const sent = await bot.sendMessage(chatId, '📋 Generating ATS advice...');
  bot.sendChatAction(chatId, 'typing');

  try {
    const resume = userData.getResume(chatId);
    const skills = extractSkillsFromResume(resume.text);

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
      parse_mode: 'Markdown', disable_web_page_preview: true
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
    return bot.sendMessage(chatId, '📄 Upload resume first! /resume', { reply_markup: mainKb() });
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

  // Check if user is blocked
  if (adminManager.isBlocked(chatId)) {
    if (text.startsWith('/')) return; // silently ignore
    return;
  }

  // ── Resume upload ──
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

  // ── Interactive track-add ──
  if (AWAITING_TRACK_JOB.has(chatId)) {
    const state = AWAITING_TRACK_JOB.get(chatId);

    if (state.step === 'company') {
      state.data.company = text;
      state.step = 'role';
      await bot.sendMessage(chatId, `📋 Step 2/3: What's the job title?\n_Company: ${esc(state.data.company)}_`, { parse_mode: 'Markdown' });
      return;
    }

    if (state.step === 'role') {
      state.data.role = text;
      state.step = 'url';
      await bot.sendMessage(chatId, `📋 Step 3/3: Got a URL? (send "none" to skip)\n_Role: ${esc(state.data.role)} @ ${esc(state.data.company)}_`, { parse_mode: 'Markdown' });
      return;
    }

    if (state.step === 'url') {
      AWAITING_TRACK_JOB.delete(chatId);
      state.data.url = text.toLowerCase() !== 'none' ? text : '';

      try {
        const entry = appTracker.add(chatId, state.data);
        await bot.sendMessage(chatId,
          `✅ *Tracked!* #${entry.id}\n\n` +
          `🎯 ${entry.role} @ ${entry.company}\n` +
          `📊 Status: 📝 Draft\n\n` +
          `/track — view all\n/track-status ${entry.id} <status>`,
          { parse_mode: 'Markdown', reply_markup: mainKb() }
        );
      } catch (err) {
        await bot.sendMessage(chatId, `❌ ${err.message}`);
      }
      return;
    }
  }

  // ── Commands ──
  if (text.startsWith('/')) {
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    switch (cmd) {
      // Core
      case '/start': case '/menu': return rateLimited(chatId, 'start', () => cmdStart(msg));
      case '/help': return cmdHelp(msg);

      // Job search
      case '/find': case '/search': return rateLimited(chatId, 'find', () => cmdFind(msg, args));
      case '/remote': return rateLimited(chatId, 'remote', () => cmdRemote(msg));
      case '/nigeria': return rateLimited(chatId, 'nigeria', () => cmdNigeria(msg));
      case '/internships': return rateLimited(chatId, 'internships', () => cmdInternships(msg));
      case '/trending': return rateLimited(chatId, 'trending', () => cmdTrending(msg));
      case '/mcp-search': case '/mcp': return rateLimited(chatId, 'mcp-search', () => cmdMcpSearch(msg, args));
      case '/sources': return cmdSources(chatId);
      case '/subscribe': return rateLimited(chatId, 'subscribe', () => cmdSubscribe(msg));
      case '/unsubscribe': return cmdUnsubscribe(msg);

      // Resume & ATS
      case '/resume': return cmdResume(msg);
      case '/analyze': return rateLimited(chatId, 'analyze', () => cmdAnalyze(msg));
      case '/advice': return rateLimited(chatId, 'advice', () => cmdAdvice(msg, args));

      // AI
      case '/ai': return rateLimited(chatId, 'ai', () => cmdAI(msg));

      // Career tools
      case '/interview': return rateLimited(chatId, 'interview', () => cmdInterview(msg, args));
      case '/tailor': return rateLimited(chatId, 'tailor', () => cmdTailor(msg, args));
      case '/profile': return cmdProfile(msg);
      case '/feedback': return cmdFeedback(msg, args);

      // Company research
      case '/company': return rateLimited(chatId, 'company', () => cmdCompany(msg, args));
      case '/hot': return rateLimited(chatId, 'company', () => cmdHot(msg));

      // Application tracker
      case '/track': return cmdTrack(msg);
      case '/track-add': return cmdTrackAdd(msg, args);
      case '/track-status': return cmdTrackStatus(msg, args);
      case '/track-note': return cmdTrackNote(msg, args);
      case '/track-del': return cmdTrackDel(msg, args);

      // Admin
      case '/admin': return cmdAdmin(msg);
      case '/stats': return cmdStats(msg);
      case '/broadcast': return cmdBroadcast(msg, args);
      case '/block': return cmdBlock(msg, args);
      case '/unblock': return cmdUnblock(msg, args);
      case '/refresh': return cmdRefresh(msg);

      default:
        return bot.sendMessage(chatId, '🤔 Unknown command. Type /help for all commands.', { reply_markup: mainKb() });
    }
  }

  // ── AI chat mode ──
  if (AI_MODE.has(chatId)) {
    const rl = defaultLimiter.checkAndRecord('ai');
    if (!rl.allowed) {
      const waitSec = Math.ceil(rl.waitMs / 1000);
      return bot.sendMessage(chatId, `⏱️ Please wait ${waitSec}s...`, {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Menu', callback_data: 'main_menu' }]] }
      });
    }

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

  // ── Default ──
  await bot.sendMessage(chatId,
    `Hey! I'm *Paiye* 🔥\n\nTell me what job you want:\n• /find react developer\n• /remote\n• /company stripe\n• /track\n• /ai — chat with me`,
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
    // Main menu
    case 'find_prompt':
      return bot.sendMessage(chatId, '🔍 *What job do you want?*\n\nType: /find <query>', { parse_mode: 'Markdown' });
    case 'remote': return cmdRemote(fakeMsg);
    case 'nigeria': return cmdNigeria(fakeMsg);
    case 'internships': return cmdInternships(fakeMsg);
    case 'trending': return cmdTrending(fakeMsg);
    case 'subscribe': return cmdSubscribe(fakeMsg);
    case 'help': return cmdHelp(fakeMsg);
    case 'resume': return cmdResume(fakeMsg);
    case 'chat_ai': return cmdAI(fakeMsg);
    case 'company_prompt':
      return bot.sendMessage(chatId, '🏢 *What company?*\n\nType: /company <name>\n\nExamples:\n• /company OpenAI\n• /company Google', { parse_mode: 'Markdown' });
    case 'track_prompt':
      return cmdTrack(fakeMsg);
    case 'track_add_prompt':
      AWAITING_TRACK_JOB.set(chatId, { step: 'company', data: {} });
      return bot.sendMessage(chatId, '📋 *New Application*\n\nStep 1/3: What company?', { parse_mode: 'Markdown' });

    // Admin
    case 'admin_stats': return cmdStats(fakeMsg);
    case 'admin_audit': {
      if (!adminManager.isAdmin(chatId)) return bot.sendMessage(chatId, '⛔ Admin only.');
      return bot.sendMessage(chatId, adminManager.getAuditText(15), { parse_mode: 'Markdown' });
    }
    case 'admin_ratelimit': {
      if (!adminManager.isAdmin(chatId)) return bot.sendMessage(chatId, '⛔ Admin only.');
      return bot.sendMessage(chatId, defaultLimiter.summary(), { parse_mode: 'Markdown' });
    }
    case 'admin_compliance': {
      if (!adminManager.isAdmin(chatId)) return bot.sendMessage(chatId, '⛔ Admin only.');
      return bot.sendMessage(chatId, complianceManager.summary(), { parse_mode: 'Markdown' });
    }
    case 'admin_broadcast': {
      if (!adminManager.isAdmin(chatId)) return bot.sendMessage(chatId, '⛔ Admin only.');
      return bot.sendMessage(chatId,
        '📺 *Broadcast*\n\nType: `/broadcast <message>`\n\n' +
        `Sends to ${SUBSCRIBERS.size} subscribers.`,
        { parse_mode: 'Markdown' }
      );
    }
    case 'admin_refresh': return cmdRefresh(fakeMsg);
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

    let success = 0;
    for (const [chatId] of SUBSCRIBERS) {
      if (adminManager.isBlocked(chatId)) continue;
      try {
        let m = '🌅 *Good Morning! Your daily jobs* ☕\n\n';
        unique.slice(0, 15).forEach((j, i) => { m += jobCard(j, i + 1) + '\n\n'; });
        m += '\n💡 /find <query> for custom search · /hot for market trends';
        await bot.sendMessage(chatId, m, { parse_mode: 'Markdown', disable_web_page_preview: true });
        success++;
      } catch (err) {
        console.error(`❌ Push to ${chatId}:`, err.message);
      }
    }
    console.log(`✅ Daily push sent to ${success}/${SUBSCRIBERS.size} subscribers`);
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
      { command: 'find', description: '🔍 Find any job (e.g., /find react developer)' },
      { command: 'mcp_search', description: '🔬 Search ALL sources (e.g., /mcp-search AI engineer)' },
      { command: 'sources', description: '📡 View all job sources' },
      { command: 'remote', description: '🌍 Browse remote jobs' },
      { command: 'nigeria', description: '🇳🇬 Jobs open to Nigeria' },
      { command: 'internships', description: '🎓 Browse internships & trainee roles' },
      { command: 'trending', description: '🔥 Hot jobs right now' },
      { command: 'company', description: '🏢 Research a company (salary, info)' },
      { command: 'track', description: '📋 Track your job applications' },
      { command: 'hot', description: '🔥 Job market trends & analysis' },
      { command: 'resume', description: '📄 Upload your CV for ATS' },
      { command: 'analyze', description: '📊 ATS resume check' },
      { command: 'ai', description: '💬 Chat with AI' },
      { command: 'interview', description: '🎯 Interview prep (send job URL)' },
      { command: 'tailor', description: '✂️ Tailor resume to job' },
      { command: 'subscribe', description: '📥 Daily job delivery 7AM WAT' },
      { command: 'feedback', description: '📝 Share feedback' },
      { command: 'help', description: '📘 Show all commands' },
    ]);
    await bot.setDescription('Paiye v5 — AI Career Agent. Job search, company research, application tracking, ATS analysis, interview prep, AI chat.');
    await bot.setShortDescription('🔍 AI Career Agent — find any job! Track apps. Research companies.');
    console.log('✅ Commands registered');
  } catch (err) {
    console.log('⚠️ Commands:', err.message);
  }

  console.log('');
  console.log('╔══════════════════════════════╗');
  console.log('║   🤖  PAIYE v5              ║');
  console.log('║   AI Career Agent           ║');
  console.log('╚══════════════════════════════╝');
  console.log(`🌍 13 job sources + MCP`);
  console.log(`🤖 AI: ${aiChat.ready ? 'ON' : 'OFF'}`);
  console.log(`📂 ${SUBSCRIBERS.size} subscribers`);
  console.log(`👑 Admins: ${adminManager.adminIds.size}`);
  console.log(`⏱️ Rate limit: ${defaultLimiter.mode}`);
  console.log(`📋 Applications tracked: ${appTracker.totalCount()}`);
  console.log('');
}

main().catch(err => { console.error('❌ Fatal:', err.message); process.exit(1); });
