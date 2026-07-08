// ============================================================
// 💬 AI Chat Integration — Talk to an AI inside Telegram
// Supports: Anthropic Claude | OpenAI GPT | Groq
// ============================================================

const https = require('https');

class AIChat {
  constructor() {
    this.provider = null;
    this.apiKey = null;
    this.model = null;
    this.baseUrl = null; // For OpenAI-compatible providers (OpenAI, Groq, etc.)
    this.maxHistory = 20; // Keep last 20 messages per chat
    this.conversations = new Map(); // chatId -> [{role, content}]
    this.systemPrompt = null;
    this.ready = false;

    // Auto-configure from env
    this._configure();
  }

  _configure() {
    // Priority: Groq > Anthropic > OpenAI
    if (process.env.GROQ_API_KEY) {
      this.provider = 'groq';
      this.apiKey = process.env.GROQ_API_KEY;
      this.model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
      this.baseUrl = 'api.groq.com';
      this.ready = true;
      console.log(`🤖 AI Chat: Configured with Groq (${this.model})`);
    } else if (process.env.ANTHROPIC_API_KEY) {
      this.provider = 'anthropic';
      this.apiKey = process.env.ANTHROPIC_API_KEY;
      this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
      this.ready = true;
      console.log(`🤖 AI Chat: Configured with Anthropic Claude (${this.model})`);
    } else if (process.env.OPENAI_API_KEY) {
      this.provider = 'openai';
      this.apiKey = process.env.OPENAI_API_KEY;
      this.model = process.env.OPENAI_MODEL || 'gpt-4o';
      this.baseUrl = 'api.openai.com';
      this.ready = true;
      console.log(`🤖 AI Chat: Configured with OpenAI (${this.model})`);
    } else {
      console.log('🤖 AI Chat: Not configured. Set GROQ_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in .env');
    }

    // System prompt — makes the AI aware of the bot's capabilities
    this.systemPrompt = process.env.AI_SYSTEM_PROMPT || (
      'You are PaiyeBot Assistant — a helpful AI integrated into a Telegram job search bot. ' +
      'You assist users with job searching, career advice, resume tips, interview prep, ' +
      'and general questions.\n\n' +
      'The bot has these capabilities:\n' +
      '- /jobs-ai — Find AI/ML/tech jobs\n' +
      '- /jobs-writing — Find content/writing jobs\n' +
      '- /jobs-data — Find data annotation jobs\n' +
      '- /nigeria — Find remote jobs open to Nigeria 🇳🇬\n' +
      '- /subscribe — Get 15 jobs daily at 7AM WAT\n' +
      '- /refresh — Force re-fetch jobs\n' +
      '- /feedback — Share feedback to improve matches\n\n' +
      'Be concise, friendly, and helpful. You can discuss ANY topic, not just jobs. ' +
      'When asked about jobs, guide users to use the appropriate commands. ' +
      'Use emojis naturally. Keep responses under 2000 characters for Telegram.'
    );
  }

  /**
   * Send a message to the AI and get a response
   */
  async chat(chatId, message) {
    if (!this.ready) {
      return (
        '🤖 *AI Chat is not configured yet!*\n\n' +
        'An admin needs to set an API key in the `.env` file:\n' +
        '• `GROQ_API_KEY=gsk_xxxx` (recommended — fast & free)\n' +
        '• `ANTHROPIC_API_KEY=sk-ant_xxxx` (Claude)\n' +
        '• `OPENAI_API_KEY=sk-xxxx` (GPT)\n\n' +
        'Until then, I can still help with jobs! Use the buttons or type /start.'
      );
    }

    // Get or create conversation history
    if (!this.conversations.has(chatId)) {
      this.conversations.set(chatId, []);
    }
    const history = this.conversations.get(chatId);

    // Add user message
    history.push({ role: 'user', content: message });

    // Trim history if too long
    while (history.length > this.maxHistory) {
      history.shift();
    }

    try {
      let response;
      if (this.provider === 'anthropic') {
        response = await this._callAnthropic(history);
      } else {
        // OpenAI-compatible: OpenAI, Groq, or any custom provider
        response = await this._callOpenAICompatible(history);
      }

      // Add assistant response to history
      history.push({ role: 'assistant', content: response });

      return response;
    } catch (err) {
      console.error(`🤖 AI Chat error for ${chatId}:`, err.message);

      // Handle specific error cases
      if (err.message.includes('401') || err.message.includes('Unauthorized')) {
        return '❌ *AI Chat Error:* Invalid API key. Please check your `.env` configuration.';
      }
      if (err.message.includes('429') || err.message.includes('Rate limit')) {
        return '⏳ *AI Chat:* Too many requests! Give me a moment and try again.';
      }
      if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
        return '⏰ *AI Chat:* Request timed out. The AI might be overloaded. Try again!';
      }

      return '😕 *AI Chat Error:* ' + err.message.substring(0, 100) +
             '\n\nTry again in a moment, or type /start to use the job features.';
    }
  }

  /**
   * Reset conversation history for a chat
   */
  reset(chatId) {
    this.conversations.delete(chatId);
  }

  /**
   * Call Anthropic Claude API
   */
  _callAnthropic(history) {
    return new Promise((resolve, reject) => {
      const messages = history.map(m => ({
        role: m.role,
        content: m.content
      }));

      const body = JSON.stringify({
        model: this.model,
        system: this.systemPrompt,
        messages: messages,
        max_tokens: 1024,
        temperature: 0.7
      });

      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 15000
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve(parsed.content[0]?.text || '(no response)');
            } else if (res.statusCode === 401) {
              reject(new Error('401 Unauthorized - Invalid API key'));
            } else if (res.statusCode === 429) {
              reject(new Error('429 Rate limit exceeded'));
            } else {
              reject(new Error(parsed.error?.message || `HTTP ${res.statusCode}`));
            }
          } catch (e) {
            reject(new Error('Failed to parse API response'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.write(body);
      req.end();
    });
  }

  /**
   * Call OpenAI-compatible API (OpenAI, Groq, or custom)
   * Groq uses the same chat completions format as OpenAI
   */
  _callOpenAICompatible(history) {
    return new Promise((resolve, reject) => {
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...history.map(m => ({
          role: m.role,
          content: m.content
        }))
      ];

      const body = JSON.stringify({
        model: this.model,
        messages: messages,
        max_tokens: 1024,
        temperature: 0.7
      });

      const req = https.request({
        hostname: this.baseUrl,
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 15000
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve(parsed.choices[0]?.message?.content || '(no response)');
            } else if (res.statusCode === 401) {
              reject(new Error('401 Unauthorized - Invalid API key'));
            } else if (res.statusCode === 429) {
              reject(new Error('429 Rate limit exceeded'));
            } else {
              const errMsg = parsed.error?.message || parsed.error?.code || `HTTP ${res.statusCode}`;
              reject(new Error(errMsg));
            }
          } catch (e) {
            reject(new Error('Failed to parse API response'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      req.write(body);
      req.end();
    });
  }
}

module.exports = AIChat;
