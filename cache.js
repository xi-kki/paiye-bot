// ============================================================
// 📦 In-Memory Job Cache — 30-minute TTL for instant responses
// ============================================================

class JobCache {
  constructor(ttlMs = 30 * 60 * 1000) {
    this.cache = null;
    this.timestamp = 0;
    this.ttl = ttlMs;
    this.pending = null; // Prevents duplicate concurrent refreshes
  }

  /**
   * Get cached results or fetch fresh ones.
   * If cache is stale, triggers a refresh in the background
   * but still returns stale data immediately (stale-while-revalidate).
   */
  async get(searchFn, waitForFresh = false) {
    const isStale = (Date.now() - this.timestamp) > this.ttl;

    // If we have cached data and it's fresh, return immediately
    if (this.cache && !isStale) {
      return this.cache;
    }

    // If we have cached data but it's stale, refresh in background
    if (this.cache && isStale && !waitForFresh) {
      // Don't await — refresh in background
      this._refresh(searchFn).catch(err => {
        console.error('⚠️ Background cache refresh failed:', err.message);
      });
      return this.cache; // Return stale data immediately
    }

    // No cache at all — must wait
    return this._refresh(searchFn);
  }

  /**
   * Force a fresh fetch (used by /refresh)
   */
  async forceRefresh(searchFn) {
    this.cache = null;
    this.timestamp = 0;
    return this._refresh(searchFn);
  }

  async _refresh(searchFn) {
    // Deduplicate concurrent refreshes
    if (this.pending) {
      return this.pending;
    }

    this.pending = searchFn();
    try {
      this.cache = await this.pending;
      this.timestamp = Date.now();
      console.log(`📦 Cache refreshed at ${new Date().toISOString()}`);
      return this.cache;
    } finally {
      this.pending = null;
    }
  }

  /** Get cache age in seconds (for status/debug) */
  get age() {
    if (!this.cache) return -1;
    return Math.floor((Date.now() - this.timestamp) / 1000);
  }

  get isFresh() {
    if (!this.cache) return false;
    return (Date.now() - this.timestamp) < this.ttl;
  }

  invalidate() {
    this.cache = null;
    this.timestamp = 0;
  }
}

module.exports = JobCache;
