// ============================================================
// 🔍 Deep scan — scrape actual job pages for salary + details
// ============================================================
const axios = require('axios');
const cheerio = require('cheerio');

async function fetchPage(url) {
  try {
    const { data } = await axios.get(url, { 
      timeout: 15000, 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' } 
    });
    return data;
  } catch(e) { return null; }
}

async function main() {
  // Jobs we care about — UK ones that vaguely match Isaac
  const targets = [
    { title: 'Social Media & Partnerships Manager', company: 'Caramel Talent', url: 'https://remoteok.com/remote-jobs/remote-social-media-partnerships-manager-lifestyle-caramel-talent-1134021' },
    { title: 'Creative Director (Film Campaign)', company: 'Strange Face', url: 'https://remoteok.com/remote-jobs/remote-creative-director-strange-face-1133995' },
    { title: 'Social Media Manager', company: 'Strange Face', url: 'https://remoteok.com/remote-jobs/remote-social-media-manager-strange-face-1133993' },
    { title: 'Mid Senior AI Cinematic Video Editor', company: 'EverAI', url: 'https://remoteok.com/remote-jobs/remote-mid-senior-ai-cinematic-video-editor-everai-1134014' },
    { title: 'Junior Business Analyst (UK)', company: 'Work Force Nexus', url: 'https://remoteok.com/remote-jobs/remote-junior-business-analyst-work-force-nexus-1133994' },
    { title: 'Application Support Specialist (London)', company: 'Internova Travel Group', url: 'https://remoteok.com/remote-jobs/remote-application-support-specialist-internova-travel-group-1134111' }
  ];
  
  // Also try Adzuna UK API (free public)
  try {
    console.log('📡 Adzuna UK API (public jobs)...');
    const { data } = await axios.get('https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=3e8f6c08&app_key=8a7b8f8c7d9e3a2b1c0d5e6f7a8b9c0d&results_per_page=20&what=ai+content+writer+prompt+engineer+marketing&content-type=application/json', { timeout: 10000 });
    if (data && data.results) {
      console.log(`   ${data.results.length} jobs from Adzuna UK:\n`);
      data.results.forEach((j, i) => {
        const salary = j.salary_min ? `£${j.salary_min.toLocaleString()} - £${j.salary_max?.toLocaleString() || 'N/A'}` : 'Not listed';
        console.log(`   ${i+1}. ${j.title} @ ${j.company?.display_name}`);
        console.log(`      💰 ${salary}`);
        console.log(`      📍 ${j.location?.display_name || 'UK'}`);
        console.log(`      ${(j.description||'').substring(0, 150)}...`);
        console.log(`      🔗 ${j.redirect_url}\n`);
      });
    }
  } catch(e) { console.log(`   Adzuna error: ${e.message}`); }
  
  console.log('\n' + '='.repeat(60));
  console.log('📡 Scraping individual job pages...\n');
  
  for (const job of targets) {
    console.log(`--- ${job.title} @ ${job.company} ---`);
    const html = await fetchPage(job.url);
    if (!html) { console.log('   ❌ Could not fetch\n'); continue; }
    
    const $ = cheerio.load(html);
    const body = $('body').text();
    
    // Find GBP salary
    const gbpPattern = new RegExp('[£\u00a3]\\s*\\d{1,3}(?:,\\d{3})*(?:\\s*[-–to]{1,3}\\s*[£\\u00a3]?\\s*\\d{1,3}(?:,\\d{3})*)?(?:\\s*(?:per year|pa|annum|per month|pm|k|p\\.a|/yr|/year))?', 'gi');
    const salaries = body.match(gbpPattern);
    
    // Find dollar salaries
    const usdPattern = /\$\s*\d{1,3}(?:,\d{3})*(?:\s*[-–to]{1,3}\s*\$?\s*\d{1,3}(?:,\d{3})*)?(?:\s*(?:per year|pa|annum|per month|pm|k|p\.a|\/yr|\/year|\/hr|\/hour))?/gi;
    const usdSalaries = body.match(usdPattern);
    
    console.log(`   💰 GBP: ${salaries ? salaries.join(', ') : 'Not found'}`);
    console.log(`   💰 USD: ${usdSalaries ? usdSalaries.slice(0,3).join(', ') : 'Not found'}`);
    
    // Extract description
    const sections = body.split(/\n{2,}/).filter(s => s.trim().length > 50);
    const descSection = sections.find(s => /about|description|role|requirements|responsibilities/i.test(s) && s.length > 100);
    if (descSection) {
      console.log(`   📝 ${descSection.trim().substring(0, 300)}...`);
    }
    console.log('');
  }
}

main().catch(console.error);
