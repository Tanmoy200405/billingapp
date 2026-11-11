import AsyncStorage from "@react-native-async-storage/async-storage";

const memoryCache = new Map();

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

