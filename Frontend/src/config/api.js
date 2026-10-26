import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "billing_auth_token";
const USER_KEY = "billing_user_data";
let authToken = null;
let currentBaseUrl =
  Platform.OS === "android"
    ? "http://10.0.2.2:5000/api"
    : "http://localhost:5000/api";

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
  }
};

export const getApiBaseUrl = () => currentBaseUrl;

const request = async (endpoint, options = {}) => {
  const url = `${currentBaseUrl}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(url, { ...options, headers });
    const data = await response.json();
    return data;
  } catch (error) {
    return {
      success: false,
      message: error.message || "Network connection error",
    };
  }
};

export const api = {
  auth: {
    sendOtp: (phone, channel = "whatsapp") =>
      request("/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ phone, channel }),
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
    getVipCount: () => request("/parties/vip-count"),
    sendBulkVipOffer: () =>
      request("/parties/send-bulk-vip-offer", { method: "POST" }),
    updateRegularPerks: (id, payload) =>
      request(`/parties/${id}/regular-perks`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    getWhatsAppOffer: (id) => request(`/parties/${id}/whatsapp-offer`),
    delete: (id) => request(`/parties/${id}`, { method: "DELETE" }),
  },
  items: {
    getAll: (params = "") => request(`/items${params ? `?${params}` : ""}`),
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
  },
  invoices: {
    getAll: (params = "") => request(`/invoices${params ? `?${params}` : ""}`),
    getOne: (id) => request(`/invoices/${id}`),
    create: (payload) =>
      request("/invoices", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },
};
