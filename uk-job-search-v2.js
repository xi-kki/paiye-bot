// ============================================================
// 🔍 UK Job Search v2 — deeper scraping + GBP detection
// ============================================================
const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeRemoteOKJob(url) {
  try {
    const { data } = await axios.get(url, { 
      timeout: 10000, 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } 
    });
    const $ = cheerio.load(data);
    const body = $('body').text();
    
    // Find GBP/UK salary patterns
    const gbpPattern = /\u00a3\s*\d{1,3}(?:,\d{3})*(?:\s*-\s*\u00a3?\s*\d{1,3}(?:,\d{3})*)?/g;
    const salaries = body.match(gbpPattern);
    
    // Find if it's UK-based
    const isUK = /uk|united kingdom|england|london|britain/i.test(body);
    
    // Find job description section
    const descMatch = body.match(/[\\s\\S]{0,50}(?:about|description|role|overview|we're looking|requirements)[\\s\\S]{0,500}/i);
    
    return {
      salaries: salaries ? salaries.slice(0, 3) : [],
      isUK,
      snippet: descMatch ? descMatch[0].trim().substring(0, 300) : body.substring(0, 300)
    };
  } catch(e) {
    return { error: e.message };
  }
}

async function search() {
  console.log('🔍 Fetching all jobs from RemoteOK...\n');
  
  const { data } = await axios.get('https://remoteok.com/api', { 
    timeout: 20000, 
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } 
  });
  
  if (!Array.isArray(data)) { console.log('No data'); return; }
  
  const jobs = data.slice(1);
  console.log(`Total jobs: ${jobs.length}`);
  
  // Score each job against Isaac's profiles
  const scored = [];
  
  for (const job of jobs) {
    const text = ((job.description||'') + ' ' + (job.tags||[]).join(' ') + ' ' + (job.position||'') + ' ' + (job.location||'')).toLowerCase();
    
    // Isaac's AI/Vibe Coding keywords
    const aiKeywords = ['prompt engineering', 'ai engineer', 'machine learning', 'llm', 'ai agent', 'gen ai', 'generative ai', 'prompt', 'ai development', 'vibe coding'];
    // Isaac's Writing keywords  
    const writingKeywords = ['content writer', 'copywriter', 'content strategist', 'technical writer', 'web3', 'social media', 'seo', 'content marketing', 'community manager', 'brand story', 'video editor', 'script writer'];
    
    let aiScore = 0, writingScore = 0;
    for (const kw of aiKeywords) if (text.includes(kw)) aiScore += 10;
    for (const kw of writingKeywords) if (text.includes(kw)) writingScore += 10;
    
    // UK bonus
    const isUKloc = /uk|united kingdom|england|london|britain/i.test(text);
    if (isUKloc) { aiScore += 5; writingScore += 5; }
    
    // GBP salary bonus
    if (job.salary && /\u00a3/.test(job.salary)) { aiScore += 10; writingScore += 10; }
    if (job.salary && /\d{6,}/.test(job.salary)) { aiScore += 5; writingScore += 5; } // $100k+
    
    const maxScore = Math.max(aiScore, writingScore);
    if (maxScore > 0) {
      scored.push({
        title: job.position,
        company: job.company,
        url: job.url,
        salary: job.salary || 'Not listed',
        location: job.location || 'Remote',
        tags: (job.tags||[]).join(', '),
        score: maxScore,
        type: aiScore > writingScore ? '🤖 AI/Vibe Coding' : '✍️ Writing/Content',
        uk: isUKloc
      });
    }
  }
  
  scored.sort((a, b) => b.score - a.score);
  
  console.log(`\n🎯 TOP MATCHES FOR ISAAC'S RESUMES:\n`);
  console.log('='.repeat(80));
  
  scored.slice(0, 15).forEach((job, i) => {
    console.log(`\n${i+1}. ${job.type}`);
    console.log(`   ${job.title} @ ${job.company}`);
    console.log(`   💰 ${job.salary}`);
    console.log(`   📍 ${job.location} ${job.uk ? '🇬🇧' : ''}`);
    console.log(`   🔗 ${job.url}`);
    console.log(`   Score: ${job.score}`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log(`\nTotal matching jobs: ${scored.length}`);
  
  const ukJobs = scored.filter(j => j.uk);
  console.log(`UK-specific: ${ukJobs.length}`);
  
  const aiJobs = scored.filter(j => j.type === '🤖 AI/Vibe Coding');
  const writingJobs = scored.filter(j => j.type === '✍️ Writing/Content');
  console.log(`AI/Vibe Coding matches: ${aiJobs.length}`);
  console.log(`Writing/Content matches: ${writingJobs.length}`);
}

search().catch(console.error);
