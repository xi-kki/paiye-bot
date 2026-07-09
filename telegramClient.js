// ============================================================
// 📡 Telegram Bot Client — raw HTTPS, no 409 conflicts
// No external library — just fetch + parse
// ============================================================

const https = require('https');
const fs = require('fs');
const path = require('path');

class TelegramClient {
  constructor(token) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.offset = 0;
    this.handlers = {};
    this.running = false;
    this.pollTimer = null;
    this.pollIntervalMs = 1000;
    this._lastPollError = null;

    // For file downloads
    this.fileBaseUrl = `https://api.telegram.org/file/bot${token}`;
  }

  /**
   * Make a raw HTTPS call to Telegram API
   */
  async call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(params);
      const url = new URL(`${this.baseUrl}/${method}`);
      
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 30000
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${body.substring(0, 100)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.write(data);
      req.end();
    });
  }

  /**
   * Get file download path from Telegram
   */
  async getFilePath(fileId) {
    const result = await this.call('getFile', { file_id: fileId });
    if (result.ok && result.result.file_path) {
      return result.result.file_path;
    }
    throw new Error('File not found');
  }

  /**
   * Download a file from Telegram
   */
  async downloadFile(fileId, downloadDir) {
    const filePath = await this.getFilePath(fileId);
    const fileName = path.basename(filePath);
    const localPath = path.join(downloadDir, fileName);

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(localPath);
      const url = `${this.fileBaseUrl}/${filePath}`;
      
      https.get(url, res => {
        if (res.statusCode !== 200) {
          reject(new Error(`File download failed: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(localPath);
        });
      }).on('error', err => {
        fs.unlink(localPath, () => {});
        reject(err);
      });
    });
  }

  /**
   * Send a message
   */
  async sendMessage(chatId, text, options = {}) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text: text,
      parse_mode: options.parse_mode || 'Markdown',
      disable_web_page_preview: options.disable_web_page_preview !== false,
      reply_markup: options.reply_markup || undefined,
      ...options.extra
    });
  }

  /**
   * Edit a message
   */
  async editMessageText(chatId, messageId, text, options = {}) {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: options.parse_mode || 'Markdown',
      disable_web_page_preview: options.disable_web_page_preview !== false,
      reply_markup: options.reply_markup || undefined
    });
  }

  /**
   * Send typing indicator
   */
  async sendChatAction(chatId, action = 'typing') {
    return this.call('sendChatAction', { chat_id: chatId, action });
  }

  /**
   * Answer callback query (for inline keyboards)
   */
  async answerCallbackQuery(queryId, text = '') {
    return this.call('answerCallbackQuery', {
      callback_query_id: queryId,
      text: text,
      show_alert: false
    });
  }

  /**
   * Register event handler
   */
  on(event, handler) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  /**
   * Emit event to all handlers
   */
  async emit(event, ...args) {
    const handlers = this.handlers[event] || [];
    for (const handler of handlers) {
      try {
        await handler(...args);
      } catch (err) {
        console.error(`⚠️ Handler error for ${event}:`, err.message);
      }
    }
  }

  /**
   * Clean Telegram connection — force-kills all polling instances
   */
  async cleanConnection() {
    console.log('🧹 Force-cleaning Telegram connection...');
    
    // Step 1: Set a webhook to FORCE-KILL all polling
    try {
      const r = await this.call('setWebhook', {
        url: 'https://example.com/paiye-bot-reset',
        drop_pending_updates: true,
        max_connections: 1
      });
      console.log('   → setWebhook:', r.ok ? 'OK - all polls killed' : r.description || 'FAILED');
    } catch (err) {
      console.log('   → setWebhook error:', err.message);
    }
    await this._sleep(2000);

    // Step 2: Delete webhook to return to polling mode
    try {
      const r = await this.call('deleteWebhook', { drop_pending_updates: true });
      console.log('   → deleteWebhook:', r.ok ? 'OK' : r.description || 'FAILED');
    } catch (err) {
      console.log('   → deleteWebhook error:', err.message);
    }
    await this._sleep(2000);

    // Step 3: Verify clean
    try {
      const info = await this.call('getWebhookInfo');
      console.log(`   → Webhook: ${info.result?.url || 'none'}, pending: ${info.result?.pending_update_count || 0}`);
    } catch (_) {}

    console.log('✅ Connection clean');
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  /**
   * Start polling for updates
   */
  async start() {
    if (this.running) return;
    this.running = true;
    
    console.log('📡 Starting polling...');
    
    // Clean connection first
    await this.cleanConnection();
    
    // Start poll loop
    this._poll();
    console.log('✅ Polling started');
  }

  /**
   * Stop polling
   */
  stop() {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log('🛑 Polling stopped');
  }

  /**
   * Register bot commands with Telegram (updates the / menu)
   */
  async setCommands(commands) {
    return this.call('setMyCommands', { commands });
  }

  /**
   * Set bot description (shown on bot profile)
   */
  async setDescription(description) {
    return this.call('setMyDescription', { description });
  }

  /**
   * Set bot short description (shown when adding bot)
   */
  async setShortDescription(shortDescription) {
    return this.call('setMyShortDescription', { short_description: shortDescription });
  }

  /**
   * Main poll loop — gets updates and processes them
   */
  async _poll() {
    if (!this.running) return;

    try {
      const result = await this.call('getUpdates', {
        offset: this.offset,
        timeout: 30, // Long polling — hold connection for 30s
        allowed_updates: ['message', 'callback_query']
      });

      if (result.ok && result.result && result.result.length > 0) {
        for (const update of result.result) {
          this.offset = update.update_id + 1;
          await this._processUpdate(update);
        }
      }

      // Reset error state on success
      this._lastPollError = null;

    } catch (err) {
      // Only log if it's a new type of error (avoid spam)
      const errKey = err.message?.substring(0, 50);
      if (errKey !== this._lastPollError) {
        console.error('⚠️ Poll error:', err.message?.substring(0, 100));
        this._lastPollError = errKey;
      }
      
      // Wait a bit before retrying on error
      await this._sleep(3000);
    }

    // Schedule next poll
    this.pollTimer = setTimeout(() => this._poll(), this.pollIntervalMs);
  }

  /**
   * Process a single update from Telegram
   */
  async _processUpdate(update) {
    try {
      // Handle callback queries (inline keyboard button presses)
      if (update.callback_query) {
        await this.emit('callback_query', update.callback_query);
        return;
      }

      // Handle messages
      if (update.message) {
        await this.emit('message', update.message);
        return;
      }
    } catch (err) {
      console.error('❌ Error processing update:', err.message);
    }
  }
}

module.exports = TelegramClient;
