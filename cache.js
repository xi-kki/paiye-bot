// ============================================================
// 📦 In-Memory Job Cache — stale-while-revalidate with 30-min TTL
//
// Pattern: stale-while-revalidate
//   Returns cached data instantly while refreshing in the background.
//   Users never wait for a full job fetch unless the cache is empty.
//   This makes /search responses feel instant even when sources are slow.
// ============================================================

class JobCache {
  /**
   * # JobCache Constructor
   *
   * ## Arguments
   * * `ttlMs` — Time-to-live in milliseconds (default: 30 minutes)
   *
   * ## State
   * * `cache` — The cached job results object (null when empty)
   * * `timestamp` — Epoch ms when cache was last populated
   * * `pending` — In-flight refresh promise (deduplication guard)
   */
  constructor(ttlMs = 30 * 60 * 1000) {
    this.cache = null;
    this.timestamp = 0;
    this.ttl = ttlMs;
    this.pending = null;
  }

  /**
   * # get — Retrieve jobs, refreshing stale cache in background
   *
   * Implements stale-while-revalidate:
   *   1. Cache fresh → return immediately
   *   2. Cache stale but present → return stale, refresh in background
   *   3. Cache empty → wait for fresh data
   *
   * ## Arguments
   * * `searchFn` — Async function that fetches and scores jobs
   * * `waitForFresh` — If true, blocks until refresh completes even
   *   when stale data exists (used by /refresh explicitly)
   *
   * ## Returns
   * Scored job results object `{ ai, writing, 'data-annotation' }`
   *
   * ## Why stale-while-revalidate?
   *   Job board APIs are slow (3-10s aggregate). Making users wait on
   *   every /search is a bad UX. This pattern guarantees sub-ms responses
   *   for 99% of requests while keeping data at most 30min stale.
   */
  async get(searchFn, waitForFresh = false) {
    const isStale = Date.now() - this.timestamp > this.ttl;

    // Case 1: Cache fresh → return immediately (sub-ms)
    if (this.cache && !isStale) {
      return this.cache;
    }

    // Case 2: Cache stale but present → return stale, refresh in background
    if (this.cache && isStale && !waitForFresh) {
      // Fire-and-forget: user gets instant response, cache updates silently
      this._refresh(searchFn).catch((err) => {
        console.error('⚠️ Background cache refresh failed:', err.message);
      });
      return this.cache;
    }

    // Case 3: No cache at all → first request, must wait
    return this._refresh(searchFn);
  }

  /**
   * # forceRefresh — Clear cache and fetch fresh data
   *
   * Used by the /refresh command. Always waits for completion.
   *
   * ## Arguments
   * * `searchFn` — Async function to fetch/scrape jobs
   *
   * ## Returns
   * Fresh job results
   */
  async forceRefresh(searchFn) {
    this.cache = null;
    this.timestamp = 0;
    return this._refresh(searchFn);
  }

  /**
   * # _refresh — Fetch fresh data with deduplication
   *
   * Prevents duplicate concurrent refreshes: if a refresh is already
   * in-flight, subsequent calls get the existing promise instead of
   * starting a second fetch.
   *
   * ## Why this matters
   *   Without dedup, two rapid /search calls could trigger two
   *   identical fetches simultaneously, doubling API load and
   *   potentially causing inconsistent state.
   *
   * ## Side Effects
   *   Updates `this.cache` and `this.timestamp` on success
   */
  async _refresh(searchFn) {
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

  /** Cache age in seconds. Returns -1 if cache is empty. */
  get age() {
    if (!this.cache) return -1;
    return Math.floor((Date.now() - this.timestamp) / 1000);
  }

  /** True if cache exists and is within TTL */
  get isFresh() {
    if (!this.cache) return false;
    return Date.now() - this.timestamp < this.ttl;
  }

  /** Clear cache — forces next get() to fetch fresh */
  invalidate() {
    this.cache = null;
    this.timestamp = 0;
  }
}

module.exports = JobCache;
