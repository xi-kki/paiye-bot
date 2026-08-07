// Probe ATS endpoints (Greenhouse / Lever / Ashby) for each AI training company
const axios = require('axios');

const companies = [
  'scaleai', 'surge-ai', 'mercer', 'handshake', 'micro1', 'turing',
  'afterquery', 'fleet', 'deepframe', 'bespoke-labs', 'mechanize',
  'sepal-ai', 'hud', 'plato', 'toloka', 'encord', 'cortex', 'arena',
  'david-ai', 'protege', 'datacurve', 'truveta', 'snorkelai', 'labelbox', 'argilla'
];

const UAs = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

async function tryFetch(url, label) {
  try {
    const resp = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': UAs[0], 'Accept': 'application/json, text/html, */*' }
    });
    const isJson = typeof resp.data === 'object';
    const count = Array.isArray(resp.data) ? resp.data.length
      : (resp.data && resp.data.jobs && Array.isArray(resp.data.jobs)) ? resp.data.jobs.length
      : (resp.data && resp.data.data) ? (Array.isArray(resp.data.data) ? resp.data.data.length : 'obj')
      : '?';
    return `✅ ${label} (${isJson ? 'JSON' : 'HTML'} jobs=${count})`;
  } catch (e) {
    if (e.response && (e.response.status === 404 || e.response.status === 403)) return null;
    return null;
  }
}

async function probe(name) {
  const results = [];
  // Greenhouse
  results.push(await tryFetch(`https://boards-api.greenhouse.io/v1/boards/${name}/jobs`, `GH:${name}`));
  // Lever
  results.push(await tryFetch(`https://api.lever.co/v0/postings/${name}?mode=json`, `LEV:${name}`));
  // Ashby
  results.push(await tryFetch(`https://api.ashbyhq.com/posting-api/job-board/${name}?includeCompensation=true`, `ASH:${name}`));
  return results.filter(Boolean);
}

(async () => {
  for (const c of companies) {
    const found = await probe(c);
    if (found.length) {
      console.log(`${c}: ${found.join(' | ')}`);
    } else {
      console.log(`${c}: --`);
    }
    await new Promise(r => setTimeout(r, 300));
  }
})();
