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
      headers: { 'Authorization': 'Token demo' },
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
// MEGA SEARCH — All sources combined, deduplicated, scored
// ═══════════════════════════════════════════════════════════
async function megaSearch(query, options = {}) {
  const { limit = 5, sources = 'all' } = options;
  
  console.log(`🔍 Mega-searching: "${query}" across ${sources === 'all' ? '6 sources' : sources}...`);
  
  const searchFns = {
    himalayas: () => searchHimalayas(query, limit + 5),
    remoteok: () => searchRemoteOK(query, limit + 5),
    remotive: () => searchRemotive(query, limit + 5),
    jobicy: () => searchJobicy(query, limit + 5),
    arbeitnow: () => searchArbeitnow(query, limit + 5),
    findwork: () => searchFindwork(query, limit + 5),
  };
  
  // Pick which sources to search
  const toSearch = sources === 'all' 
    ? Object.keys(searchFns)
    : sources.split(',').filter(s => searchFns[s]);
  
  // Run all searches in parallel
  const results = await Promise.allSettled(
    toSearch.map(name => searchFns[name]())
  );
  
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
  searchHimalayas,
  searchRemoteOK,
  searchRemotive,
  searchJobicy,
  searchArbeitnow,
  searchFindwork,
};
