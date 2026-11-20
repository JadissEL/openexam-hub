/**
 * Tiny in-memory LRU cache with TTL, per serverless instance (no dependencies).
 * Uses Map insertion order: get() re-inserts (most recent last), set() evicts the oldest.
 * O(1) get/set. Used for shelves, exam profiles and plans on warm Vercel instances.
 * @module lib/algo/lru
 */
export function createLru({ max = 500, ttlMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
  const m = new Map();
  let hits = 0; let misses = 0;
  return {
    get(key) {
      const e = m.get(key);
      if (!e) { misses++; return undefined; }
      if (e.exp <= now()) { m.delete(key); misses++; return undefined; }
      m.delete(key); m.set(key, e); hits++;
      return e.v;
    },
    set(key, v, ttl = ttlMs) {
      if (m.has(key)) m.delete(key);
      m.set(key, { v, exp: now() + ttl });
      while (m.size > max) m.delete(m.keys().next().value);
      return v;
    },
    delete: (key) => m.delete(key),
    clear: () => m.clear(),
    get size() { return m.size; },
    stats: () => ({ hits, misses, size: m.size }),
    /** get-or-load with single-flight: concurrent callers share one in-flight promise. */
    async wrap(key, loader, ttl = ttlMs) {
      const hit = this.get(key);
      if (hit !== undefined) return hit;
      const p = Promise.resolve().then(loader);
      this.set(key, p, ttl);
      try { const v = await p; this.set(key, v, ttl); return v; } catch (e) { m.delete(key); throw e; }
    }
  };
}
