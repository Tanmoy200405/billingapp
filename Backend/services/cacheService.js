const cacheStore = new Map();
const MAX_CACHE_ENTRIES = 2000;

/**
 * Retrieve cached value if present and unexpired.
 */
export function getCache(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * Store value in memory cache with a TTL (default 30 seconds).
 */
export function setCache(key, value, ttlMs = 30000) {
  if (cacheStore.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cacheStore.keys().next().value;
    if (oldestKey) cacheStore.delete(oldestKey);
  }
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Invalidate all cached entries for a user (optionally filtered by prefix).
 */
export function invalidateUserCache(userId, namespace = "") {
  const prefix = namespace ? `${userId}:${namespace}:` : `${userId}:`;
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
}

export function clearAllCache() {
  cacheStore.clear();
}

