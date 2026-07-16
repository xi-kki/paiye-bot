// ============================================================
// 🔍 Job MCP Layer — Multi-source job search (simple UI, powerful backend)
// ============================================================

const axios = require('axios');

// ─── Rotating User-Agent ───
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
];
let uaIdx = 0;
function nextUA() { return USER_AGENTS[uaIdx++ % USER_AGENTS.length]; }

// ─── Polite fetch ───
async function fetch(url, opts = {}) {
  return axios.get(url, {
    timeout: opts.timeout || 12000,
    headers: {
      'User-Agent': nextUA(),
      'Accept': 'application/json, text/html, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    ...opts,
  });
}

// ═══════════════════════════════════════════════════════════
// SOURCE 1: Himalayas.app (remote jobs)
// ═══════════════════════════════════════════════════════════
async function searchHimalayas(query = '', limit = 5) {
  try {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    params.set('limit', String(limit));
    
    const { data } = await fetch(`https://himalayas.app/jobs/api?${params}`);
    const jobs = (data.jobs || []).map(j => ({
      title: j.title || 'Untitled',
      company: j.companyName || j.company || 'Unknown',
      location: j.location || 'Remote',
      salary: j.salary || null,
      url: j.url || j.applyUrl || `https://himalayas.app/jobs/${j.slug}`,
      source: 'Himalayas',
      description: (j.description || '').substring(0, 200),
      tags: j.tags || [],
      postedAt: j.postedAt || j.datePosted || null,
    }));
    return jobs.slice(0, limit);
  } catch (err) {
    console.error('⚠️ Himalayas error:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// SOURCE 2: RemoteOK API
// ═══════════════════════════════════════════════════════════
async function searchRemoteOK(query = '', limit = 5) {
  try {
    const { data } = await fetch('https://remoteok.com/api');
    let jobs = Array.isArray(data) ? data.slice(1) : []; // first item is metadata
    
    if (query) {
      const q = query.toLowerCase();
      jobs = jobs.filter(j =>
        (j.position || '').toLowerCase().includes(q) ||
        (j.company || '').toLowerCase().includes(q) ||
        (j.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    
    return jobs.slice(0, limit).map(j => ({
      title: j.position || 'Untitled',
      company: j.company || 'Unknown',
      location: j.location || 'Remote',
      salary: j.salary_min ? `$${(j.salary_min/1000).toFixed(0)}k-$${(j.salary_max/1000).toFixed(0)}k` : null,
      url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
      source: 'RemoteOK',
      description: (j.description || '').substring(0, 200).replace(/<[^>]*>/g, ''),
      tags: j.tags || [],
      postedAt: j.date || null,
    }));
  } catch (err) {
    console.error('⚠️ RemoteOK error:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// SOURCE 3: Remotive API
// ═══════════════════════════════════════════════════════════
async function searchRemotive(query = '', limit = 5) {
  try {
    const { data } = await fetch('https://remotive.com/api/remote-jobs');
    let jobs = data.jobs || [];
    
    if (query) {
      const q = query.toLowerCase();
      jobs = jobs.filter(j =>
        (j.title || '').toLowerCase().includes(q) ||
        (j.company_name || '').toLowerCase().includes(q) ||
        (j.category || '').toLowerCase().includes(q) ||
        (j.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    
    return jobs.slice(0, limit).map(j => ({
      title: j.title || 'Untitled',
      company: j.company_name || 'Unknown',
      location: j.candidate_required_location || 'Remote',
      salary: j.salary || null,
      url: j.url || j.apply_url,
      source: 'Remotive',
      description: (j.description || '').substring(0, 200).replace(/<[^>]*>/g, ''),
      tags: j.tags || [],
      postedAt: j.publication_date || null,
    }));
  } catch (err) {
    console.error('⚠️ Remotive error:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// SOURCE 4: Jobicy API (remote jobs)
// ═══════════════════════════════════════════════════════════
async function searchJobicy(query = '', limit = 5) {
  try {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    params.set('count', String(limit));
    
    const { data } = await fetch(`https://jobicy.com/api/v2/remote-jobs?${params}`);
    const jobs = data.jobs || [];
    
    return jobs.slice(0, limit).map(j => ({
      title: j.jobTitle || 'Untitled',
      company: j.companyName || 'Unknown',
      location: j.jobGeo || 'Remote',
      salary: j.annualSalaryMin ? `$${(j.annualSalaryMin/1000).toFixed(0)}k-$${(j.annualSalaryMax/1000).toFixed(0)}k` : null,
      url: j.url || j.applyUrl,
      source: 'Jobicy',
      description: (j.jobDescription || '').substring(0, 200).replace(/<[^>]*>/g, ''),
      tags: j.jobTags || [],
      postedAt: j.pubDate || null,
    }));
  } catch (err) {
    console.error('⚠️ Jobicy error:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// SOURCE 5: Arbeitnow (Africa-friendly)
// ═══════════════════════════════════════════════════════════
async function searchArbeitnow(query = '', limit = 5) {
  try {
    const { data } = await fetch('https://www.arbeitnow.com/api/job-board-api');
    let jobs = data.data || [];
    
    if (query) {
      const q = query.toLowerCase();
      jobs = jobs.filter(j =>
        (j.title || '').toLowerCase().includes(q) ||
        (j.company_name || '').toLowerCase().includes(q) ||
        (j.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    
    return jobs.slice(0, limit).map(j => ({
      title: j.title || 'Untitled',
      company: j.company_name || 'Unknown',
      location: j.location || 'Remote',
      salary: null,
      url: j.url || j.apply_url,
      source: 'Arbeitnow',
      description: (j.description || '').substring(0, 200).replace(/<[^>]*>/g, ''),
      tags: j.tags || [],
      postedAt: j.created_at || null,
      remote: j.remote || false,
    }));
  } catch (err) {
    console.error('⚠️ Arbeitnow error:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// SOURCE 6: Findwork.dev (tech jobs)
// ═══════════════════════════════════════════════════════════
async function searchFindwork(query = '', limit = 5) {
  try {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    
    const { data } = await fetch(`https://findwork.dev/api/jobs/?${params}`, {
      headers: { 'Authorization': `Token ${process.env.FINDWORK_API_KEY}` },
    });
    const jobs = data.results || [];
    
    return jobs.slice(0, limit).map(j => ({
      title: j.position || 'Untitled',
      company: j.company_name || 'Unknown',
      location: j.location || 'Remote',
      salary: null,
      url: j.url || j.apply_url,
      source: 'Findwork',
      description: (j.text || '').substring(0, 200).replace(/<[^>]*>/g, ''),
      tags: j.employment_type ? [j.employment_type] : [],
      postedAt: j.date_posted || null,
      remote: true,
    }));
  } catch (err) {
    console.error('⚠️ Findwork error:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// SOURCE 7: Jooble (global job aggregator)
// ═══════════════════════════════════════════════════════════
async function searchJooble(query = '', limit = 5) {
  try {
    const { data } = await axios.post('https://jooble.org/api/', {
      keywords: query || 'remote',
      location: '',
      page: 1,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 12000,
    });
    const jobs = data.jobs || [];
    
    return jobs.slice(0, limit).map(j => ({
      title: j.title || 'Untitled',
      company: j.company || 'Unknown',
      location: j.location || 'Remote',
      salary: j.salary || null,
      url: j.url || j.link,
      source: 'Jooble',
      description: (j.snippet || '').substring(0, 200).replace(/<[^>]*>/g, ''),
      tags: j.type || [],
      postedAt: j.date || null,
      remote: (j.location || '').toLowerCase().includes('remote'),
    }));
  } catch (err) {
    console.error('⚠️ Jooble error:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// SOURCE 8: Working Nomads (remote/async jobs)
// ═══════════════════════════════════════════════════════════
async function searchWorkingNomads(query = '', limit = 5) {
  try {
    const { data } = await fetch('https://www.workingnomads.com/apiexposedjobs.json');
    let jobs = Array.isArray(data) ? data : (data.jobs || []);
    
    if (query) {
      const q = query.toLowerCase();
      jobs = jobs.filter(j =>
        (j.title || '').toLowerCase().includes(q) ||
        (j.company || '').toLowerCase().includes(q) ||
        (j.tags || '').toLowerCase().includes(q) ||
        (j.description || '').toLowerCase().includes(q)
      );
    }
    
    return jobs.slice(0, limit).map(j => ({
      title: j.title || 'Untitled',
      company: j.company || 'Unknown',
      location: j.location || 'Remote',
      salary: j.salary || null,
      url: j.url || j.applyUrl,
      source: 'Working Nomads',
      description: (j.description || '').substring(0, 200).replace(/<[^>]*>/g, ''),
      tags: (j.tags || '').split(',').map(t => t.trim()).filter(Boolean),
      postedAt: j.datePosted || null,
      remote: true,
    }));
  } catch (err) {
    console.error('⚠️ Working Nomads error:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// SOURCE 9: The Muse (tech/startup jobs)
// ═══════════════════════════════════════════════════════════
async function searchTheMuse(query = '', limit = 5) {
  try {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    params.set('page', '1');
    
    const { data } = await fetch(`https://www.themuse.com/api/public/jobs?${params}`);
    const jobs = data.results || [];
    
    return jobs.slice(0, limit).map(j => ({
      title: j.name || 'Untitled',
      company: (j.company && j.company.name) || 'Unknown',
      location: (j.locations && j.locations[0] && j.locations[0].name) || 'Remote',
      salary: j.salary || null,
      url: j.refs && j.refs.landing_page,
      source: 'The Muse',
      description: (j.description || '').substring(0, 200).replace(/<[^>]*>/g, ''),
      tags: (j.categories || []).map(c => c.name),
      postedAt: j.publication_date || null,
    }));
  } catch (err) {
    console.error('⚠️ The Muse error:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// SOURCE 10: Authentic Jobs (web/design/dev)
// ═══════════════════════════════════════════════════════════
async function searchAuthenticJobs(query = '', limit = 5) {
  try {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    params.set('page', '1');
    
    const { data } = await fetch(`https://authenticjobs.com/api/jobs.json?${params}`);
    let jobs = data.listings || [];
    
    if (query) {
      const q = query.toLowerCase();
      jobs = jobs.filter(j =>
        (j.title || '').toLowerCase().includes(q) ||
        (j.company && j.company.name || '').toLowerCase().includes(q) ||
        (j.tags || []).some(t => (t.name || '').toLowerCase().includes(q))
      );
    }
    
    return jobs.slice(0, limit).map(j => ({
      title: j.title || 'Untitled',
      company: (j.company && j.company.name) || 'Unknown',
      location: (j.telecommuting && j.telecommuting === 1) ? 'Remote' : (j.location || 'Remote'),
      salary: null,
      url: j.apply_url || j.url,
      source: 'Authentic Jobs',
      description: (j.description || '').substring(0, 200).replace(/<[^>]*>/g, ''),
      tags: (j.tags || []).map(t => t.name),
      postedAt: j.posted_at || null,
      remote: j.telecommuting === 1,
    }));
  } catch (err) {
    console.error('⚠️ Authentic Jobs error:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// SOURCE 11: JSearch (LinkedIn jobs via RapidAPI)
// ═══════════════════════════════════════════════════════════
async function searchJSearch(query = '', limit = 5) {
  try {
    const params = new URLSearchParams();
    params.set('query', query || 'remote');
    params.set('page', '1');
    params.set('num_pages', '1');
    
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      console.log('ℹ️ JSearch skipped: no RAPIDAPI_KEY set');
      return [];
    }
    
    const { data } = await fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
    });
    const jobs = data.data || [];
    
    return jobs.slice(0, limit).map(j => ({
      title: j.job_title || 'Untitled',
      company: j.employer_name || 'Unknown',
      location: j.job_city ? `${j.job_city}, ${j.job_state || ''}` : (j.job_country || 'Remote'),
      salary: j.job_min_salary ? `$${j.job_min_salary}-$${j.job_max_salary}` : null,
      url: j.job_apply_link || j.job_google_link,
      source: 'LinkedIn',
      description: (j.job_description || '').substring(0, 200).replace(/<[^>]*>/g, ''),
      tags: j.job_keywords || [],
      postedAt: j.job_posted_at_datetime_utc || null,
      remote: j.job_is_remote || false,
      logo: j.employer_logo || null,
    }));
  } catch (err) {
    console.error('⚠️ JSearch error:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// SOURCE 12: Adzuna (global job aggregator)
// ═══════════════════════════════════════════════════════════
async function searchAdzuna(query = '', limit = 5) {
  try {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    
    if (!appId || !appKey) {
      console.log('ℹ️ Adzuna skipped: no ADZUNA_APP_ID/KEY set');
      return [];
    }
    
    const params = new URLSearchParams();
    params.set('app_id', appId);
    params.set('app_key', appKey);
    params.set('results_per_page', String(limit));
    params.set('what', query || '');
    params.set('content-type', 'application/json');
    
    const { data } = await fetch(`https://api.adzuna.com/v1/api/jobs/us/search/1?${params}`);
    const jobs = data.results || [];
    
    return jobs.slice(0, limit).map(j => ({
      title: j.title || 'Untitled',
      company: j.company && j.company.display_name || 'Unknown',
      location: j.location && j.location.display_name || 'Remote',
      salary: j.salary_min ? `$${(j.salary_min/1000).toFixed(0)}k-$${(j.salary_max/1000).toFixed(0)}k` : null,
      url: j.redirect_url,
      source: 'Adzuna',
      description: (j.description || '').substring(0, 200).replace(/<[^>]*>/g, ''),
      tags: j.categories || [],
      postedAt: j.created || null,
      remote: false,
    }));
  } catch (err) {
    console.error('⚠️ Adzuna error:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// MEGA SEARCH — All sources combined, deduplicated, scored
// ═══════════════════════════════════════════════════════════
async function megaSearch(query, options = {}) {
  const { limit = 5, sources = 'all' } = options;
  
  console.log(`🔍 Mega-searching: "${query}" across ${sources === 'all' ? '12 sources' : sources}...`);
  
  const searchFns = {
    himalayas: () => searchHimalayas(query, limit + 5),
    remoteok: () => searchRemoteOK(query, limit + 5),
    remotive: () => searchRemotive(query, limit + 5),
    jobicy: () => searchJobicy(query, limit + 5),
    arbeitnow: () => searchArbeitnow(query, limit + 5),
    findwork: () => searchFindwork(query, limit + 5),
    jooble: () => searchJooble(query, limit + 5),
    workingnomads: () => searchWorkingNomads(query, limit + 5),
    themuse: () => searchTheMuse(query, limit + 5),
    authenticjobs: () => searchAuthenticJobs(query, limit + 5),
    jsearch: () => searchJSearch(query, limit + 5),
    adzuna: () => searchAdzuna(query, limit + 5),
  };
  
  // Pick which sources to search
  const toSearch = sources === 'all' 
    ? Object.keys(searchFns)
    : sources.split(',').filter(s => searchFns[s]);
  
  // Run all searches in parallel
  const results = await Promise.allSettled(
    toSearch.map(name => searchFns[name]())
  );
  
  // Track source stats
  const sourceStats = {};
  let totalFetched = 0;
  
  for (let i = 0; i < toSearch.length; i++) {
    const name = toSearch[i];
    const result = results[i];
    const count = (result.status === 'fulfilled' && Array.isArray(result.value)) ? result.value.length : 0;
    sourceStats[name] = count;
    totalFetched += count;
  }
  
  console.log(`📊 Sources: ${JSON.stringify(sourceStats)}`);
  console.log(`📦 Total fetched: ${totalFetched}`);
  
  // Flatten and deduplicate
  const allJobs = [];
  const seen = new Set();
  
  for (const result of results) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      for (const job of result.value) {
        // Dedupe by title + company
        const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          allJobs.push(job);
        }
      }
    }
  }
  
  console.log(`🔄 After dedup: ${allJobs.length} unique jobs`);
  
  // Score jobs based on query relevance
  const scored = allJobs.map(job => {
    let score = 50; // base
    const q = query.toLowerCase();
    const title = (job.title || '').toLowerCase();
    const company = (job.company || '').toLowerCase();
    const tags = (job.tags || []).map(t => t.toLowerCase()).join(' ');
    const desc = (job.description || '').toLowerCase();
    
    // Title match (highest weight)
    if (title.includes(q)) score += 30;
    else if (q.split(' ').some(w => title.includes(w))) score += 15;
    
    // Tags match
    if (q.split(' ').some(w => tags.includes(w))) score += 10;
    
    // Description match
    if (q.split(' ').some(w => desc.includes(w))) score += 5;
    
    // Salary bonus
    if (job.salary) score += 5;
    
    // Remote bonus
    if (job.remote || (job.location || '').toLowerCase().includes('remote')) score += 5;
    
    return { ...job, score: Math.min(score, 99) };
  });
  
  // Sort by score, return top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════
module.exports = {
  megaSearch,
  // Free sources (no API key needed)
  searchHimalayas,
  searchRemoteOK,
  searchRemotive,
  searchJobicy,
  searchArbeitnow,
  searchFindwork,
  searchJooble,
  searchWorkingNomads,
  searchAuthenticJobs,
  // Sources with optional/free API keys
  searchTheMuse,
  searchJSearch,
  searchAdzuna,
};
