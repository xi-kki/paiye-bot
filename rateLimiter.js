// ============================================================
// ⏱️ Rate Limiter — Per-user, per-source, per-command
//    Controls: max calls, burst, cooldown, penalties
// ============================================================

class RateLimiter {
  constructor() {
    // Per-command limits: { maxCalls, windowMs }
    this.limits = new Map();
    // Usage track: key -> { calls: [], blocked }
    this.usage = new Map();
    // Per-source limits (for API scraping)
    this.sourceLimits = new Map();
    // Enforcement mode: 'strict' | 'lenient' | 'log_only'
    this.mode = 'lenient';
  }

  /**
   * Define a rate limit for a command/key
   */
  setLimit(key, maxCalls, windowMs) {
    this.limits.set(key, { maxCalls, windowMs });
  }

  /**
   * Define a rate limit for an external source API
   */
  setSourceLimit(source, maxCalls, windowMs) {
    this.sourceLimits.set(source, {
      maxCalls,
      windowMs,
      lastReset: Date.now(),
      calls: 0,
    });
  }

  /**
   * Set enforcement mode
   */
  setMode(mode) {
    if (!['strict', 'lenient', 'log_only'].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}. Use strict, lenient, or log_only`);
    }
    this.mode = mode;
  }

  /**
   * Check if a key can make a call
   * Returns { allowed: boolean, waitMs: number, reason: string }
   */
  check(key) {
    if (!this.limits.has(key)) {
      return { allowed: true, waitMs: 0, reason: '' };
    }

    const limit = this.limits.get(key);
    const now = Date.now();
    
    if (!this.usage.has(key)) {
      this.usage.set(key, []);
    }

    const calls = this.usage.get(key);
    // Remove expired calls
    const valid = calls.filter(t => now - t < limit.windowMs);
    this.usage.set(key, valid);

    if (valid.length >= limit.maxCalls) {
      const oldest = valid[0];
      const waitMs = limit.windowMs - (now - oldest);
      return {
        allowed: false,
        waitMs,
        reason: `Rate limited: ${limit.maxCalls} calls per ${limit.windowMs / 1000}s`,
      };
    }

    return { allowed: true, waitMs: 0, reason: '' };
  }

  /**
   * Record a call for a key
   */
  record(key) {
    if (!this.usage.has(key)) {
      this.usage.set(key, []);
    }
    this.usage.get(key).push(Date.now());
  }

  /**
   * Check and record in one call
   */
  checkAndRecord(key) {
    const result = this.check(key);
    if (result.allowed) {
      this.record(key);
    }
    return result;
  }

  /**
   * Check source API rate limit, returns true if calls are allowed
   */
  checkSource(source) {
    if (!this.sourceLimits.has(source)) return true;

    const limit = this.sourceLimits.get(source);
    const now = Date.now();

    // Reset if window passed
    if (now - limit.lastReset >= limit.windowMs) {
      limit.calls = 0;
      limit.lastReset = now;
    }

    const allowed = limit.calls < limit.maxCalls;

    if (this.mode === 'log_only' && !allowed) {
      console.warn(`⚠️ Source [${source}] would be rate limited (${limit.calls}/${limit.maxCalls})`);
      return true; // Only log, don't block
    }

    if (!allowed) {
      console.warn(`⏱️ Source [${source}] rate limited (${limit.calls}/${limit.maxCalls})`);
    }

    return allowed;
  }

  /**
   * Record a source API call
   */
  recordSource(source) {
    if (!this.sourceLimits.has(source)) return;
    this.sourceLimits.get(source).calls++;
  }

  /**
   * Get current usage stats for a key
   */
  getStats(key) {
    if (!this.limits.has(key)) return null;
    const limit = this.limits.get(key);
    const calls = this.usage.get(key) || [];
    const now = Date.now();
    const active = calls.filter(t => now - t < limit.windowMs);
    return {
      key,
      maxCalls: limit.maxCalls,
      windowMs: limit.windowMs,
      currentCalls: active.length,
      remaining: Math.max(0, limit.maxCalls - active.length),
      blocked: active.length >= limit.maxCalls,
    };
  }

  /**
   * Get all rate limit stats
   */
  getAllStats() {
    const stats = {};
    for (const [key] of this.limits) {
      stats[key] = this.getStats(key);
    }
    return stats;
  }

  /**
   * Get source-level rate limit stats
   */
  getSourceStats() {
    const stats = {};
    for (const [name, limit] of this.sourceLimits) {
      stats[name] = {
        maxCalls: limit.maxCalls,
        windowMs: limit.windowMs,
        currentCalls: limit.calls,
        remaining: Math.max(0, limit.maxCalls - limit.calls),
        blocked: limit.calls >= limit.maxCalls,
        nextReset: new Date(limit.lastReset + limit.windowMs).toISOString(),
      };
    }
    return stats;
  }

  /**
   * Add a temporary penalty for a key (abuse detection)
   */
  penalize(key, penaltyMs = 60000) {
    if (!this.limits.has(key)) return;
    const limit = this.limits.get(key);
    // Add penalty by backdating oldest call
    const calls = this.usage.get(key) || [];
    // Fill the window with fake timestamps
    const fillCount = limit.maxCalls;
    const backdated = Date.now() - penaltyMs;
    for (let i = 0; i < fillCount; i++) {
      calls.push(backdated);
    }
    this.usage.set(key, calls);
    console.warn(`⏱️ Penalized [${key}] for ${penaltyMs}ms`);
  }

  /**
   * Reset all limits
   */
  reset() {
    this.usage.clear();
    for (const [, limit] of this.sourceLimits) {
      limit.calls = 0;
      limit.lastReset = Date.now();
    }
    console.log('⏱️ Rate limiter reset');
  }

  /**
   * Summary for admin
   */
  summary() {
    const lines = ['╔═══════════════════════╗'];
    lines.push('║   ⏱️ RATE LIMITER     ║');
    lines.push('╚═══════════════════════╝');
    lines.push(`Mode: ${this.mode}`);
    lines.push('');
    lines.push('── Commands ──');
    for (const [key, stats] of Object.entries(this.getAllStats())) {
      const bar = '█'.repeat(Math.min(stats.currentCalls, stats.maxCalls)) + 
                  '░'.repeat(Math.max(0, stats.maxCalls - stats.currentCalls));
      lines.push(`${key}: [${bar}] ${stats.currentCalls}/${stats.maxCalls} (${stats.blocked ? '⛔' : '✅'})`);
    }
    lines.push('');
    lines.push('── Sources ──');
    for (const [name, stats] of Object.entries(this.getSourceStats())) {
      const bar = '█'.repeat(Math.min(stats.currentCalls, stats.maxCalls)) + 
                  '░'.repeat(Math.max(0, stats.maxCalls - stats.currentCalls));
      lines.push(`${name}: [${bar}] ${stats.currentCalls}/${stats.maxCalls} (${stats.blocked ? '⛔' : '✅'})`);
    }
    return lines.join('\n');
  }
}

// ─── Default instance with sensible limits ───
const defaultLimiter = new RateLimiter();

// Per-command limits
defaultLimiter.setLimit('find', 10, 60_000);        // 10 /find calls per minute
defaultLimiter.setLimit('remote', 5, 60_000);        // 5 /remote per minute
defaultLimiter.setLimit('nigeria', 5, 60_000);       // 5 /nigeria per minute
defaultLimiter.setLimit('trending', 5, 60_000);      // 5 /trending per minute
defaultLimiter.setLimit('ai', 10, 60_000);           // 10 AI chat messages per minute
defaultLimiter.setLimit('analyze', 3, 60_000);       // 3 /analyze per minute (costly)
defaultLimiter.setLimit('interview', 3, 60_000);     // 3 /interview per minute
defaultLimiter.setLimit('tailor', 3, 60_000);        // 3 /tailor per minute
defaultLimiter.setLimit('subscribe', 2, 60_000);     // 2 /subscribe per minute
defaultLimiter.setLimit('company', 10, 60_000);      // 10 /company per minute
defaultLimiter.setLimit('track', 10, 60_000);        // 10 /track per minute
defaultLimiter.setLimit('mcp-search', 5, 60_000);    // 5 MCP searches per minute
defaultLimiter.setLimit('admin', 20, 60_000);        // 20 admin calls per minute

// Per-source API limits (respect robots)
defaultLimiter.setSourceLimit('himalayas', 10, 60_000);
defaultLimiter.setSourceLimit('remoteok', 5, 60_000);
defaultLimiter.setSourceLimit('remotive', 10, 60_000);
defaultLimiter.setSourceLimit('jobicy', 15, 60_000);
defaultLimiter.setSourceLimit('arbeitnow', 10, 60_000);
defaultLimiter.setSourceLimit('findwork', 20, 60_000);
defaultLimiter.setSourceLimit('jobspy', 3, 60_000); // JobSpy is heavy, limit more
defaultLimiter.setSourceLimit('linkedin', 3, 60_000);

module.exports = { RateLimiter, defaultLimiter };
