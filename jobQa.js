// ============================================================
// 🛡️ Job QA System — Quality Assurance for Job Search
//    Fresh jobs • Dead link detection • Smart matching • ATS advice
// ============================================================

const axios = require('axios');

// ─── Config ───
const MAX_JOB_AGE_DAYS = 7;
const FRESH_JOB_AGE_DAYS = 3;
const DEAD_LINK_TIMEOUT = 5000;

// ─── Dead job indicators ───
const DEAD_INDICATORS = [
  'no longer accepting',
  'position filled',
  'position has been filled',
  'job has been filled',
  'this job has expired',
  'this position has expired',
  'applications are closed',
  'applications closed',
  'no longer available',
  'job is no longer',
  'role has been filled',
  'we are no longer',
  'hiring has been closed',
  'requisition has been closed',
  'job posting has expired',
];

// ─── Spam/low quality indicators ───
const SPAM_INDICATORS = [
  'work from home and earn',
  'make money fast',
  'unlimited earning potential',
  'join our team of winners',
  'financial freedom',
  'be your own boss',
  'no experience needed',
  'guaranteed income',
];

// ═══════════════════════════════════════════════════════════
// 1. FRESHNESS FILTER
// ═══════════════════════════════════════════════════════════

function isJobFresh(job, maxDays = MAX_JOB_AGE_DAYS) {
  const posted = job.postedAt || job.date || job.publication_date || job.created_at;
  if (!posted) return true; // If no date, assume fresh (many sources don't provide dates)
  
  const postedDate = new Date(posted);
  const now = new Date();
  const diffDays = (now - postedDate) / (1000 * 60 * 60 * 24);
  
  return diffDays <= maxDays;
}

function getJobAge(job) {
  const posted = job.postedAt || job.date || job.publication_date || job.created_at;
  if (!posted) return null;
  
  const postedDate = new Date(posted);
  const now = new Date();
  const diffDays = Math.floor((now - postedDate) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

function filterFreshJobs(jobs, maxDays = MAX_JOB_AGE_DAYS) {
  return jobs.filter(job => isJobFresh(job, maxDays));
}

// ═══════════════════════════════════════════════════════════
// 2. DEAD JOB DETECTION
// ═══════════════════════════════════════════════════════════

async function checkUrlAlive(url) {
  if (!url) return { alive: false, reason: 'No URL provided' };
  
  try {
    const response = await axios.head(url, {
      timeout: DEAD_LINK_TIMEOUT,
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Accept 4xx as "alive" but note it
    });
    
    if (response.status === 404) {
      return { alive: false, reason: 'Page not found (404)' };
    }
    if (response.status === 410) {
      return { alive: false, reason: 'Page permanently removed (410)' };
    }
    if (response.status >= 400) {
      return { alive: false, reason: `HTTP ${response.status}` };
    }
    
    return { alive: true, status: response.status };
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return { alive: null, reason: 'Timeout - could not verify' };
    }
    return { alive: false, reason: err.message };
  }
}

async function checkJobPageContent(url) {
  if (!url) return { valid: true };
  
  try {
    const response = await axios.get(url, {
      timeout: DEAD_LINK_TIMEOUT,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    const content = (response.data || '').toLowerCase();
    
    // Check for dead job indicators
    for (const indicator of DEAD_INDICATORS) {
      if (content.includes(indicator)) {
        return { valid: false, reason: `Job posting says: "${indicator}"` };
      }
    }
    
    // Check for spam indicators
    for (const indicator of SPAM_INDICATORS) {
      if (content.includes(indicator)) {
        return { valid: true, warning: `Possibly low quality: "${indicator}"` };
      }
    }
    
    return { valid: true };
  } catch (err) {
    return { valid: true, warning: 'Could not verify page content' };
  }
}

async function verifyJob(job) {
  const urlCheck = await checkUrlAlive(job.url);
  
  if (urlCheck.alive === false) {
    return { ...job, verified: false, verifyReason: urlCheck.reason };
  }
  
  const contentCheck = await checkJobPageContent(job.url);
  
  return {
    ...job,
    verified: contentCheck.valid,
    verifyReason: contentCheck.reason || null,
    warning: contentCheck.warning || null,
  };
}

async function verifyJobs(jobs, maxConcurrent = 3) {
  // Verify jobs in batches to avoid rate limiting
  const verified = [];
  for (let i = 0; i < jobs.length; i += maxConcurrent) {
    const batch = jobs.slice(i, i + maxConcurrent);
    const results = await Promise.all(batch.map(job => verifyJob(job)));
    verified.push(...results);
  }
  return verified;
}

// ═══════════════════════════════════════════════════════════
// 3. SKILL EXTRACTION (from resume)
// ═══════════════════════════════════════════════════════════

// Common tech skills database
const SKILLS_DB = {
  languages: [
    'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'golang',
    'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'r', 'matlab',
    'sql', 'html', 'css', 'sass', 'less',
  ],
  frameworks: [
    'react', 'reactjs', 'next.js', 'nextjs', 'vue', 'vuejs', 'angular',
    'node.js', 'nodejs', 'express', 'django', 'flask', 'fastapi',
    'spring', 'springboot', 'rails', 'laravel', 'symfony',
    'tailwind', 'bootstrap', 'material-ui', 'shadcn',
  ],
  databases: [
    'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'elasticsearch',
    'sqlite', 'oracle', 'sql server', 'dynamodb', 'cassandra', 'firebase',
    'supabase', 'prisma', 'typeorm', 'sequelize', 'mongoose',
  ],
  cloud: [
    'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'k8s',
    'terraform', 'ansible', 'jenkins', 'ci/cd', 'github actions',
    'vercel', 'netlify', 'heroku', 'railway', 'digitalocean',
  ],
  ai_ml: [
    'machine learning', 'ml', 'deep learning', 'ai', 'artificial intelligence',
    'tensorflow', 'pytorch', 'keras', 'scikit-learn', 'sklearn',
    'nlp', 'natural language processing', 'computer vision',
    'llm', 'large language model', 'gpt', 'transformers', 'huggingface',
    'langchain', 'openai', 'anthropic', 'groq',
  ],
  data: [
    'data science', 'data analysis', 'data engineering', 'data pipeline',
    'etl', 'airflow', 'spark', 'hadoop', 'kafka', 'pandas', 'numpy',
    'tableau', 'power bi', 'looker', 'bigquery', 'snowflake', 'redshift',
  ],
  tools: [
    'git', 'github', 'gitlab', 'jira', 'confluence', 'slack',
    'figma', 'sketch', 'adobe xd', 'photoshop', 'illustrator',
    'postman', 'swagger', 'docker', 'webpack', 'vite', 'npm', 'yarn',
  ],
  soft: [
    'leadership', 'communication', 'teamwork', 'problem solving',
    'critical thinking', 'time management', 'agile', 'scrum',
    'project management', 'product management', 'mentoring',
  ],
};

const ALL_SKILLS = Object.values(SKILLS_DB).flat();

function extractSkillsFromText(text) {
  if (!text) return [];
  
  const lower = text.toLowerCase();
  const found = [];
  
  for (const skill of ALL_SKILLS) {
    // Check for exact match or word boundary match
    const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) {
      found.push(skill);
    }
  }
  
  return [...new Set(found)]; // Deduplicate
}

function extractSkillsFromResume(resumeText) {
  const skills = extractSkillsFromText(resumeText);
  
  // Categorize skills
  const categorized = {};
  for (const [category, categorySkills] of Object.entries(SKILLS_DB)) {
    const matched = skills.filter(s => categorySkills.includes(s));
    if (matched.length > 0) {
      categorized[category] = matched;
    }
  }
  
  return {
    all: skills,
    categorized,
    count: skills.length,
  };
}

// ═══════════════════════════════════════════════════════════
// 4. JOB-RESUME MATCHING ALGORITHM
// ═══════════════════════════════════════════════════════════

function calculateMatchScore(job, userSkills = [], resumeText = '') {
  let score = 0;
  const reasons = { positive: [], negative: [], neutral: [] };
  
  // ─── Skills Match (40 points) ───
  const jobText = `${job.title || ''} ${(job.tags || []).join(' ')} ${job.description || ''}`.toLowerCase();
  const jobSkills = extractSkillsFromText(jobText);
  
  let skillsMatched = 0;
  let skillsMissing = [];
  
  for (const skill of userSkills) {
    if (jobSkills.includes(skill)) {
      skillsMatched++;
      reasons.positive.push(`✅ You have: ${skill}`);
    } else if (jobText.includes(skill)) {
      skillsMatched += 0.5; // Partial match
    }
  }
  
  for (const skill of jobSkills) {
    if (!userSkills.includes(skill) && userSkills.length > 0) {
      skillsMissing.push(skill);
    }
  }
  
  const skillScore = userSkills.length > 0 
    ? Math.round((skillsMatched / Math.max(jobSkills.length, 1)) * 40)
    : 20; // Default if no skills provided
  
  score += Math.min(skillScore, 40);
  
  if (skillsMissing.length > 0 && skillsMissing.length <= 3) {
    reasons.negative.push(`⚠️ Consider adding: ${skillsMissing.slice(0, 3).join(', ')}`);
  }
  
  // ─── Experience Level Match (20 points) ───
  const expIndicators = {
    junior: ['junior', 'entry', 'associate', 'intern', 'graduate', '0-2 years', '0-1 years'],
    mid: ['mid', 'intermediate', '2-5 years', '3-5 years', '2-4 years'],
    senior: ['senior', 'lead', 'principal', 'staff', '5+ years', '7+ years', '10+ years'],
  };
  
  const isJunior = expIndicators.junior.some(i => jobText.includes(i));
  const isSenior = expIndicators.senior.some(i => jobText.includes(i));
  const isMid = expIndicators.mid.some(i => jobText.includes(i));
  
  // Default to mid-level match if no indicators
  if (isJunior || isMid || isSenior) {
    score += 15; // Has clear level indicator
    reasons.positive.push('✅ Clear experience level');
  } else {
    score += 10; // No indicator, assume flexible
  }
  
  // ─── Location Fit (20 points) ───
  const location = (job.location || '').toLowerCase();
  const isRemote = location.includes('remote') || location.includes('worldwide') || location.includes('anywhere');
  const isAfrica = location.includes('africa') || location.includes('nigeria') || location.includes('ghana');
  const isRestricted = location.includes('us only') || location.includes('uk only') || location.includes('eu only');
  
  if (isRemote) {
    score += 20;
    reasons.positive.push('🌍 Remote-friendly');
  } else if (isAfrica) {
    score += 18;
    reasons.positive.push('🌍 Africa-friendly');
  } else if (isRestricted) {
    score += 5;
    reasons.neutral.push('📍 Location restricted');
  } else {
    score += 12;
  }
  
  // ─── Job Quality Signals (20 points) ───
  if (job.salary) {
    score += 8;
    reasons.positive.push(`💰 Salary listed: ${job.salary}`);
  }
  
  if (job.description && job.description.length > 200) {
    score += 5;
    reasons.positive.push('📝 Detailed description');
  }
  
  if (job.verified) {
    score += 4;
    reasons.positive.push('✅ Verified posting');
  }
  
  const age = getJobAge(job);
  if (age === 'Today' || age === 'Yesterday') {
    score += 3;
    reasons.positive.push('🆕 Just posted');
  }
  
  // ─── Final Score ───
  const finalScore = Math.min(Math.round(score), 99);
  
  // Determine match level
  let level;
  if (finalScore >= 85) level = 'excellent';
  else if (finalScore >= 70) level = 'good';
  else if (finalScore >= 50) level = 'fair';
  else level = 'low';
  
  return {
    score: finalScore,
    level,
    reasons,
    skillsMatched,
    skillsMissing: skillsMissing.slice(0, 5),
    jobSkills: jobSkills.slice(0, 10),
  };
}

// ═══════════════════════════════════════════════════════════
// 5. DUPLICATE DETECTION
// ═══════════════════════════════════════════════════════════

function removeDuplicates(jobs) {
  const seen = new Map();
  const unique = [];
  
  for (const job of jobs) {
    const key = `${(job.title || '').toLowerCase().trim()}|${(job.company || '').toLowerCase().trim()}`;
    
    if (seen.has(key)) {
      // Keep the one with more info or newer date
      const existing = seen.get(key);
      const existingScore = (existing.salary ? 10 : 0) + (existing.description?.length || 0);
      const newScore = (job.salary ? 10 : 0) + (job.description?.length || 0);
      
      if (newScore > existingScore) {
        // Replace with better version
        const idx = unique.findIndex(j => 
          `${(j.title || '').toLowerCase()}|${(j.company || '').toLowerCase()}` === key
        );
        if (idx !== -1) {
          unique[idx] = { ...job, sources: [...(existing.sources || [existing.source]), job.source] };
        }
      } else {
        // Add source info to existing
        existing.sources = [...(existing.sources || [existing.source]), job.source];
      }
    } else {
      seen.set(key, job);
      unique.push(job);
    }
  }
  
  return unique;
}

// ═══════════════════════════════════════════════════════════
// 6. ATS ADVICE GENERATOR
// ═══════════════════════════════════════════════════════════

function generateAtsAdvice(job, matchResult, resumeText = '') {
  const { score, reasons, skillsMissing, jobSkills } = matchResult;
  
  let advice = `📋 *ATS Analysis for:* ${job.title} @ ${job.company}\n\n`;
  
  // Match Score
  const bar = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';
  advice += `${bar} *Match Score: ${score}/100*\n\n`;
  
  // Strengths
  if (reasons.positive.length > 0) {
    advice += `*✅ Your Strengths:*\n`;
    reasons.positive.slice(0, 5).forEach(r => { advice += `${r}\n`; });
    advice += '\n';
  }
  
  // Missing Skills
  if (skillsMissing.length > 0) {
    advice += `*⚠️ Keywords to Add to Resume:*\n`;
    skillsMissing.forEach(s => { advice += `• ${s}\n`; });
    advice += '\n';
  }
  
  // Actionable Tips
  advice += `*💡 Tips to Land This Job:*\n`;
  
  if (score < 70) {
    advice += `• Tailor your resume for this specific role\n`;
    advice += `• Add missing keywords naturally into your experience\n`;
  }
  
  if (!job.salary) {
    advice += `• Research salary range on Glassdoor before interviewing\n`;
  }
  
  if (reasons.negative.length > 0) {
    reasons.negative.forEach(r => { advice += `${r}\n`; });
  }
  
  advice += `• Quantify achievements: "Improved X by Y%"\n`;
  advice += `• Use action verbs: Led, Built, Launched, Optimized\n`;
  advice += `\n📝 _Reply /tailor ${job.id || '1'} to auto-tailor your resume_`;
  
  return advice;
}

// ═══════════════════════════════════════════════════════════
// 7. MAIN QA PIPELINE
// ═══════════════════════════════════════════════════════════

async function qaPipeline(jobs, options = {}) {
  const {
    maxAge = MAX_JOB_AGE_DAYS,
    verifyLinks = false,
    userSkills = [],
    resumeText = '',
    removeDupes = true,
  } = options;
  
  console.log(`🛡️ QA Pipeline: ${jobs.length} jobs in`);
  
  // Step 1: Remove duplicates
  let processed = removeDupes ? removeDuplicates(jobs) : jobs;
  console.log(`  ✅ After dedup: ${processed.length}`);
  
  // Step 2: Filter by freshness
  processed = filterFreshJobs(processed, maxAge);
  console.log(`  ✅ After freshness filter: ${processed.length}`);
  
  // Step 3: Verify links (optional, slower)
  if (verifyLinks) {
    processed = await verifyJobs(processed);
    const beforeCount = processed.length;
    processed = processed.filter(j => j.verified !== false);
    console.log(`  ✅ After link verification: ${processed.length} (removed ${beforeCount - processed.length} dead)`);
  }
  
  // Step 4: Calculate match scores
  processed = processed.map(job => {
    const match = calculateMatchScore(job, userSkills, resumeText);
    return { ...job, matchScore: match.score, matchLevel: match.level, matchDetails: match };
  });
  
  // Step 5: Sort by match score
  processed.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  
  console.log(`  ✅ QA complete: ${processed.length} quality jobs`);
  return processed;
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

module.exports = {
  // Freshness
  isJobFresh,
  getJobAge,
  filterFreshJobs,
  
  // Verification
  checkUrlAlive,
  checkJobPageContent,
  verifyJob,
  verifyJobs,
  
  // Skills
  extractSkillsFromText,
  extractSkillsFromResume,
  
  // Matching
  calculateMatchScore,
  
  // Dedup
  removeDuplicates,
  
  // ATS Advice
  generateAtsAdvice,
  
  // Pipeline
  qaPipeline,
  
  // Constants
  MAX_JOB_AGE_DAYS,
  FRESH_JOB_AGE_DAYS,
};
