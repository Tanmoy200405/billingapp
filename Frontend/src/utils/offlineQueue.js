import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCachedData, setCachedData } from "./localCache";

const OFFLINE_QUEUE_KEY = "offline_pending_invoices";
let memoryQueue = null;
let isSyncing = false;
const listeners = new Set();

function notifyListeners(queue) {
  for (const cb of listeners) {
    try {
      cb(queue);
    } catch {}
  }
}

export function isNetworkErrorMessage(msg = "") {
  const lower = String(msg || "").toLowerCase();
  return (
    lower.includes("network") ||
    lower.includes("failed to fetch") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("connection error") ||
    lower.includes("abort") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound")
  );
}

export async function getPendingOfflineInvoices() {
  if (Array.isArray(memoryQueue)) {
    return memoryQueue;
  }
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    memoryQueue = Array.isArray(parsed) ? parsed : [];
    return memoryQueue;
  } catch {
    memoryQueue = [];
    return [];
  }
}

async function saveQueue(nextQueue) {
  memoryQueue = nextQueue;
  try {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(nextQueue));
  } catch {}
  notifyListeners(nextQueue);
}

export function subscribeOfflineQueue(listener) {
  listeners.add(listener);
  getPendingOfflineInvoices().then((q) => {
    try {
      listener(q);
    } catch {}
  });
  return () => listeners.delete(listener);
}

/**
 * Save an invoice locally when offline, optimistically deduct local stock and update cached dashboard stats.
 */
export async function queueOfflineInvoice(payload, summary = {}) {
  const now = new Date();
  const shortTag = String(Date.now()).slice(-4);
  const offlineId = `offline_${Date.now()}`;

  const offlineInvoice = {
    _id: offlineId,
    invoiceNumber: `OFF-${shortTag}`,
    isOfflinePending: true,
    partyName: payload.partyName || "Walk-in Customer",
    partyPhone: payload.partyPhone || "",
    paymentMode: payload.paymentMode || "CASH",
    cashAmount: payload.cashAmount || 0,
    upiAmount: payload.upiAmount || 0,
    items: (payload.items || []).map((it) => ({
      ...it,
      total: Number(it.sellingPrice || 0) * Number(it.quantity || 1),
    })),
    subtotal: Number(summary.subtotal ?? summary.grandTotal ?? 0),
    discountTotal: Number(summary.discountTotal || 0),
    regularDiscountAmount: Number(summary.regularDiscountAmount || 0),
    grandTotal: Number(summary.grandTotal || 0),
    freebieItemGiven: payload.customFreebieItem || "",
    invoiceDate: now.toISOString(),
    createdAt: now.toISOString(),
  };

  const currentQueue = await getPendingOfflineInvoices();
  const nextQueue = [
    ...currentQueue,
    {
      id: offlineId,
      queuedAt: now.toISOString(),
      payload,
      invoicePreview: offlineInvoice,
    },
  ];
  await saveQueue(nextQueue);

  // Optimistically update cached items stock & dashboard stats
  try {
    const cachedItems = await getCachedData("items_all");
    if (Array.isArray(cachedItems) && cachedItems.length > 0) {
      const qtyById = new Map(
        (payload.items || []).map((it) => [String(it.itemId), Number(it.quantity || 1)])
      );
      const updatedItems = cachedItems.map((item) => {
        const deducted = qtyById.get(String(item._id)) || 0;
        if (deducted > 0 && typeof item.stock === "number") {
          return { ...item, stock: Math.max(0, item.stock - deducted) };
        }
        return item;
      });
      await setCachedData("items_all", updatedItems);
    }

    const cachedDash = await getCachedData("dashboard_stats");
    if (cachedDash && typeof cachedDash === "object") {
      const prevStats = cachedDash.stats || {};
      const nextStats = {
        ...prevStats,
        todaySalesTotal: Number(prevStats.todaySalesTotal || 0) + Number(offlineInvoice.grandTotal || 0),
        todayInvoiceCount: Number(prevStats.todayInvoiceCount || 0) + 1,
      };
      const nextRecent = [offlineInvoice, ...(cachedDash.recentTransactions || [])];
      await setCachedData("dashboard_stats", {
        stats: nextStats,
        recentTransactions: nextRecent,
      });
    }
  } catch {}

  return {
    success: true,
    offlineQueued: true,
    invoice: offlineInvoice,
  };
}

/**
 * Flush pending offline invoices in FIFO order whenever connectivity returns.
 */
export async function syncOfflineInvoices(createInvoiceFn, onSynced) {
  if (isSyncing) return { synced: 0, remaining: (await getPendingOfflineInvoices()).length };
  const queue = await getPendingOfflineInvoices();
  if (!queue.length) return { synced: 0, remaining: 0 };

  isSyncing = true;
  let synced = 0;
  let workingQueue = [...queue];

  try {
    for (let i = 0; i < queue.length; i++) {
      const job = queue[i];
      const res = await createInvoiceFn(job.payload);
      if (res && res.success && res.invoice) {
        synced += 1;
        workingQueue = workingQueue.filter((q) => q.id !== job.id);
        await saveQueue(workingQueue);
      } else if (isNetworkErrorMessage(res?.message)) {
        // Still offline: stop and retry on next trigger
        break;
      } else {
        // Non-network validation error (keep remaining, skip unrecoverable job so queue doesn't jam)
        workingQueue = workingQueue.filter((q) => q.id !== job.id);
        await saveQueue(workingQueue);
      }
    }

    if (synced > 0 && typeof onSynced === "function") {
      try {
        await onSynced(synced, workingQueue.length);
      } catch {}
    }
    return { synced, remaining: workingQueue.length };
  } finally {
    isSyncing = false;
  }
}
