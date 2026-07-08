// ============================================================
// 🔍 UK Job Search — specifically for Isaac's resume match
// ============================================================
const axios = require('axios');
const cheerio = require('cheerio');

async function fetchJobDetails(url) {
  try {
    const { data } = await axios.get(url, { 
      timeout: 10000, 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } 
    });
    const $ = cheerio.load(data);
    const desc = $('meta[name="description"]').attr('content') || '';
    const salaryMatch = desc.match(/[\u00a3€$]\d+[,\d]*(?:\s*-\s*[\u00a3€$]?\d+[,\d]*)?/);
    const salary = salaryMatch ? salaryMatch[0] : 'Not listed';
    const bodyText = $('body').text().substring(0, 1000);
    const bodySalary = bodyText.match(/[\u00a3€$]\s*\d+[,\d]*(?:\s*-\s*[\u00a3€$]?\s*\d+[,\d]*)?/g);
    return { desc: desc.substring(0, 300), salary, bodySalary, bodyPreview: bodyText.substring(0, 500) };
  } catch(e) {
    return { error: e.message };
  }
}

async function searchUKJobs() {
  console.log('🔍 SEARCHING UK JOBS IN GBP...\n');

  // ─── Source 1: RemoteOK filtered for UK/GBP relevance ───
  console.log('📡 Source 1: RemoteOK API...');
  try {
    const { data } = await axios.get('https://remoteok.com/api', { 
      timeout: 20000, 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } 
    });
    
    if (Array.isArray(data) && data.length > 1) {
      const ukRelevant = data.slice(1).filter(j => {
        const text = ((j.description||'') + ' ' + (j.tags||[]).join(' ') + ' ' + (j.position||'') + ' ' + (j.location||'')).toLowerCase();
        const isUK = /uk|united kingdom|england|london|britain|gbp|\u00a3/.test(text);
        const isRelevant = /prompt engineer|ai|machine learning|content|writing|copywriter|video|social media|community|web3|seo|marketing|creative/.test(text);
        return isUK && isRelevant;
      });
      
      console.log(`   Found ${ukRelevant.length} UK-relevant jobs on RemoteOK`);
      
      for (const job of ukRelevant.slice(0, 5)) {
        const details = await fetchJobDetails(job.url);
        console.log(`\n--- ${job.position} @ ${job.company} ---`);
        console.log(`   URL: ${job.url}`);
        console.log(`   Location: ${job.location || 'Remote'}`);
        console.log(`   Salary from meta: ${details.salary}`);
        if (details.bodySalary) console.log(`   Salary from body: ${details.bodySalary.join(', ')}`);
        if (details.desc) console.log(`   Description: ${details.desc.substring(0, 200)}`);
      }
    }
  } catch(e) { console.log(`   RemoteOK error: ${e.message}`); }

  // ─── Source 2: Google Jobs / Indeed-style via search ───
  console.log('\n📡 Source 2: Additional UK job searches...');
  
  // Search for prompt engineering + AI jobs in UK
  const searchQueries = [
    'https://findwork.dev/api/jobs/?search=prompt+engineer+UK&remote=true',
    'https://findwork.dev/api/jobs/?search=content+writer+UK&remote=true',
    'https://findwork.dev/api/jobs/?search=AI+engineer+UK&remote=true'
  ];
  
  for (const url of searchQueries) {
    try {
      const { data } = await axios.get(url, { 
        timeout: 10000, 
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } 
      });
      if (data && data.results) {
        console.log(`   FindWork: ${data.results.length} results for ${url.split('search=')[1].split('&')[0]}`);
        data.results.slice(0, 3).forEach(j => {
          console.log(`   - ${j.role} @ ${j.company_name} (${j.location})`);
        });
      }
    } catch(e) { /* skip */ }
  }

  console.log('\n✅ UK job scan complete!');
}

searchUKJobs().catch(console.error);
