// ============================================================
// 🏢 Company Research — Company intel, salary data, Glassdoor-like info
// Note: This uses web fetching since there are no free Glassdoor/Crunchbase APIs
// In production, consider adding proper MCP servers
// ============================================================

const axios = require('axios');

// Known public company info (curated for offline/default coverage)
const COMPANY_DB = {
  'google': {
    name: 'Google',
    industry: 'Technology',
    employees: '180,000+',
    founded: 1998,
    ceo: 'Sundar Pichai',
    hq: 'Mountain View, CA',
    salaries: {
      'Software Engineer': '$130k–$300k',
      'Product Manager': '$150k–$350k',
      'Data Scientist': '$140k–$270k'
    },
    interviewDifficulty: 'Hard',
    rating: 4.4,
    knownFor: 'Search, Cloud, Android, AI'
  },
  'microsoft': {
    name: 'Microsoft',
    industry: 'Technology',
    employees: '220,000+',
    founded: 1975,
    ceo: 'Satya Nadella',
    hq: 'Redmond, WA',
    salaries: {
      'Software Engineer': '$120k–$290k',
      'Product Manager': '$130k–$310k',
      'Data Scientist': '$140k–$260k'
    },
    interviewDifficulty: 'Medium/Hard',
    rating: 4.3,
    knownFor: 'Azure, Office, Windows, AI'
  },
  'meta': {
    name: 'Meta (Facebook)',
    aliases: ['facebook', 'meta platforms'],
    industry: 'Technology',
    employees: '70,000+',
    founded: 2004,
    ceo: 'Mark Zuckerberg',
    hq: 'Menlo Park, CA',
    salaries: {
      'Software Engineer': '$150k–$380k',
      'Data Engineer': '$140k–$310k',
      'AI Researcher': '$200k–$500k',
      'Product Manager': '$160k–$350k'
    },
    interviewDifficulty: 'Hard',
    rating: 4.0,
    knownFor: 'Facebook, Instagram, WhatsApp, Oculus'
  },
  'apple': {
    name: 'Apple',
    industry: 'Technology',
    employees: '160,000+',
    founded: 1976,
    ceo: 'Tim Cook',
    hq: 'Cupertino, CA',
    salaries: {
      'Software Engineer': '$120k–$280k',
      'AI Engineer': '$150k–$350k'
    },
    interviewDifficulty: 'Hard',
    rating: 4.3,
    knownFor: 'iPhone, Mac, Services'
  },
  'amazon': {
    name: 'Amazon',
    aliases: ['aws'],
    industry: 'Technology',
    employees: '1,500,000+',
    founded: 1994,
    ceo: 'Andy Jassy',
    hq: 'Seattle, WA',
    salaries: {
      'Software Engineer': '$110k–$260k',
      'AWS Engineer': '$120k–$320k',
      'Data Scientist': '$130k–$280k'
    },
    interviewDifficulty: 'Medium/Hard',
    rating: 3.8,
    knownFor: 'AWS, E-commerce, Prime'
  },
  'netflix': {
    name: 'Netflix',
    industry: 'Technology / Entertainment',
    employees: '12,000+',
    founded: 1997,
    ceo: 'Ted Sarandos & Greg Peters',
    hq: 'Los Gatos, CA',
    salaries: {
      'Software Engineer': '$200k–$500k',
      'Data Engineer': '$200k–$400k'
    },
    interviewDifficulty: 'Hard',
    rating: 4.2,
    knownFor: 'Streaming, Content'
  },
  'spotify': {
    name: 'Spotify',
    industry: 'Technology / Music',
    employees: '10,000+',
    founded: 2006,
    ceo: 'Daniel Ek',
    hq: 'Luxembourg',
    salaries: {
      'Software Engineer': '$120k–$250k',
      'Data Scientist': '$130k–$230k'
    },
    interviewDifficulty: 'Medium',
    rating: 4.0,
    knownFor: 'Music streaming, podcasts'
  },
  'stripe': {
    name: 'Stripe',
    aliases: ['stripe payments'],
    industry: 'Fintech',
    employees: '8,000+',
    founded: 2010,
    ceo: 'Patrick Collison',
    hq: 'South San Francisco / Dublin',
    salaries: {
      'Engineer': '$130k–$280k',
      'Product Manager': '$140k–$260k'
    },
    interviewDifficulty: 'Hard',
    rating: 4.5,
    knownFor: 'Online payment processing'
  },
  'linkedin': {
    name: 'LinkedIn',
    industry: 'Technology / Social',
    employees: '20,000+',
    founded: 2003,
    hq: 'Sunnyvale, CA',
    parent: 'Microsoft',
    salaries: {
      'Software Engineer': '$120k–$260k',
      'Data Scientist': '$130k–$250k'
    },
    interviewDifficulty: 'Medium',
    rating: 4.3,
    knownFor: 'Professional networking'
  },
  'salesforce': {
    name: 'Salesforce',
    industry: 'Technology / CRM',
    employees: '68,000+',
    founded: 1999,
    hq: 'San Francisco, CA',
    ceo: 'Marc Benioff',
    salaries: {
      'Software Engineer': '$100k–$230k',
      'Data Engineer': '$110k–$210k'
    },
    interviewDifficulty: 'Medium',
    rating: 4.2,
    knownFor: 'CRM, Cloud, Enterprise'
  },
  'twitter': {
    name: 'X (Twitter)',
    aliases: ['x', 'twitter-x'],
    industry: 'Technology / Social',
    employees: '1,500+',
    founded: 2006,
    ceo: 'Linda Yaccarino',
    hq: 'San Francisco, CA',
    salaries: {
      'Software Engineer': '$140k–$300k',
      'Data Engineer': '$130k–$260k'
    },
    interviewDifficulty: 'Hard',
    rating: 3.6,
    knownFor: 'Social networking, news'
  },
  'figma': {
    name: 'Figma',
    industry: 'Technology / Design',
    employees: '1,800+',
    founded: 2012,
    ceo: 'Dylan Field',
    hq: 'San Francisco, CA',
    salaries: {
      'Software Engineer': '$140k–$300k',
      'Product Manager': '$130k–$270k'
    },
    rating: 4.7,
    knownFor: 'Web-based UI/UX design'
  },
  'canva': {
    name: 'Canva',
    industry: 'Technology / Design',
    employees: '4,000+',
    founded: 2013,
    ceo: 'Melanie Perkins',
    hq: 'Sydney, Australia',
    salaries: {
      'Software Engineer': '$90k–$200k',
      'Data Scientist': '$100k–$190k'
    },
    rating: 4.6,
    knownFor: 'Online design platform'
  },
  'shopify': {
    name: 'Shopify',
    industry: 'Technology / eCommerce',
    employees: '8,000+',
    founded: 2004,
    ceo: 'Tobi Lutke',
    hq: 'Ottawa, Canada',
    salaries: {
      'Software Engineer': '$100k–$220k',
      'Data Analyst': '$90k–$170k'
    },
    interviewDifficulty: 'Medium',
    rating: 4.1,
    knownFor: 'eCommerce platform'
  },
  'airbnb': {
    name: 'Airbnb',
    aliases: ['air bnb'],
    industry: 'Technology / Travel',
    employees: '6,000+',
    founded: 2008,
    ceo: 'Brian Chesky',
    hq: 'San Francisco, CA',
    salaries: {
      'Software Engineer': '$130k–$280k',
      'Data Scientist': '$130k–$250k'
    },
    interviewDifficulty: 'Hard',
    rating: 4.4,
    knownFor: 'Short-term rental marketplace'
  },
  'uber': {
    name: 'Uber',
    aliases: ['uber technologies'],
    industry: 'Technology / Mobility',
    employees: '29,000+',
    founded: 2009,
    ceo: 'Dara Khosrowshahi',
    hq: 'San Francisco',
    salaries: {
      'Software Engineer': '$130k–$300k',
      'Data Engineer': '$120k–$250k',
      'Data Scientist': '$130k–$260k'
    },
    interviewDifficulty: 'Hard',
    rating: 3.8,
    knownFor: 'Ride-sharing, Uber Eats'
  },
  'openai': {
    name: 'OpenAI',
    industry: 'Artificial Intelligence',
    employees: '3,000+',
    founded: 2015,
    ceo: 'Sam Altman',
    hq: 'San Francisco',
    salaries: {
      'ML Engineer': '$180k–$400k',
      'AI Researcher': '$200k–$500k',
      'Software Engineer': '$150k–$350k',
      'Research Scientist': '$200k–$500k'
    },
    interviewDifficulty: 'Very Hard',
    rating: 4.4,
    knownFor: 'GPT, DALL-E, Sora, ChatGPT'
  },
  'deepmind': {
    name: 'DeepMind',
    industry: 'Artificial Intelligence',
    employees: '2,000+',
    founded: 2010,
    ceo: 'Demis Hassabis',
    hq: 'London, UK',
    parent: 'Google/Alphabet',
    salaries: {
      'AI Researcher': '$200k–$450k',
      'ML Engineer': '$150k–$350k'
    },
    interviewDifficulty: 'Very Hard',
    rating: 4.6,
    knownFor: 'AlphaGo, AlphaFold, AI research'
  },
  'anthropic': {
    name: 'Anthropic',
    industry: 'Artificial Intelligence',
    employees: '1,000',
    founded: 2021,
    ceo: 'Dario Amodei',
    hq: 'San Francisco',
    salaries: {
      'Research Scientist': '$200k–$500k',
      'Software Engineer': '$150k–$400k',
      'ML Engineer': '$180k–$450k'
    },
    interviewDifficulty: 'Very Hard',
    rating: 4.3,
    knownFor: 'Claude AI, AI safety'
  },
  'datadog': {
    name: 'Datadog',
    industry: 'Technology / Cloud',
    employees: '6,500+',
    hq: 'New York',
    ceo: 'Olivier Pomel',
    founded: 2010,
    salaries: {
      'Software Engineer': '$120k–$260k',
      'Data Engineer': '$110k–$230k'
    },
    interviewDifficulty: 'Medium/Hard',
    rating: 4.2,
    knownFor: 'Cloud monitoring & analytics'
  },
  'roblox': {
    name: 'Roblox',
    industry: 'Gaming / Technology',
    employees: '6,000+',
    hq: 'San Mateo',
    ceo: 'David Baszucki',
    founded: 2004,
    knownFor: 'Online game platform & creation'
  },
  'stripe': {
    name: 'Stripe',
    industry: 'Fintech',
    employees: '8,000+',
    hq: 'South San Francisco',
    founded: 2010
  },
  'coinbase': {
    name: 'Coinbase',
    industry: 'Fintech / Crypto',
    employees: '4,600+',
    hq: 'San Francisco',
    ceo: 'Brian Armstrong',
    founded: 2012,
    salaries: {
      'Software Engineer': '$140k–$300k',
      'Product Manager': '$120k–$250k',
      'Blockchain Engineer': '$150k–$350k'
    },
    interviewDifficulty: 'Hard',
    rating: 3.9,
    knownFor: 'Cryptocurrency exchange'
  },
  'robinhood': {
    name: 'Robinhood',
    industry: 'Fintech',
    employees: '3,800+',
    hq: 'Menlo Park',
    ceo: 'Vlad Tenev',
    founded: 2013,
    knownFor: 'Commission-free stock trading'
  },
  'airbnb': {
    name: 'Airbnb',
    industry: 'Technology / Travel',
    employees: '6,000+',
    hq: 'San Francisco',
    ceo: 'Brian Chesky',
    founded: 2008
  },
  'figma': {
    name: 'Figma',
    industry: 'Technology / Design',
    employees: '1,800+',
    hq: 'San Francisco',
    ceo: 'Dyan Field',
    founded: 2012
  },
  'pinterest': {
    name: 'Pinterest',
    industry: 'Technology / Social',
    employees: '3,800+',
    hq: 'San Francisco',
    ceo: 'Bill Ready',
    founded: 2010
  },
  'notion': {
    name: 'Notion',
    industry: 'Technology / Software',
    employees: '600+',
    hq: 'San Francisco',
    ceo: 'Simon Last',
    founded: 2013,
    knownFor: 'All-in-one workspace'
  }
};

class CompanyResearch {
  constructor() {
    this.companyCache = new Map();
  }

  find(name) {
    const lowerName = String(name).toLowerCase().trim();

    // Direct match
    if (COMPANY_DB[lowerName]) return COMPANY_DB[lowerName];

    // Fuzzy match: iterate through keys
    for (const [key, value] of Object.entries(COMPANY_DB)) {
      const entryName = value.name.toLowerCase();
      const aliases = value.aliases || [];

      // Check name
      if (entryName.includes(lowerName) || lowerName.includes(entryName)) {
        return value;
      }

      // Check aliases
      for (const alias of aliases) {
        if (alias.includes(lowerName) || lowerName.includes(alias)) {
          return value;
        }
      }

      // Check company name contains query (partial match)
      if (entryName.split(/\s+/).some(w => w.length > 2 && lowerName.includes(w))) {
        return value;
      }
    }

    return null;
  }

  formatReport(company) {
    if (!company) return null;

    const lines = [`🏛 *${company.name}*`];
    lines.push('');

    // Basic info
    lines.push(`📊 *Company Info:*`);
    if (company.industry) lines.push(`• Industry: ${company.industry}`);
    if (company.founded) lines.push(`• Founded: ${company.founded}`);
    if (company.employees) lines.push(`• Employees: ${company.employees}`);
    if (company.hq) lines.push(`• HQ: ${company.hq}`);
    if (company.ceo) lines.push(`• CEO: ${company.ceo}`);
    if (company.parent) lines.push(`• Parent: ${company.parent}`);
    if (company.knownFor) lines.push(`\n🔬 *Known For:* ${company.knownFor}`);

    // Salaries
    if (company.salaries) {
      lines.push('');
      lines.push(`💰 *Salary Ranges:*`);
      for (const [role, salary] of Object.entries(company.salaries)) {
        lines.push(`• ${role}: ${salary}`);
      }
    }

    // Rating
    if (company.rating) {
      const stars = '⭐'.repeat(Math.round(company.rating));
      const partial = Math.round(company.rating) !== company.rating;
      const ratingStr = stars + (partial ? '½' : '');
      lines.push(`\n🏆 Rating: ${ratingStr} (${company.rating.toFixed(1)}/5)`);
    }

    if (company.interviewDifficulty) {
      lines.push(`🧠 Interview: ${company.interviewDifficulty}`);
    }

    return lines.join('\n');
  }

  /**
   * Attempt to fetch additional info online (best-effort)
   * Falls back to COMPANY_DB without breaking
   */
  async fetchInfo(name) {
    // Currently returns only database info
    // In future: could add Crunchbase/Bloomberg/Magic MCP for live data
    const company = this.find(name);
    return company;
  }
}

module.exports = { CompanyResearch, COMPANY_DB };
