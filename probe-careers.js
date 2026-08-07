// Probe careers pages for companies without ATS APIs
const axios = require('axios');
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const pages = [
  ['micro1', 'https://micro1.ai/careers'],
  ['bespoke-labs', 'https://www.bespokelabs.ai/careers'],
  ['sepal-ai', 'https://www.sepal.ai/careers'],
  ['plato', 'https://plato.group/careers'],
  ['deepframe', 'https://deepframe.io/careers'],
  ['datacurve', 'https://datacurve.ai/careers'],
  ['argilla', 'https://www.argilla.io/careers'],
  ['mercer', 'https://careers.mercer.com/'],
  ['mercer2', 'https://www.mercer.com/careers/'],
  ['turing2', 'https://www.turing.com/careers'],
];

async function probe(name, url) {
  try {
    const resp = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' } });
    const $ = cheerio.load(resp.data);
    const title = $('title').text().trim().substring(0, 80);
    const jobLinks = [];
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim().toLowerCase();
      if (/job|career|open|position|vacanc|role|hiring/i.test(text + ' ' + href) && href.length > 3 && href.length < 200) {
        if (jobLinks.length < 5) jobLinks.push(`${text.substring(0, 40)} -> ${href.substring(0, 80)}`);
      }
    });
    console.log(`\n${name} (${url})`);
    console.log(`  HTTP ${resp.status} | title: ${title}`);
    console.log(`  job-ish links (${jobLinks.length}+): ${jobLinks.slice(0, 5).join(' ; ')}`);
    return resp.status;
  } catch (e) {
    console.log(`\n${name} (${url}): FAIL ${e.message}`);
    return null;
  }
}

(async () => {
  for (const [n, u] of pages) {
    await probe(n, u);
    await new Promise(r => setTimeout(r, 400));
  }
})();
