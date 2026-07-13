// ============================================================
// 🎯 Simple Commands — Clean UI, powerful backend
// ============================================================

const { megaSearch } = require('./jobMcp');

// ─── Config ───
const DEFAULT_LIMIT = 5;

// ─── Escape markdown ───
function esc(text) {
  return (text || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// ─── Format single job card (clean, simple) ───
function formatJob(job, index) {
  const score = job.score || 50;
  const bar = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔵';
  const salary = job.salary ? `\n   💰 ${esc(job.salary)}` : '';
  const tags = job.tags?.length ? `\n   🏷️ ${job.tags.slice(0, 3).map(t => esc(t)).join(' · ')}` : '';
  
  return (
    `${index}. ${bar} *${esc(job.title)}*\n` +
    `   🏢 ${esc(job.company)}\n` +
    `   📍 ${esc(job.location)}${salary}${tags}\n` +
    `   🔗 [Apply](${job.url})`
  );
}

// ═══════════════════════════════════════════════════════════
// /find — Simple job search (the main command)
// ═══════════════════════════════════════════════════════════
async function cmdFind(msg, args) {
  const chatId = msg.chat.id;
  const bot = this;
  
  if (!args) {
    return bot.sendMessage(chatId,
      '🔍 *What job are you looking for?*\n\n' +
      'Examples:\n' +
      '• `/find react developer`\n' +
      '• `/find data scientist remote`\n' +
      '• `/find product manager Lagos`\n' +
      '• `/find AI engineer $100k+`\n\n' +
      '_Just tell me what you want!_',
      { parse_mode: 'Markdown' }
    );
  }
  
  // Parse limit from args (e.g., "react developer --10")
  let limit = DEFAULT_LIMIT;
  let query = args;
  const limitMatch = args.match(/--(\d+)/);
  if (limitMatch) {
    limit = Math.min(parseInt(limitMatch[1]), 20);
    query = args.replace(/--\d+/, '').trim();
  }
  
  const sent = await bot.sendMessage(chatId, `🔍 Searching for *${esc(query)}*...`, { parse_mode: 'Markdown' });
  bot.sendChatAction(chatId, 'typing');
  
  try {
    const jobs = await megaSearch(query, { limit });
    
    if (jobs.length === 0) {
      return bot.editMessageText(chatId, sent.result?.message_id,
        `😕 No jobs found for *${esc(query)}*\n\n` +
        'Try:\n' +
        '• Simpler keywords (`python` instead of `senior python developer`)\n' +
        '• Different terms (`engineer` instead of `developer`)\n' +
        '• Browse categories: `/nigeria` `/remote` `/tech`',
        { parse_mode: 'Markdown' }
      );
    }
    
    let message = `🎯 *${esc(query)}* — ${jobs.length} jobs found\n\n`;
    jobs.forEach((job, i) => {
      message += formatJob(job, i + 1) + '\n\n';
    });
    
    message += '💡 _Reply with a number (1-5) for more details_\n';
    message += '📊 _Or try: `/find <query> --10` for more results_';
    
    await bot.editMessageText(chatId, sent.result?.message_id, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error('❌ /find error:', err.message);
    await bot.editMessageText(chatId, sent.result?.message_id,
      '❌ Search failed. Try again in a moment.',
      { parse_mode: 'Markdown' }
    );
  }
}

// ═══════════════════════════════════════════════════════════
// /remote — Remote jobs only
// ═══════════════════════════════════════════════════════════
async function cmdRemote(msg, args) {
  const chatId = msg.chat.id;
  const bot = this;
  const query = args || 'remote';
  
  const sent = await bot.sendMessage(chatId, '🌍 Finding remote jobs...', { parse_mode: 'Markdown' });
  bot.sendChatAction(chatId, 'typing');
  
  try {
    const jobs = await megaSearch(query, { limit: DEFAULT_LIMIT });
    
    if (jobs.length === 0) {
      return bot.editMessageText(chatId, sent.result?.message_id,
        '😕 No remote jobs found. Try `/find <your skill>`',
        { parse_mode: 'Markdown' }
      );
    }
    
    let message = '🌍 *Remote Jobs*\n\n';
    jobs.forEach((job, i) => {
      message += formatJob(job, i + 1) + '\n\n';
    });
    
    await bot.editMessageText(chatId, sent.result?.message_id, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error('❌ /remote error:', err.message);
    await bot.editMessageText(chatId, sent.result?.message_id,
      '❌ Search failed. Try again.',
      { parse_mode: 'Markdown' }
    );
  }
}

// ═══════════════════════════════════════════════════════════
// /nigeria — Nigeria-friendly jobs
// ═══════════════════════════════════════════════════════════
async function cmdNigeria(msg, args) {
  const chatId = msg.chat.id;
  const bot = this;
  const query = args || 'remote africa';
  
  const sent = await bot.sendMessage(chatId, '🇳🇬 Finding Nigeria-friendly jobs...', { parse_mode: 'Markdown' });
  bot.sendChatAction(chatId, 'typing');
  
  try {
    const jobs = await megaSearch(query, { limit: DEFAULT_LIMIT });
    
    // Filter for Africa-friendly
    const nigeriaJobs = jobs.filter(j => {
      const loc = (j.location || '').toLowerCase();
      return loc.includes('remote') || loc.includes('africa') || 
             loc.includes('nigeria') || loc.includes('worldwide') ||
             !loc.includes('only');
    });
    
    const displayJobs = nigeriaJobs.length > 0 ? nigeriaJobs : jobs;
    
    if (displayJobs.length === 0) {
      return bot.editMessageText(chatId, sent.result?.message_id,
        '😕 No Nigeria-friendly jobs found. Try `/find <your skill>`',
        { parse_mode: 'Markdown' }
      );
    }
    
    let message = '🇳🇬 *Nigeria-Friendly Jobs*\n\n';
    displayJobs.slice(0, DEFAULT_LIMIT).forEach((job, i) => {
      message += formatJob(job, i + 1) + '\n\n';
    });
    
    message += '💡 _These are open to applicants worldwide including Nigeria_';
    
    await bot.editMessageText(chatId, sent.result?.message_id, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error('❌ /nigeria error:', err.message);
    await bot.editMessageText(chatId, sent.result?.message_id,
      '❌ Search failed. Try again.',
      { parse_mode: 'Markdown' }
    );
  }
}

// ═══════════════════════════════════════════════════════════
// /trending — Hot jobs right now
// ═══════════════════════════════════════════════════════════
async function cmdTrending(msg) {
  const chatId = msg.chat.id;
  const bot = this;
  
  const sent = await bot.sendMessage(chatId, '🔥 Finding trending jobs...', { parse_mode: 'Markdown' });
  bot.sendChatAction(chatId, 'typing');
  
  try {
    const queries = ['AI engineer', 'react developer', 'product manager', 'data scientist'];
    const allJobs = [];
    
    for (const q of queries.slice(0, 2)) {
      const jobs = await megaSearch(q, { limit: 2 });
      allJobs.push(...jobs);
    }
    
    // Deduplicate
    const seen = new Set();
    const unique = allJobs.filter(j => {
      const key = `${j.title}|${j.company}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    if (unique.length === 0) {
      return bot.editMessageText(chatId, sent.result?.message_id,
        '😕 No trending jobs found right now.',
        { parse_mode: 'Markdown' }
      );
    }
    
    let message = '🔥 *Trending Jobs Right Now*\n\n';
    unique.slice(0, DEFAULT_LIMIT).forEach((job, i) => {
      message += formatJob(job, i + 1) + '\n\n';
    });
    
    await bot.editMessageText(chatId, sent.result?.message_id, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error('❌ /trending error:', err.message);
    await bot.editMessageText(chatId, sent.result?.message_id,
      '❌ Failed to fetch trending jobs.',
      { parse_mode: 'Markdown' }
    );
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════
module.exports = {
  cmdFind,
  cmdRemote,
  cmdNigeria,
  cmdTrending,
};
