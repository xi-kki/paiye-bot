#!/usr/bin/env node
// ============================================================
// 🔧 Paiye Bot v5 — Setup Wizard
// ============================================================
// Run this to configure your bot:
//   node setup.js
// ============================================================

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');
const crypto = require('crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});

const ENV_PATH = path.join(__dirname, '.env');
const ENV_EXAMPLE = path.join(__dirname, '.env.example');

function ask(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function callTelegram(method, token, params = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(params);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 15000
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Invalid response')); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function testGroqKey(key) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 5
    });
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 10000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(true);
        else resolve(false);
      });
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

async function testFindworkKey(key) {
  const axios = require('axios');
  try {
    const r = await axios.get('https://findwork.dev/api/jobs/?search=test', {
      headers: { 'Authorization': `Token ${key}` },
      timeout: 10000
    });
    return r.status === 200;
  } catch { return false; }
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   🔧  PAIYE BOT v5 — SETUP         ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  // ─── Load existing .env ───
  let env = {};
  if (fs.existsSync(ENV_PATH)) {
    const raw = fs.readFileSync(ENV_PATH, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([^#=]+)=(.+)/);
      if (m) env[m[1].trim()] = m[2].trim();
    }
    console.log(`📂 Found existing .env with ${Object.keys(env).length} variables`);
  } else {
    console.log('📂 No .env found — will create from scratch');
  }

  // ─── Step 1: Telegram Token ───
  console.log('\n──────────────────────────────────────');
  console.log('📡 Step 1: Telegram Bot Token');
  console.log('──────────────────────────────────────');
  console.log('Get a token from @BotFather on Telegram:');
  console.log('  1. Open Telegram and search for @BotFather');
  console.log('  2. Send /newbot and follow the prompts');
  console.log('  3. Copy the token (looks like: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)');
  console.log('');

  let token = env.TELEGRAM_TOKEN || '';
  if (token) {
    console.log(`ℹ️  Current token: ${token.substring(0, 15)}...`);
    const ans = await ask('Use this token? (Y/n): ');
    if (ans.toLowerCase() === 'n') token = '';
    else {
      // Test it
      console.log('🔍 Testing token...');
      try {
        const r = await callTelegram('getMe', token);
        if (r.ok) {
          console.log(`✅ Token works! Bot: @${r.result.username} (${r.result.first_name})`);
        } else {
          console.log(`❌ Token invalid: ${r.description}`);
          console.log('   (The bot may have been deleted or the token revoked)');
          token = '';
        }
      } catch (e) {
        console.log(`❌ Network error: ${e.message}`);
        token = '';
      }
    }
  }

  if (!token) {
    token = await ask('Paste your Telegram Bot Token: ');
    token = token.trim();
    if (token) {
      console.log('🔍 Testing token...');
      try {
        const r = await callTelegram('getMe', token);
        if (r.ok) {
          console.log(`✅ Token works! Bot: @${r.result.username}`);
        } else {
          console.log(`❌ Invalid token: ${r.description}`);
          console.log('   You can re-run setup later to fix this.');
        }
      } catch (e) {
        console.log(`❌ Network error: ${e.message}`);
      }
    }
  }

  // If no token at all, suggest retrying
  if (!token) {
    console.log('\n⚠️  No valid token configured. Run setup again later.');
  }

  // ─── Step 2: Groq API Key ───
  console.log('\n──────────────────────────────────────');
  console.log('🤖 Step 2: AI Provider (for chat, analysis, etc.)');
  console.log('──────────────────────────────────────');
  console.log('Get a free Groq API key:');
  console.log('  1. Go to https://console.groq.com/keys');
  console.log('  2. Sign in (or create account)');
  console.log('  3. Click "Create API Key"');
  console.log('  4. Copy the key (starts with gsk_)');
  console.log('');

  let groqKey = env.GROQ_API_KEY || '';
  if (groqKey) {
    console.log(`ℹ️  Current Groq key: ${groqKey.substring(0, 15)}...`);
    const ans = await ask('Test this key? (Y/n): ');
    if (ans.toLowerCase() !== 'n') {
      console.log('🔍 Testing Groq key...');
      const ok = await testGroqKey(groqKey);
      if (ok) console.log('✅ Groq key works!');
      else {
        console.log('❌ Groq key invalid or expired');
        groqKey = '';
      }
    }
  }
  if (!groqKey) {
    const newKey = await ask('Paste your Groq API Key (or press Enter to skip): ');
    if (newKey.trim()) {
      groqKey = newKey.trim();
      console.log('🔍 Testing...');
      const ok = await testGroqKey(groqKey);
      if (ok) console.log('✅ Groq key works!');
      else {
        console.log('❌ Invalid. Skipping AI features for now.');
        groqKey = '';
      }
    }
  }

  // ─── Step 3: Admin IDs ───
  console.log('\n──────────────────────────────────────');
  console.log('👑 Step 3: Admin User IDs');
  console.log('──────────────────────────────────────');
  console.log('Find your Telegram user ID:');
  console.log('  1. Message @userinfobot on Telegram');
  console.log('  2. Your ID is a number like "123456789"');
  console.log('');

  let adminIds = env.ADMIN_IDS || '';
  if (adminIds) {
    console.log(`ℹ️  Current admins: ${adminIds}`);
    const ans = await ask('Keep these? (Y/n): ');
    if (ans.toLowerCase() === 'n') adminIds = '';
  }
  if (!adminIds) {
    const input = await ask('Enter your Telegram User ID (or press Enter to skip): ');
    if (input.trim()) adminIds = input.trim();
  }

  // ─── Step 4: Optional API Keys ───
  console.log('\n──────────────────────────────────────');
  console.log('🔑 Step 4: Optional API Keys');
  console.log('──────────────────────────────────────');
  console.log('These are optional — the bot works without them.');
  console.log('');

  let findworkKey = env.FINDWORK_API_KEY || '';
  if (findworkKey) {
    console.log(`ℹ️  Findwork key: ${findworkKey.substring(0, 10)}...`);
    const ans = await ask('Test it? (Y/n): ');
    if (ans.toLowerCase() !== 'n') {
      const ok = await testFindworkKey(findworkKey);
      if (ok) console.log('✅ Findwork key works!');
      else { console.log('❌ Invalid. Clearing.'); findworkKey = ''; }
    }
  }
  if (!findworkKey) {
    const input = await ask('Findwork API key (free dev jobs, press Enter to skip): ');
    if (input.trim()) findworkKey = input.trim();
  }

  // ─── Write .env ───
  console.log('\n──────────────────────────────────────');
  console.log('💾 Writing configuration...');
  console.log('──────────────────────────────────────');

  // Backup old .env
  if (fs.existsSync(ENV_PATH)) {
    const bak = ENV_PATH + '.bak';
    fs.copyFileSync(ENV_PATH, bak);
    console.log(`📦 Backed up old .env to .env.bak`);
  }

  const lines = [
    '# ============================================================',
    '# 🤖 @Paiye_Bot Configuration',
    '# Generated by setup.js — NEVER commit this file to git!',
    '# ============================================================',
    '',
    '# ─── Required ───',
    `TELEGRAM_TOKEN=${token || 'your_token_here'}`,
    '',
    '# ─── AI Provider: Groq (recommended — fast & free) ───',
    groqKey ? `GROQ_API_KEY=${groqKey}` : '# GROQ_API_KEY=gsk_your_key_here',
    'GROQ_MODEL=llama-3.3-70b-versatile',
    '',
    '# ─── Alternative AI Providers (uncomment to use) ───',
    '# ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx',
    '# ANTHROPIC_MODEL=claude-sonnet-4-20250514',
    '# OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx',
    '# OPENAI_MODEL=gpt-4o',
    '',
    '# ─── Admin ───',
    adminIds ? `ADMIN_IDS=${adminIds}` : '# ADMIN_IDS=your_telegram_user_id',
    adminIds ? '' : '# Find your ID: message @userinfobot on Telegram',
    '',
    '# ─── Owner ID (bypasses rate limits) ───',
    adminIds ? `OWNER_ID=${adminIds.split(',')[0].trim()}` : '# OWNER_ID=your_telegram_user_id',
    '',
    '# ─── Optional API Keys ───',
    findworkKey ? `FINDWORK_API_KEY=${findworkKey}` : '# FINDWORK_API_KEY=your_key_here',
    '# Get a Findwork key: https://findwork.dev/developers/',
    '',
    '# RAPIDAPI_KEY=your_key_here  # For LinkedIn jobs via JSearch',
    '# ADZUNA_APP_ID=your_id     # For Adzuna global jobs',
    '# ADZUNA_APP_KEY=your_key   # For Adzuna global jobs',
    '',
    '# ─── Performance ───',
    '# RATE_LIMIT_MODE=lenient  # strict | lenient | log_only',
    '# AI_SYSTEM_PROMPT=You are a helpful job search assistant...',
  ];

  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n');
  console.log('✅ .env file updated!');

  // ─── Summary ───
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   ✅  SETUP COMPLETE!              ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  if (token) console.log('📡 Telegram Bot: ✅ Configured');
  else console.log('📡 Telegram Bot: ❌ Missing — get token from @BotFather');
  if (groqKey) console.log('🤖 AI Chat: ✅ Configured (Groq)');
  else console.log('🤖 AI Chat: ⚠️  Missing — get key from https://console.groq.com/keys');
  if (adminIds) console.log('👑 Admin: ✅ Configured');
  else console.log('👑 Admin: ⚠️  Not configured');
  if (findworkKey) console.log('🔑 Findwork: ✅ Configured');
  else console.log('🔑 Findwork: ⚠️  Not configured (optional)');
  console.log('');
  if (token) {
    console.log('▶️  Start the bot with:');
    console.log('   pm2 start ecosystem.config.js');
    console.log('   (or)  npm start');
    console.log('');
    console.log('📊 View logs:');
    console.log('   pm2 logs paiye-bot');
    console.log('   pm2 status');
    console.log('');
    console.log('🛑 Stop the bot:');
    console.log('   pm2 stop paiye-bot');
  }
  console.log('');

  rl.close();
}

main().catch(err => {
  console.error('Setup error:', err.message);
  rl.close();
  process.exit(1);
});
