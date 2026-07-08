// ============================================================
// 🔍 Job Search Engine — fetches from multiple free sources
// ============================================================

const axios = require('axios');
const cheerio = require('cheerio');
const profiles = require('./profiles');

// ─── Helper: detect location restrictions ───
// Some remote jobs restrict to US/EU/UK only — we flag them
const LOCATION_RESTRICTIONS = [
  'must be based in', 'must be located in', 'must reside in',
  'us only', 'united states only', 'us citizens only', 'us residents only',
  'uk only', 'united kingdom only', 'britain only',
  'eu only', 'european union only', 'europe only',
  'must be within', 'candidates must be',
  'work authorization in the us', 'work authorization in us',
  'sponsorship not available', 'no sponsorship', 'cannot sponsor',
  'us work permit', 'us work authorization'
];

const LOCATION_PREFERRED = [
  'open to anywhere', 'global', 'worldwide', 'anywhere',
  'remote ok', 'remote first', 'remote - global',
  'work from anywhere', 'wfa', 'any country',
  'international', 'all countries'
];

// ─── Rotating User-Agent pool to avoid blocks ───
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.80'
];
let uaIndex = 0;
function nextUA() {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
  uaIndex++;
  return ua;
}

// ─── Shared fetch with rotation ───
const REQUEST_DELAY = 500; // ms between requests to be polite
let lastRequest = 0;
async function politeFetch(url, options = {}) {
  const now = Date.now();
  const wait = Math.max(0, REQUEST_DELAY - (now - lastRequest));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequest = Date.now();
  return axios.get(url, {
    timeout: options.timeout || 10000,
    headers: {
      'User-Agent': nextUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer': 'https://www.google.com/'
    },
    ...options
  });
}

// ─── Shared RSS parser helper ───
function parseRSSJobs(xmlText, sourceName) {
  const jobs = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const item = match[1];
    const title = ((item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || [])[1] ||
                   (item.match(/<title>([^<]*)<\/title>/i) || [])[1] || '').trim();
    const link = ((item.match(/<link>[^<]*<!\[CDATA\[([\s\S]*?)\]\]><\/link>/i) || [])[1] ||
                  (item.match(/<link>([^<]*)<\/link>/i) || [])[1] || '').trim();
    const desc = ((item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) || [])[1] ||
                  (item.match(/<description>([^<]*)<\/description>/i) || [])[1] || '').replace(/<[^>]*>/g, '').trim();
    const company = ((item.match(/<company>([^<]*)<\/company>/i) || [])[1] ||
                     (item.match(/<author>([^<]*)<\/author>/i) || [])[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    // Try himalayas namespace for company
    const himCompany = (item.match(/himalayasJobs:companyName>([^<]*)<\/himalayasJobs:companyName>/i) || [])[1] || '';
    const finalCompany = company || himCompany;
    const locationTag = (item.match(/himalayasJobs:locationRestriction>([^<]*)<\/himalayasJobs:locationRestriction>/i) || [])[1] || '';
    const pubDate = (item.match(/<pubDate>([^<]*)<\/pubDate>/i) || [])[1] || null;
    const categories = [];
    const catRegex = /<category[^>]*>([^<]*)<\/category>/gi;
    let cMatch;
    while ((cMatch = catRegex.exec(item)) !== null) {
      categories.push(cMatch[1]);
    }
    if (title && link) {
      jobs.push({
        source: sourceName,
        title: title.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
        company: finalCompany.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
        description: desc.substring(0, 500),
        url: link,
        salary: null,
        tags: categories.join(', '),
        location: locationTag || 'Remote',
        date: pubDate
      });
    }
  }
  return jobs;
}

function getLocationStatus(job) {
  const text = ((job.description || '') + ' ' + (job.tags || '') + ' ' + (job.location || '')).toLowerCase();
  for (const r of LOCATION_RESTRICTIONS) {
    if (text.includes(r)) return 'restricted';
  }
  for (const p of LOCATION_PREFERRED) {
    if (text.includes(p)) return 'global';
  }
  return 'open';
}

// ─── RemoteOK API (Free, no key) ───
async function fetchRemoteOK() {
  try {
    const { data } = await axios.get('https://remoteok.com/api', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    // Also fetch RSS for supplementary jobs
    try {
      const rssData = await axios.get('https://remoteok.com/remote-jobs.rss', {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      // RSS has 40 jobs vs API's ~20-30 — merge them
      if (rssData.data) {
        const rssJobs = [];
        const rssText = typeof rssData.data === 'string' ? rssData.data : JSON.stringify(rssData.data);
        // Simple regex to extract RSS items
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let match;
        while ((match = itemRegex.exec(rssText)) !== null) {
          const item = match[1];
          const title = (item.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
          const link = (item.match(/<link>([^<]*)<\/link>/i) || [])[1] || '';
          const desc = (item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) || (item.match(/<description>([^<]*)<\/description>/i))) ? ((item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) || [])[1] || (item.match(/<description>([^<]*)<\/description>/i) || [])[1] || '') : '';
          const company = (item.match(/<company>([^<]*)<\/company>/i) || [])[1] || '';
          if (title && link) {
            rssJobs.push({
              source: 'RemoteOK',
              title: title.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
              company: company.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
              description: desc.replace(/<[^>]*>/g, '').substring(0, 500),
              url: link,
              salary: null,
              tags: '',
              location: 'Remote',
              date: (item.match(/<pubDate>([^<]*)<\/pubDate>/i) || [])[1] || null
            });
          }
        }
        if (rssJobs.length > 0) {
          // Add RSS jobs to the main array (dedup by URL happens later)
          const existingUrls = new Set(jobs.map(j => j.url));
          for (const rj of rssJobs) {
            if (!existingUrls.has(rj.url)) {
              jobs.push(rj);
            }
          }
          console.log(`   RemoteOK RSS: ${rssJobs.length} supplementary jobs`);
        }
      }
    } catch (rssErr) {
      // RSS is supplementary, don't log errors
    }
    // data[0] is metadata, data[1..] are jobs
    const jobs = Array.isArray(data) ? data.slice(1) : [];
    return jobs.map(job => ({
      source: 'RemoteOK',
      title: job.position || '',
      company: job.company || '',
      description: (job.description || '').replace(/<[^>]*>/g, '').substring(0, 500),
      url: job.url || '',
      salary: job.salary || null,
      tags: (job.tags || []).join(', '),
      location: 'Remote',
      date: job.date || null
    }));
  } catch (err) {
    console.log('⚠️ RemoteOK fetch failed:', err.message);
    return [];
  }
}

// ─── We Work Remotely API (Free) ───
async function fetchWeWorkRemotely() {
  try {
    // Fetch all categories
    const categories = [
      'https://raw.githubusercontent.com/working-group/weworkremotely-feed/main/feed.json'
    ];
    // Using their JSON feed
    const jobs = [];
    
    // Try their categories API
    const catEndpoints = [
      'full-time', 'software-dev', 'design', 'writing', 'product',
      'devops', 'marketing', 'content', 'customer-support'
    ];
    
    for (const cat of catEndpoints) {
      try {
        const { data } = await axios.get(
          `https://weworkremotely.com/categories/remote-${cat}.json`,
          { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if (Array.isArray(data)) {
          data.forEach(job => {
            jobs.push({
              source: 'WeWorkRemotely',
              title: job.title || job.name || '',
              company: job.company?.name || '',
              description: (job.description || '').substring(0, 500),
              url: `https://weworkremotely.com/remote-jobs/${job.id || job.slug}`,
              salary: null, // WWR doesn't always show salary
              tags: (job.tags || []).join(', '),
              location: 'Remote',
              date: job.pubDate || null
            });
          });
        }
      } catch (e) {
        // skip failed categories
      }
    }
    // RSS supplement
    try {
      const rssResp = await axios.get('https://weworkremotely.com/remote-jobs.rss', {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const rssText = typeof rssResp.data === 'string' ? rssResp.data : JSON.stringify(rssResp.data);
      const rssJobs = parseRSSJobs(rssText, 'WeWorkRemotely');
      const existingUrls = new Set(jobs.map(j => j.url));
      for (const rj of rssJobs) {
        if (!existingUrls.has(rj.url)) {
          jobs.push(rj);
        }
      }
      console.log(`   WeWorkRemotely RSS: ${rssJobs.length} supplementary jobs`);
    } catch (_) {}
    return jobs;
  } catch (err) {
    console.log('⚠️ WeWorkRemotely fetch failed:', err.message);
    return [];
  }
}

// ─── Jobicy API (Free) ───
async function fetchJobicy() {
  try {
    // Try v2 API first, fall back to v1
    const { data } = await axios.get(
      'https://jobicy.com/api/v2/remote-jobs?count=20',
      { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (data && data.jobs) {
      return data.jobs.map(job => ({
        source: 'Jobicy',
        title: job.jobTitle || '',
        company: job.companyName || '',
        description: (job.jobDescription || '').substring(0, 500),
        url: job.jobURL || `https://jobicy.com/jobs/${job.id}`,
        salary: job.salary || null,
        tags: (job.jobIndustry || '') + ', ' + (job.jobGeo || ''),
        location: job.jobGeo || 'Remote',
        date: job.pubDate || null
      }));
    }
    return [];
  } catch (err) {
    console.log('⚠️ Jobicy fetch failed:', err.message);
    return [];
  }
}

// ─── FindWork — REMOVED (public test token expired, API unreliable) ───
// Kept as a no-op stub to avoid breaking Promise.allSettled
async function fetchFindWork() {
  return [];
}

// ─── Himalayas RSS Feed ───
async function fetchHimalayas() {
  try {
    const { data } = await axios.get('https://himalayas.app/jobs/rss', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const rssText = typeof data === 'string' ? data : JSON.stringify(data);
    const jobs = parseRSSJobs(rssText, 'Himalayas');
    console.log(`   Himalayas: ${jobs.length} jobs`);
    return jobs;
  } catch (err) {
    console.log('⚠️ Himalayas fetch failed:', err.message);
    return [];
  }
}

// ─── Arc.dev (HTML scrape) ───
async function fetchArcDev() {
  try {
    const { data } = await axios.get('https://arc.dev/remote-jobs', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
    });
    const $ = cheerio.load(data);
    const jobs = [];
    $('a[href*="/job/"], article, .job-card, [class*="job"]').each((i, el) => {
      const $el = $(el);
      const title = $el.find('[class*="title"], [class*="position"], h2, h3').first().text().trim() || $el.attr('title') || '';
      const url = $el.attr('href') ? 'https://arc.dev' + $el.attr('href') : '';
      const company = $el.find('[class*="company"], [class*="org"]').first().text().trim() || '';
      const snippet = $el.find('[class*="desc"], [class*="snippet"]').first().text().trim() || '';
      if (title && title.length > 5 && !title.includes('Cookie') && !title.includes('Privacy')) {
        jobs.push({
          source: 'Arc.dev',
          title: title.substring(0, 200),
          company: company.substring(0, 100),
          description: snippet.substring(0, 500),
          url: url || `https://arc.dev/search?q=${encodeURIComponent(title)}`,
          salary: null,
          tags: '',
          location: 'Remote',
          date: null
        });
      }
    });
    // Deduplicate
    const seen = new Set();
    const unique = jobs.filter(j => { const k = j.title + j.company; if (seen.has(k)) return false; seen.add(k); return true; });
    console.log(`   Arc.dev: ${unique.length} jobs`);
    return unique.slice(0, 30);
  } catch (err) {
    console.log('⚠️ Arc.dev fetch failed:', err.message);
    return [];
  }
}

// ─── Otta — REMOVED (JS-rendered, scrape returns nothing useful) ───
async function fetchOtta() {
  return [];
}

// ─── JustRemote.co (HTML scrape) ───
async function fetchJustRemote() {
  try {
    const { data } = await axios.get('https://justremote.co/remote-jobs', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
    });
    const $ = cheerio.load(data);
    const jobs = [];
    $('a[href*="/remote-jobs/"], .job-listing, article, [class*="job"]').each((i, el) => {
      const $el = $(el);
      const title = $el.find('[class*="title"], h2, h3, [class*="name"]').first().text().trim() || $el.attr('title') || '';
      const href = $el.attr('href') || '';
      const url = href.startsWith('http') ? href : `https://justremote.co${href}`;
      const company = $el.find('[class*="company"], [class*="org"]').first().text().trim() || '';
      const snippet = $el.text().trim().substring(0, 200);
      if (title && title.length > 5 && (href.includes('/remote-jobs/') || href.includes('/job/'))) {
        jobs.push({
          source: 'JustRemote',
          title: title.substring(0, 200),
          company: company.substring(0, 100),
          description: snippet,
          url,
          salary: null,
          tags: '',
          location: 'Remote',
          date: null
        });
      }
    });
    const seen = new Set();
    const unique = jobs.filter(j => { const k = j.url; if (seen.has(k)) return false; seen.add(k); return true; });
    console.log(`   JustRemote: ${unique.length} jobs`);
    return unique.slice(0, 30);
  } catch (err) {
    console.log('⚠️ JustRemote fetch failed:', err.message);
    return [];
  }
}

// ─── Remote.co (HTML scrape) ───
async function fetchRemoteCo() {
  try {
    const { data } = await axios.get('https://remote.co/remote-jobs/', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
    });
    const $ = cheerio.load(data);
    const jobs = [];
    $('a[href*="/remote-jobs/"], article, .job, [class*="listing"]').each((i, el) => {
      const $el = $(el);
      const title = $el.find('h2, h3, [class*="title"], strong').first().text().trim() || '';
      const href = $el.attr('href') || '';
      const url = href.startsWith('http') ? href : `https://remote.co${href}`;
      const company = $el.find('[class*="company"], [class*="org"]').first().text().trim() || '';
      const snippet = $el.text().trim().substring(0, 200);
      if (title && title.length > 5 && href.includes('/remote-jobs/')) {
        jobs.push({
          source: 'Remote.co',
          title: title.substring(0, 200),
          company: company.substring(0, 100),
          description: snippet,
          url,
          salary: null,
          tags: '',
          location: 'Remote',
          date: null
        });
      }
    });
    const seen = new Set();
    const unique = jobs.filter(j => { const k = j.url; if (seen.has(k)) return false; seen.add(k); return true; });
    console.log(`   Remote.co: ${unique.length} jobs`);
    return unique.slice(0, 30);
  } catch (err) {
    console.log('⚠️ Remote.co fetch failed:', err.message);
    return [];
  }
}

// ─── Working Nomads — REMOVED (returns 0 jobs consistently) ───
async function fetchWorkingNomads() {
  return [];
}

// ─── NoDesk — REMOVED (anti-bot protection, returns 0 jobs) ───
async function fetchNoDesk() {
  return [];
}

// ─── YC Jobs — REMOVED (JS-rendered SPA, scrape captures irrelevant elements) ───
async function fetchYCJobs() {
  return [];
}

// ─── Pangian — REMOVED (404, site changed) ───
async function fetchPangian() {
  return [];
}

// ─── PowerToFly — REMOVED (JS-rendered, 0 jobs scraped) ───
async function fetchPowerToFly() {
  return [];
}

// ─── EuropeRemotely — REMOVED (403 Forbidden) ───
async function fetchEuropeRemotely() {
  return [];
}

// ─── VirtualVocations — REMOVED (0 jobs scraped) ───
async function fetchVirtualVocations() {
  return [];
}

// ─── 4DayWeek (HTML scrape) ───
async function fetch4DayWeek() {
  try {
    const { data } = await axios.get('https://4dayweek.io/remote-jobs', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
    });
    const $ = cheerio.load(data);
    const jobs = [];
    $('a[href*="/job/"], article, [class*="job"], .job-listing').each((i, el) => {
      const $el = $(el);
      const title = $el.find('h2, h3, [class*="title"]').first().text().trim() || $el.attr('title') || '';
      const href = $el.attr('href') || '';
      const url = href.startsWith('http') ? href : `https://4dayweek.io${href}`;
      const company = $el.find('[class*="company"], [class*="org"]').first().text().trim() || '';
      const snippet = $el.text().trim().substring(0, 200);
      if (title && title.length > 5) {
        jobs.push({
          source: '4DayWeek',
          title: title.substring(0, 200),
          company: company.substring(0, 100),
          description: snippet,
          url,
          salary: null,
          tags: '',
          location: 'Remote / 4-day week',
          date: null
        });
      }
    });
    const seen = new Set();
    const unique = jobs.filter(j => { const k = j.url; if (seen.has(k)) return false; seen.add(k); return true; });
    console.log(`   4DayWeek: ${unique.length} jobs`);
    return unique.slice(0, 30);
  } catch (err) {
    console.log('⚠️ 4DayWeek fetch failed:', err.message);
    return [];
  }
}

// ─── DevRemote — REMOVED (0 jobs scraped) ───
async function fetchDevRemote() {
  return [];
}

// ─── RealWorkFromAnywhere (HTML scrape) ───
async function fetchRealWorkFromAnywhere() {
  const jobs = [];
  try {
    // HTML scrape
    const { data } = await axios.get('https://realworkfromanywhere.com/', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' }
    });
    const $ = cheerio.load(data);
    $('a[href*="/job/"], article, [class*="job"], .job').each((i, el) => {
      const $el = $(el);
      const title = $el.find('h2, h3, [class*="title"]').first().text().trim() || $el.attr('title') || '';
      const href = $el.attr('href') || '';
      const url = href.startsWith('http') ? href : `https://realworkfromanywhere.com${href}`;
      const snippet = $el.text().trim().substring(0, 200);
      if (title && title.length > 5) {
        jobs.push({
          source: 'RealWorkAnywhere',
          title: title.substring(0, 200),
          company: '',
          description: snippet,
          url,
          salary: null,
          tags: '',
          location: 'Remote / Anywhere',
          date: null
        });
      }
    });
    // RSS supplement
    try {
      const rssResp = await axios.get('https://www.realworkfromanywhere.com/rss.xml', {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const rssText = typeof rssResp.data === 'string' ? rssResp.data : JSON.stringify(rssResp.data);
      const rssJobs = parseRSSJobs(rssText, 'RealWorkAnywhere');
      const existingUrls = new Set(jobs.map(j => j.url));
      for (const rj of rssJobs) {
        if (!existingUrls.has(rj.url)) {
          jobs.push(rj);
        }
      }
      console.log(`   RealWorkAnywhere RSS: +${rssJobs.length} supplementary`);
    } catch (_) {}
    const seen = new Set();
    const unique = jobs.filter(j => { const k = j.url; if (seen.has(k)) return false; seen.add(k); return true; });
    console.log(`   RealWorkAnywhere: ${unique.length} total jobs`);
    return unique.slice(0, 30);
  } catch (err) {
    console.log('⚠️ RealWorkAnywhere fetch failed:', err.message);
    return [];
  }
}

// ─── Remotive API (Free, global-friendly) ───
async function fetchRemotive() {
  const jobs = [];
  try {
    const { data } = await axios.get('https://remotive.com/api/remote-jobs', {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (data && data.jobs) {
      data.jobs.forEach(job => {
        jobs.push({
          source: 'Remotive',
          title: job.title || '',
          company: job.company_name || '',
          description: (job.description || '').replace(/<[^>]*>/g, '').substring(0, 500),
          url: job.url || '',
          salary: job.salary || null,
          tags: (job.tags || []).join(', ') + (job.category ? ', ' + job.category : ''),
          location: 'Remote',
          date: job.publication_date || null
        });
      });
    }
    // RSS supplement for more volume
    try {
      const rssResp = await axios.get('https://remotive.com/remote-jobs/feed', {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const rssText = typeof rssResp.data === 'string' ? rssResp.data : JSON.stringify(rssResp.data);
      const rssJobs = parseRSSJobs(rssText, 'Remotive');
      const existingUrls = new Set(jobs.map(j => j.url));
      for (const rj of rssJobs) {
        if (!existingUrls.has(rj.url)) {
          jobs.push(rj);
        }
      }
      console.log(`   Remotive RSS: ${rssJobs.length} supplementary jobs`);
    } catch (_) {}
    return jobs;
  } catch (err) {
    console.log('⚠️ Remotive fetch failed:', err.message);
    return [];
  }
}

// ─── Score a job against a profile ───
function scoreJob(job, profile) {
  let score = 0;
  let matchedTitles = 0;
  let matchedKeywords = 0;
  let rejectionHits = 0;
  const text = (job.title + ' ' + job.description + ' ' + job.tags + ' ' + (job.salary || '')).toLowerCase();
  const jobTitleOnly = (job.title || '').toLowerCase();

  // Match title (high weight) — only count if it matches the JOB TITLE
  for (const title of profile.titles) {
    if (jobTitleOnly.includes(title.toLowerCase())) {
      score += 30;
      matchedTitles++;
    }
  }

  // If NO title matched, severely reduce relevance of description-only keyword hits
  const noTitleMatch = matchedTitles === 0;

  // Match keywords (medium weight — but only valuable if title also matched)
  for (const kw of profile.keywords) {
    if (text.includes(kw.toLowerCase())) {
      if (noTitleMatch) {
        score += 2;  // Barely counts — description buzzwords alone don't mean fit
      } else {
        score += 10;
        matchedKeywords++;
      }
    }
  }

  // Rejection keywords (HEAVY penalty)
  const rejectKws = profile.rejectionKeywords || [];
  for (const rkw of rejectKws) {
    if (text.includes(rkw.toLowerCase())) {
      score -= 80;
      rejectionHits++;
    }
  }

  // Title-level seniority check — penalize but don't kill
  const jobTitle = (job.title || '').toLowerCase();
  const seniorTitles = ['senior ', 'lead ', 'principal ', 'head of ', 'director of ', 'vp of ', 'staff '];
  for (const st of seniorTitles) {
    if (jobTitle.includes(st)) {
      score -= 25;  // Small penalty — sometimes senior roles at startups are still achievable
      break;
    }
  }

  // Salary bonus
  if (job.salary) {
    const salaryStr = String(job.salary);
    const nums = salaryStr.match(/\d+/g);
    if (nums) {
      for (const n of nums) {
        const num = parseInt(n);
        if (num >= 80000) score += 10;   // $80k+/year — good
        if (num >= 100000) score += 5;   // $100k+/year
        if (num >= 150000) score += 5;   // $150k+/year
        if (num >= 200000) score += 5;   // $200k+/year
      }
    }
  }

  // Experience level check — penalize if asking for too many years
  const expMatch = text.match(/(\d+)[+]?\s*(?:year|yr|years|yrs)/g);
  if (expMatch) {
    for (const e of expMatch) {
      const num = parseInt(e.match(/\d+/)[0]);
      if (num > (profile.maxExpYears || 5)) {
        score -= 40;  // Penalty: job wants more experience than Isaac has
      }
    }
  }

  // Return both score and match quality metrics
  return { score, matchedTitles, matchedKeywords, rejectionHits };
}

// ─── Calculate confidence percentage (0-100) ───
function calculateConfidence(score, matchedTitles, matchedKeywords, rejectionHits) {
  // Base confidence from raw score (0-500 raw = 0-70% base)
  let confidence = Math.min(score / 3, 70);
  
  // Boost for title matches
  confidence += matchedTitles * 5;
  
  // Boost for keyword matches
  confidence += matchedKeywords * 2;
  
  // Heavy deduction for rejection hits
  confidence -= rejectionHits * 25;
  
  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(confidence)));
}

// ─── Main search: fetch all sources & match to profiles ───
async function searchJobs() {
  console.log('🔍 Fetching jobs from all sources...');
  
  const [remoteOK, wwr, jobicy, remotive, himalayas, arcdev, justremote, remoteco, day4week, realworkanywhere] = await Promise.allSettled([
    fetchRemoteOK(),
    fetchWeWorkRemotely(),
    fetchJobicy(),
    fetchRemotive(),
    fetchHimalayas(),
    fetchArcDev(),
    fetchJustRemote(),
    fetchRemoteCo(),
    fetch4DayWeek(),
    fetchRealWorkFromAnywhere()
  ]);

  const allJobs = [
    ...(remoteOK.status === 'fulfilled' ? remoteOK.value : []),
    ...(wwr.status === 'fulfilled' ? wwr.value : []),
    ...(jobicy.status === 'fulfilled' ? jobicy.value : []),
    ...(remotive.status === 'fulfilled' ? remotive.value : []),
    ...(himalayas.status === 'fulfilled' ? himalayas.value : []),
    ...(arcdev.status === 'fulfilled' ? arcdev.value : []),
    ...(justremote.status === 'fulfilled' ? justremote.value : []),
    ...(remoteco.status === 'fulfilled' ? remoteco.value : []),
    ...(day4week.status === 'fulfilled' ? day4week.value : []),
    ...(realworkanywhere.status === 'fulfilled' ? realworkanywhere.value : [])
  ];

  // Collect any additional jobs from fetchers that returned actual data
  // (some no-op stubs are still called but return [] harmlessly)

  console.log(`📊 Total raw jobs fetched: ${allJobs.length}`);

  // Deduplicate by URL
  const seen = new Set();
  const unique = allJobs.filter(j => {
    const key = j.url || j.title + j.company;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`📊 Unique jobs: ${unique.length}`);

  // Score and rank for each profile
  const results = {};
  for (const profile of profiles) {
    let scored = unique
      .map(job => {
        const s = scoreJob(job, profile);
        return { 
          ...job, 
          score: s.score,
          matchedTitles: s.matchedTitles,
          matchedKeywords: s.matchedKeywords,
          rejectionHits: s.rejectionHits,
          locationStatus: getLocationStatus(job)
        };
      })
      .map(job => {
        // Penalize restricted jobs, boost globally-open ones
        if (job.locationStatus === 'restricted') job.score -= 50;
        if (job.locationStatus === 'global') job.score += 20;
        
        // Calculate confidence
        job.confidence = calculateConfidence(
          job.score, job.matchedTitles, job.matchedKeywords, job.rejectionHits
        );
        
        return job;
      })
      .filter(job => job.score > 0 && job.confidence >= 10)  // Minimum 10% confidence to show
      .sort((a, b) => b.confidence - a.confidence)  // Sort by confidence
      .slice(0, 10);

    results[profile.id] = {
      profile,
      jobs: scored
    };

    console.log(`📊 ${profile.name}: ${scored.length} high-confidence matches found (threshold: 10%+)`);
  }

  return results;
}

module.exports = { searchJobs, scoreJob };
