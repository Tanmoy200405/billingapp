import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setCachedData, clearAllLocalCache } from "../utils/localCache";

const TOKEN_KEY = "billing_auth_token";
const USER_KEY = "billing_user_data";
let authToken = null;
export const RENDER_API_URL = "https://billingapi.duckdns.org/api";
export const VERCEL_API_URL = RENDER_API_URL; // kept for compatibility
export const CLOUDFLARE_API_URL = RENDER_API_URL;
export const DEFAULT_API_URL = RENDER_API_URL;
let currentBaseUrl = DEFAULT_API_URL;
const API_URL_KEY = "billing_api_url";

currentBaseUrl = DEFAULT_API_URL;
if (typeof localStorage !== "undefined") {
  try {
    localStorage.removeItem(API_URL_KEY);
    localStorage.setItem(API_URL_KEY, DEFAULT_API_URL);
  } catch {}
}
AsyncStorage.removeItem(API_URL_KEY).catch(() => {});
AsyncStorage.setItem(API_URL_KEY, DEFAULT_API_URL).catch(() => {});

export const setAuthToken = (token, user = null) => {
  authToken = token;
  if (token) {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(TOKEN_KEY, token);
        if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      } catch {}
    }
    AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
    if (user) AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {});
  } else {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      } catch {}
    }
    AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
    AsyncStorage.removeItem(USER_KEY).catch(() => {});
  }
};

export const getAuthToken = () => authToken;

export const loadStoredToken = async () => {
  try {
    let token = null;
    if (typeof localStorage !== "undefined") {
      token = localStorage.getItem(TOKEN_KEY);
    }
    if (!token) {
      token = await AsyncStorage.getItem(TOKEN_KEY);
    }
    if (token) {
      authToken = token;
      return token;
    }
  } catch {}
  return null;
};

export const getStoredSession = async () => {
  let token = null;
  let user = null;
  if (typeof localStorage !== "undefined") {
    try {
      token = localStorage.getItem(TOKEN_KEY);
      const userStr = localStorage.getItem(USER_KEY);
      if (userStr) user = JSON.parse(userStr);
    } catch {}
  }
  if (!token) {
    try {
      token = await AsyncStorage.getItem(TOKEN_KEY);
      const userStr = await AsyncStorage.getItem(USER_KEY);
      if (userStr) user = JSON.parse(userStr);
    } catch {}
  }
  if (token) authToken = token;
  return { token, user };
};

export const clearAuthToken = async () => {
  authToken = null;
  getCache.clear();
  inFlightGets.clear();
  clearAllLocalCache().catch(() => {});
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
  }
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  } catch {}
};

export const setApiBaseUrl = (url) => {
  if (url) {
    currentBaseUrl = url.endsWith("/api") ? url : `${url.replace(/\/$/, "")}/api`;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(API_URL_KEY, currentBaseUrl);
      } catch {}
    }
    AsyncStorage.setItem(API_URL_KEY, currentBaseUrl).catch(() => {});
  }
};

export const getApiBaseUrl = () => currentBaseUrl;

const GET_CACHE_TTL_MS = 12000;
const getCache = new Map();
const inFlightGets = new Map();

export const invalidateClientApiCache = (prefix = "") => {
  if (!prefix) {
    getCache.clear();
    return;
  }
  for (const key of getCache.keys()) {
    if (key.includes(prefix)) {
      getCache.delete(key);
    }
  }
};

const request = async (endpoint, options = {}) => {
  const url = `${currentBaseUrl}${endpoint}`;
  const method = (options.method || "GET").toUpperCase();
  const useCache = method === "GET" && !options.skipCache && !endpoint.startsWith("/whatsapp/");

  if (useCache) {
    const cachedEntry = getCache.get(url);
    if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
      return cachedEntry.data;
    }
    if (inFlightGets.has(url)) {
      return inFlightGets.get(url);
    }
  }

  const headers = {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...options.headers,
  };

  const executeFetch = async () => {
    const timeoutMs =
      endpoint.includes("import") || endpoint.includes("pdf") || endpoint.includes("whatsapp")
        ? 45000
        : 15000;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        ...(controller ? { signal: controller.signal } : {}),
      });
      let data;
      try {
        data = await response.json();
      } catch {
        data = {
          success: false,
          message: `Server returned HTTP ${response.status}`,
        };
      }

      if (!response.ok && data && !data.message) {
        data.message = `Request failed with status ${response.status}`;
      }

      if (data && data.error && data.message && !data.message.includes(data.error)) {
        data.message = `${data.message} (${data.error})`;
      }

      if (response.ok && data?.success !== false) {
        if (useCache) {
          getCache.set(url, {
            data,
            expiresAt: Date.now() + GET_CACHE_TTL_MS,
          });
        } else if (method !== "GET") {
          // Mutating write: clear stale client RAM cache so subsequent reads get fresh totals/lists
          invalidateClientApiCache();
        }
      }

      return data;
    } catch (error) {
      return {
        success: false,
        message:
          error?.name === "AbortError"
            ? "Request timed out. Please check your connection."
            : error.message || "Network connection error",
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (useCache) inFlightGets.delete(url);
    }
  };

  if (useCache) {
    const pendingPromise = executeFetch();
    inFlightGets.set(url, pendingPromise);
    return pendingPromise;
  }

  return executeFetch();
};

export const prefetchCoreData = async () => {
  if (!authToken) return;
  try {
    const [dashRes, itemsRes, catsRes, partiesRes] = await Promise.allSettled([
      api.dashboard.getStats(),
      api.items.getAll(),
      api.items.getCategories(),
      api.parties.getAll(),
    ]);

    if (dashRes.status === "fulfilled" && dashRes.value?.success) {
      setCachedData("dashboard_stats", {
        stats: dashRes.value.stats,
        recentTransactions: dashRes.value.recentTransactions || [],
      });
    }
    if (itemsRes.status === "fulfilled" && itemsRes.value?.success) {
      setCachedData("items_all", itemsRes.value.items || []);
    }
    if (catsRes.status === "fulfilled" && catsRes.value?.success) {
      setCachedData("items_categories", catsRes.value.categories || []);
    }
    if (partiesRes.status === "fulfilled" && partiesRes.value?.success) {
      setCachedData("parties_all", partiesRes.value.parties || []);
    }
  } catch {}
};

const uploadPdfFile = async (endpoint, fileOrUri) => {
  const url = `${currentBaseUrl}${endpoint}`;
  let token = authToken;
  if (!token) {
    try {
      token = await loadStoredToken();
    } catch {}
  }

  try {
    if (Platform.OS === "web") {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: fileOrUri,
      });
      let data;
      try {
        data = await response.json();
      } catch {
        data = {
          success: false,
          message: `Server returned HTTP ${response.status}`,
        };
      }
      if (!response.ok && data && !data.message) {
        data.message = `Request failed with status ${response.status}`;
      }
      return data;
    }

    const FileSystem = await import("expo-file-system/legacy");
    const uploadResult = await FileSystem.uploadAsync(url, fileOrUri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        "Content-Type": "application/pdf",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    let data;
    try {
      data = JSON.parse(uploadResult.body || "{}");
    } catch {
      data = {
        success: false,
        message: `Server returned HTTP ${uploadResult.status}`,
      };
    }

    if (uploadResult.status >= 400 && data && !data.message) {
      data.message = `Upload failed with status ${uploadResult.status}`;
    }

    return data;
  } catch (error) {
    return {
      success: false,
      message: error?.message || "Failed to upload PDF file",
    };
  }
};

export const api = {
  auth: {
    sendOtp: (phone, channel = "whatsapp", email = "", purpose = "login") =>
      request("/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({
          phone,
          identifier: phone,
          ...(email ? { email } : {}),
          channel,
          purpose,
        }),
      }),
    verifyOtp: (phone, code) =>
      request("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ phone, code }),
      }),
    register: (payload) =>
      request("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    login: (payload) =>
      request("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    getMe: () => request("/auth/me"),
    updateProfile: (payload) =>
      request("/auth/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
  },
  dashboard: {
    getStats: () => request("/dashboard/stats"),
  },
  parties: {
    getAll: (params = "") => request(`/parties${params ? `?${params}` : ""}`),
    getOne: (id) => request(`/parties/${id}`),
    create: (payload) =>
      request("/parties", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id, payload) =>
      request(`/parties/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    getVipCount: () => request("/parties/vip-count"),
    sendBulkVipOffer: () =>
      request("/parties/send-bulk-vip-offer", { method: "POST" }),
    broadcastOffer: (payload) =>
      request("/parties/broadcast-offer", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    updateRegularPerks: (id, payload) =>
      request(`/parties/${id}/regular-perks`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    getWhatsAppOffer: (id) => request(`/parties/${id}/whatsapp-offer`),
    delete: (id) => request(`/parties/${id}`, { method: "DELETE" }),
    bulkImport: (parties) =>
      request("/parties/bulk-import", {
        method: "POST",
        body: JSON.stringify({ parties }),
      }),
    importPdf: (payload) =>
      request("/parties/import-pdf", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    importPdfFile: (fileOrUri) => uploadPdfFile("/parties/import-pdf", fileOrUri),
  },
  items: {
    getAll: (params = "") => request(`/items${params ? `?${params}` : ""}`),
    getCategories: () => request("/items/categories"),
    addCategory: (name) =>
      request("/items/categories", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    getByBarcode: (barcode) => request(`/items/barcode/${barcode}`),
    create: (payload) =>
      request("/items", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id, payload) =>
      request(`/items/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    delete: (id) => request(`/items/${id}`, { method: "DELETE" }),
    bulkImport: (items) =>
      request("/items/bulk-import", {
        method: "POST",
        body: JSON.stringify({ items }),
      }),
    importPdf: (payload) =>
      request("/items/import-pdf", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    importPdfFile: (fileOrUri) => uploadPdfFile("/items/import-pdf", fileOrUri),
  },
  invoices: {
    getAll: (params = "") => request(`/invoices${params ? `?${params}` : ""}`),
    getOne: (id) => request(`/invoices/${id}`),
    create: (payload) =>
      request("/invoices", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id, payload) =>
      request(`/invoices/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    delete: (id) =>
      request(`/invoices/${id}`, {
        method: "DELETE",
      }),
    sendWhatsApp: (id, phone = "") =>
      request(`/invoices/${id}/send-whatsapp`, {
        method: "POST",
        body: JSON.stringify({ phone }),
      }),
  },
  whatsapp: {
    getStatus: () => request("/whatsapp/status"),
    init: (force = false) => request("/whatsapp/init", { method: "POST", body: JSON.stringify({ force }) }),
    disconnect: () => request("/whatsapp/disconnect", { method: "POST" }),
    getPairingCode: (phone) => request("/whatsapp/pairing-code", { method: "POST", body: JSON.stringify({ phone }) }),
  },
  reports: {
    getSales: (params = "") => request(`/reports/sales${params ? `?${params}` : ""}`),
    getSalesPdfUrl: (params = "") => `${currentBaseUrl}/reports/sales/pdf${params ? `?${params}` : ""}`,
    getSalesCsvUrl: (params = "") => `${currentBaseUrl}/reports/sales/csv${params ? `?${params}` : ""}`,
    getInventoryPdfUrl: () => `${currentBaseUrl}/reports/inventory/pdf`,
    getInventoryCsvUrl: () => `${currentBaseUrl}/reports/inventory/csv`,
    getPartiesPdfUrl: () => `${currentBaseUrl}/reports/parties/pdf`,
    getPartiesCsvUrl: () => `${currentBaseUrl}/reports/parties/csv`,
    getTopItems: (days = 365) => request(`/reports/top-items?days=${days}`),
    getCategorySales: (days = 365) => request(`/reports/category-sales?days=${days}`),
  },
};
