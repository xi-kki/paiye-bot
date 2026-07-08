// ============================================================
// 🚀 Reset Telegram connections and start @Paiye_Bot
// ============================================================
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const TOKEN = process.env.TELEGRAM_TOKEN;

async function main() {
  console.log('🔄 Resetting Telegram bot connections...');
  
  // Step 1: Force-stop any existing polling by using a temp webhook
  // We use the raw HTTPS API for this since the library uses polling
  const https = require('https');
  
  function apiCall(method, params = {}) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(params);
      const url = new URL(`https://api.telegram.org/bot${TOKEN}/${method}`);
      const req = https.request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch(e) { resolve(body); }
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  // Set webhook to force-kill all polling connections
  console.log('📡 Setting webhook to kill polling...');
  const setResult = await apiCall('setWebhook', {
    url: 'https://example.com/telegram-reset',
    drop_pending_updates: true,
    max_connections: 1
  });
  console.log(`   setWebhook: ${JSON.stringify(setResult)}`);

  // Wait for Telegram to process
  await new Promise(r => setTimeout(r, 3000));

  // Delete webhook to return to polling mode
  console.log('🗑️ Deleting webhook...');
  const delResult = await apiCall('deleteWebhook', { drop_pending_updates: true });
  console.log(`   deleteWebhook: ${JSON.stringify(delResult)}`);

  await new Promise(r => setTimeout(r, 2000));

  // Verify we can getUpdates
  console.log('✅ Testing getUpdates...');
  const testResult = await apiCall('getUpdates', { timeout: 1, offset: -1 });
  console.log(`   getUpdates: ${JSON.stringify(testResult).substring(0, 100)}`);

  if (testResult.ok) {
    console.log('\n🚀 Starting bot with polling...');
    const bot = new TelegramBot(TOKEN, { polling: true });
    
    bot.on('polling_error', (err) => {
      console.error('⚠️ Polling error:', err.message);
    });

    bot.onText(/\/start/, (msg) => {
      bot.sendMessage(msg.chat.id, '✅ Bot is live!');
    });

    // Wait a moment and check if polling is OK
    await new Promise(r => setTimeout(r, 3000));
    console.log('✅ Bot should be running!');
    console.log('Keep this process alive for the bot to work.');
    
    // Keep running
    setInterval(() => {}, 60000);
  } else {
    console.log('❌ Still getting conflicts:', testResult);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
