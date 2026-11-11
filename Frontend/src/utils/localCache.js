import AsyncStorage from "@react-native-async-storage/async-storage";

const memoryCache = new Map();

/**
 * Synchronous in-memory lookup for zero-frame-delay initial state hydration.
 */
export function getMemoryCachedData(key) {
  return memoryCache.has(key) ? memoryCache.get(key) : null;
}

/**
 * Retrieve cached JSON data immediately from memory (0ms) or AsyncStorage.
 */
export async function getCachedData(key) {
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }
  try {
    const raw = await AsyncStorage.getItem(`cache_${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      memoryCache.set(key, parsed);
      return parsed;
    }
  } catch {}
  return null;
}

/**
 * Save data to both memory and AsyncStorage for instant subsequent screen loads.
 */
export async function setCachedData(key, data) {
  memoryCache.set(key, data);
  try {
    await AsyncStorage.setItem(`cache_${key}`, JSON.stringify(data));
  } catch {}
}

export async function removeCachedData(key) {
  memoryCache.delete(key);
  try {
    await AsyncStorage.removeItem(`cache_${key}`);
  } catch {}
}

export async function clearAllLocalCache() {
  memoryCache.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith("cache_"));
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }
  } catch {}
}
