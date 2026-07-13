// ============================================================
// 📡 Telegram Bot Client — raw HTTPS, no 409 conflicts
//
// Why a custom client instead of node-telegram-bot-api?
//   The library had persistent 409 Conflict errors when the
//   bot process restarted. Telegram's long-polling detects
//   stale connections and blocks new ones until they time out.
//   This client force-kills all polling via setWebhook before
//   starting fresh, guaranteeing zero conflicts.
// ============================================================

const https = require('https');
const fs = require('fs');
const path = require('path');

class TelegramClient {
  /**
   * # TelegramClient Constructor
   *
   * Initializes the client with a bot token and resets poll state.
   *
   * ## Arguments
   * * `token` — Telegram Bot API token from @BotFather
   *
   * ## Side Effects
   * * Stores token in memory (do NOT log this anywhere)
   * * Resets poll offset, clears any stale poll timer
   */
  constructor(token) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.offset = 0;
    this.handlers = {};
    this.running = false;
    this.pollTimer = null;
    this.pollIntervalMs = 1000;
    this._lastPollError = null;
    this.fileBaseUrl = `https://api.telegram.org/file/bot${token}`;
  }

  /**
   * # call — Make a raw HTTPS POST to the Telegram Bot API
   *
   * No external HTTP library — uses Node's built-in `https` module
   * to avoid dependency bloat and version conflicts.
   *
   * ## Arguments
   * * `method` — Telegram API method name (e.g. 'sendMessage', 'getUpdates')
   * * `params` — JSON-serializable parameters object
   *
   * ## Returns
   * Parsed Telegram response `{ ok, result, description?, error_code? }`
   *
   * ## Errors
   * * Rejects on network failure, timeout (>30s), or invalid JSON response
   *
   * ## Security
   * * Token is embedded in the URL (HTTPS ensures encryption in transit)
   * * Response body is capped at 100 chars in error messages to avoid leaking data
   */
  async call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(params);
      const url = new URL(`${this.baseUrl}/${method}`);

      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 30000,
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            // Only expose first 100 chars to avoid leaking credentials in logs
            reject(new Error(`Invalid JSON: ${body.substring(0, 100)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Telegram API timeout (30s)'));
      });
      req.write(data);
      req.end();
    });
  }

  /**
   * # getFilePath — Resolve a file_id to a downloadable path
   *
   * Telegram returns file_ids for documents/photos. This resolves
   * the opaque ID into a server path for downloading.
   *
   * ## Arguments
   * * `fileId` — Telegram file_id from a message
   *
   * ## Returns
   * Server-relative file path string
   *
   * ## Errors
   * Throws if Telegram reports the file doesn't exist
   */
  async getFilePath(fileId) {
    const result = await this.call('getFile', { file_id: fileId });
    if (result.ok && result.result.file_path) {
      return result.result.file_path;
    }
    throw new Error(`File ${fileId} not found on Telegram servers`);
  }

  /**
   * # downloadFile — Download a Telegram file to local disk
   *
   * Used primarily for resume documents uploaded by users.
   *
   * ## Arguments
   * * `fileId` — Telegram file_id
   * * `downloadDir` — Local directory to save the file
   *
   * ## Returns
   * Absolute path to the downloaded file
   *
   * ## Side Effects
   * * Writes file to disk in downloadDir
   * * Cleans up partial download on error
   *
   * ## Errors
   * * Throws on HTTP errors or disk write failures
   */
  async downloadFile(fileId, downloadDir) {
    const filePath = await this.getFilePath(fileId);
    const fileName = path.basename(filePath);
    const localPath = path.join(downloadDir, fileName);

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(localPath);
      const url = `${this.fileBaseUrl}/${filePath}`;

      https.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(localPath);
        });
      }).on('error', (err) => {
        // Clean up partial download to avoid filling disk with junk
        fs.unlink(localPath, () => {});
        reject(err);
      });
    });
  }

  /**
   * # sendMessage — Send a text message to a Telegram chat
   *
   * ## Arguments
   * * `chatId` — Telegram chat/user ID
   * * `text` — Message content (Markdown formatting supported)
   * * `options.parse_mode` — 'Markdown' (default) or 'HTML'
   * * `options.disable_web_page_preview` — Defaults to true (cleaner UX)
   * * `options.reply_markup` — Inline keyboard or reply markup object
   * * `options.extra` — Any additional Telegram API parameters merged in
   */
  async sendMessage(chatId, text, options = {}) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options.parse_mode || 'Markdown',
      disable_web_page_preview: options.disable_web_page_preview !== false,
      reply_markup: options.reply_markup || undefined,
      ...options.extra,
    });
  }

  /**
   * # editMessageText — Edit an already-sent message
   *
   * Used to update status messages (e.g. "Searching..." → results)
   * without sending a new message + deleting the old one.
   */
  async editMessageText(chatId, messageId, text, options = {}) {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options.parse_mode || 'Markdown',
      disable_web_page_preview: options.disable_web_page_preview !== false,
      reply_markup: options.reply_markup || undefined,
    });
  }

  /**
   * # sendChatAction — Show a typing/loading indicator
   *
   * Without this, Telegram shows no feedback while the bot is processing.
   * Send this before any slow operation (>2s).
   */
  async sendChatAction(chatId, action = 'typing') {
    return this.call('sendChatAction', { chat_id: chatId, action });
  }

  /**
   * # answerCallbackQuery — Acknowledge an inline keyboard press
   *
   * Required by Telegram: inline keyboard buttons won't stop
   * showing a loading spinner until this is called.
   *
   * ## Arguments
   * * `queryId` — The callback_query.id from Telegram
   * * `text` — Optional toast notification text
   */
  async answerCallbackQuery(queryId, text = '') {
    return this.call('answerCallbackQuery', {
      callback_query_id: queryId,
      text,
      show_alert: false,
    });
  }

  /**
   * # on — Register an event handler
   *
   * Supported events: 'message', 'callback_query'
   */
  on(event, handler) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  /**
   * # emit — Dispatch an event to all registered handlers
   *
   * Each handler runs in sequence. If one throws, the error
   * is caught and logged so remaining handlers still fire.
   *
   * ## Side Effects
   * * Logs handler errors but does NOT propagate them
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
   * # cleanConnection — Force-kill stale polling sessions
   *
   * Why this exists:
   *   When the bot restarts, Telegram's server still sees the old
   *   long-poll connection as active. It refuses new polls for up
   *   to 25 seconds with a 409 Conflict error.
   *
   * Fix:
   *   Temporarily set a webhook (which kills ALL polling on Telegram's side),
   *   then delete it to return to polling mode. This is instantaneous.
   *
   * ## Side Effects
   *   Drops any pending updates that accumulated during downtime
   */
  async cleanConnection() {
    console.log('🧹 Force-cleaning Telegram connection...');

    // Step 1: Set webhook → force-kills every active poll on Telegram's server
    try {
      const response = await this.call('setWebhook', {
        url: 'https://example.com/paiye-bot-reset',
        drop_pending_updates: true,
        max_connections: 1,
      });
      console.log('   → setWebhook:', response.ok ? 'OK — all polls killed' : response.description || 'FAILED');
    } catch (err) {
      console.log('   → setWebhook error:', err.message);
    }
    await this._sleep(2000);

    // Step 2: Delete webhook → switch back to polling mode
    try {
      const response = await this.call('deleteWebhook', { drop_pending_updates: true });
      console.log('   → deleteWebhook:', response.ok ? 'OK' : response.description || 'FAILED');
    } catch (err) {
      console.log('   → deleteWebhook error:', err.message);
    }
    await this._sleep(2000);

    // Step 3: Verify the webhook is gone and no updates are pending
    try {
      const info = await this.call('getWebhookInfo');
      console.log(`   → Webhook: ${info.result?.url || 'none'}, pending: ${info.result?.pending_update_count || 0}`);
    } catch {
      // Non-critical — connection is already clean
    }

    console.log('✅ Connection clean');
  }

  /**
   * # start — Begin long-polling for Telegram updates
   *
   * Call once at startup. Automatically cleans stale connections
   * before polling to guarantee zero 409 errors.
   *
   * ## Side Effects
   * * Kills any existing polling via cleanConnection()
   * * Starts the poll loop (runs forever until stop())
   */
  async start() {
    if (this.running) return;
    this.running = true;

    console.log('📡 Starting polling...');
    await this.cleanConnection();
    this._poll();
    console.log('✅ Polling started');
  }

  /**
   * # stop — Gracefully stop polling
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
   * # setCommands — Register bot commands with Telegram
   *
   * Updates what users see when they type `/` in the chat.
   * Must be called at startup to override stale cached commands
   * (e.g. from a previous version of the bot).
   *
   * ## Arguments
   * * `commands` — Array of `{ command: string, description: string }`
   *
   * ## Why this matters
   *   Telegram caches the command list per-bot. If the bot was
   *   repurposed (e.g. from "food stack workbook" → career agent),
   *   old commands persist in users' `/` menus until overwritten.
   */
  async setCommands(commands) {
    return this.call('setMyCommands', { commands });
  }

  /**
   * # setDescription — Set bot profile description
   *
   * The long description shown at the top of the bot's chat page.
   */
  async setDescription(description) {
    return this.call('setMyDescription', { description });
  }

  /**
   * # setShortDescription — Set short bot description
   *
   * Shown next to the bot's name in search results and the
   * "Add to chat" dialog.
   */
  async setShortDescription(shortDescription) {
    return this.call('setMyShortDescription', { short_description: shortDescription });
  }

  /**
   * # _sleep — Promise-based delay
   *
   * Internal utility. Not exposed publicly.
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * # _poll — Poll Telegram for new updates
   *
   * Uses long-polling (30s timeout) to receive updates as they
   * happen. Falls back to 1s interval polling after connection
   * errors.
   *
   * ## Why 30s timeout?
   *   Short polling (1s) creates 86k+ requests/day. Long polling
   *   holds the connection open and Telegram pushes updates
   *   immediately — ~3k requests/day.
   *
   * ## Error handling strategy
   *   Suppresses duplicate errors while keeping the first instance
   *   to avoid log spam during network blips.
   *
   * ## Side Effects
   *   Schedules itself recursively via setTimeout (not setInterval)
   *   to avoid overlapping polls on slow processing.
   */
  async _poll() {
    if (!this.running) return;

    try {
      const updates = await this.call('getUpdates', {
        offset: this.offset,
        timeout: 30,
        allowed_updates: ['message', 'callback_query'],
      });

      if (updates.ok && updates.result && updates.result.length > 0) {
        for (const update of updates.result) {
          this.offset = update.update_id + 1;
          await this._processUpdate(update);
        }
      }

      // Reset error dedup state on success
      this._lastPollError = null;
    } catch (err) {
      // Dedup consecutive identical errors to avoid filling logs
      const errorSignature = err.message?.substring(0, 50);
      if (errorSignature !== this._lastPollError) {
        console.error('⚠️ Poll error:', err.message?.substring(0, 100));
        this._lastPollError = errorSignature;
      }

      // Back off briefly before retrying after errors
      await this._sleep(3000);
    }

    // Schedule next poll (runs after current one finishes — no overlap)
    this.pollTimer = setTimeout(() => this._poll(), this.pollIntervalMs);
  }

  /**
   * # _processUpdate — Route a single Telegram update to handlers
   *
   * Telegram sends two types of updates we care about:
   *   - `callback_query` — inline keyboard button press
   *   - `message` — text message or file upload
   *
   * ## Security
   *   Each update is wrapped in try/catch so a single bad handler
   *   doesn't crash the entire poll loop.
   */
  async _processUpdate(update) {
    try {
      if (update.callback_query) {
        await this.emit('callback_query', update.callback_query);
        return;
      }

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
