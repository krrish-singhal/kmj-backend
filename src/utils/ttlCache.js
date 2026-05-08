/**
 * Tiny in-memory TTL cache.
 *
 * Purpose: Reduce repeated Firestore reads from identical requests.
 * Note: This is per-process memory; in multi-instance deployments each instance has its own cache.
 */

export const createTtlCache = (defaultTtlMs = 10_000) => {
  const store = new Map();

  const get = (key) => {
    const hit = store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return hit.value;
  };

  const set = (key, value, ttlMs = defaultTtlMs) => {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  };

  const del = (key) => store.delete(key);

  const clear = () => store.clear();

  const wrap = async (key, fn, ttlMs = defaultTtlMs) => {
    const cached = get(key);
    if (cached !== undefined) return cached;
    const value = await fn();
    set(key, value, ttlMs);
    return value;
  };

  return { get, set, del, clear, wrap };
};
