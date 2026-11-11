import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCachedData, setCachedData } from "./localCache";

const OFFLINE_QUEUE_KEY = "offline_pending_invoices";
const OFFLINE_ITEM_OPS_KEY = "offline_pending_item_ops";
let memoryQueue = null;
let memoryItemOps = null;
let isSyncing = false;
let isSyncingItems = false;
const listeners = new Set();
const itemListeners = new Set();

function notifyListeners(queue) {
  for (const cb of listeners) {
    try {
      cb(queue);
    } catch {}
  }
}

function notifyItemListeners(ops) {
  for (const cb of itemListeners) {
    try {
      cb(ops);
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

// ============================================================
// Offline Food / Inventory Items Queue (Create / Edit / Delete / Category)
// ============================================================

export async function getPendingOfflineItemOps() {
  if (Array.isArray(memoryItemOps)) {
    return memoryItemOps;
  }
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_ITEM_OPS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    memoryItemOps = Array.isArray(parsed) ? parsed : [];
    return memoryItemOps;
  } catch {
    memoryItemOps = [];
    return [];
  }
}

async function saveItemOps(nextOps) {
  memoryItemOps = nextOps;
  try {
    await AsyncStorage.setItem(OFFLINE_ITEM_OPS_KEY, JSON.stringify(nextOps));
  } catch {}
  notifyItemListeners(nextOps);
}

export function subscribeOfflineItemOps(listener) {
  itemListeners.add(listener);
  getPendingOfflineItemOps().then((ops) => {
    try {
      listener(ops);
    } catch {}
  });
  return () => itemListeners.delete(listener);
}

function applySingleItemOp(items, op) {
  if (op.type === "create") {
    const exists = items.some((it) => String(it._id) === String(op.targetId));
    if (exists) return items;
    return [op.previewItem, ...items];
  }
  if (op.type === "update") {
    return items.map((it) =>
      String(it._id) === String(op.targetId)
        ? { ...it, ...op.payload, isOfflinePending: true }
        : it
    );
  }
  if (op.type === "delete") {
    return items.filter((it) => String(it._id) !== String(op.targetId));
  }
  return items;
}

export async function applyOfflineItemOpsToList(serverItems = []) {
  const ops = await getPendingOfflineItemOps();
  if (!ops.length) return serverItems;
  let result = Array.isArray(serverItems) ? [...serverItems] : [];
  for (const op of ops) {
    result = applySingleItemOp(result, op);
  }
  return result;
}

async function addCategoryToLocalCache(catName) {
  if (!catName) return;
  try {
    const cachedCats = (await getCachedData("items_categories")) || [];
    if (!cachedCats.includes(catName)) {
      await setCachedData("items_categories", [...cachedCats, catName]);
    }
  } catch {}
}

export async function queueOfflineCategoryAdd(categoryName) {
  const clean = String(categoryName || "").trim();
  if (!clean) return { success: false };
  await addCategoryToLocalCache(clean);
  const ops = await getPendingOfflineItemOps();
  const nextOps = [
    ...ops,
    {
      id: `op_cat_${Date.now()}`,
      type: "category",
      payload: { name: clean },
      queuedAt: new Date().toISOString(),
    },
  ];
  await saveItemOps(nextOps);
  return { success: true, offlineQueued: true, category: clean };
}

export async function queueOfflineItemCreate(payload) {
  const now = new Date();
  const tempId = `offline_item_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const previewItem = {
    _id: tempId,
    ...payload,
    isOfflinePending: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  try {
    const cached = (await getCachedData("items_all")) || [];
    await setCachedData("items_all", [previewItem, ...cached]);
    await addCategoryToLocalCache(payload.category);
  } catch {}

  const ops = await getPendingOfflineItemOps();
  const nextOps = [
    ...ops,
    {
      id: `op_${Date.now()}`,
      type: "create",
      targetId: tempId,
      payload,
      previewItem,
      queuedAt: now.toISOString(),
    },
  ];
  await saveItemOps(nextOps);
  return { success: true, offlineQueued: true, item: previewItem };
}

export async function queueOfflineItemUpdate(itemId, payload) {
  const targetStr = String(itemId);
  try {
    const cached = (await getCachedData("items_all")) || [];
    const updatedCache = cached.map((it) =>
      String(it._id) === targetStr ? { ...it, ...payload, isOfflinePending: true } : it
    );
    await setCachedData("items_all", updatedCache);
    await addCategoryToLocalCache(payload.category);
  } catch {}

  const ops = await getPendingOfflineItemOps();
  const existingCreateIdx = ops.findIndex(
    (op) => op.type === "create" && String(op.targetId) === targetStr
  );
  let nextOps;
  if (existingCreateIdx !== -1) {
    nextOps = ops.map((op, idx) =>
      idx === existingCreateIdx
        ? {
            ...op,
            payload: { ...op.payload, ...payload },
            previewItem: { ...op.previewItem, ...payload, isOfflinePending: true },
          }
        : op
    );
  } else {
    const existingUpdateIdx = ops.findIndex(
      (op) => op.type === "update" && String(op.targetId) === targetStr
    );
    if (existingUpdateIdx !== -1) {
      nextOps = ops.map((op, idx) =>
        idx === existingUpdateIdx ? { ...op, payload: { ...op.payload, ...payload } } : op
      );
    } else {
      nextOps = [
        ...ops,
        {
          id: `op_${Date.now()}`,
          type: "update",
          targetId: itemId,
          payload,
          queuedAt: new Date().toISOString(),
        },
      ];
    }
  }
  await saveItemOps(nextOps);
  return { success: true, offlineQueued: true };
}

export async function queueOfflineItemDelete(itemId) {
  const targetStr = String(itemId);
  try {
    const cached = (await getCachedData("items_all")) || [];
    await setCachedData(
      "items_all",
      cached.filter((it) => String(it._id) !== targetStr)
    );
  } catch {}

  const ops = await getPendingOfflineItemOps();
  const hadOfflineCreate = ops.some(
    (op) => op.type === "create" && String(op.targetId) === targetStr
  );
  // Drop pending creates/updates for this item; only send DELETE if it already exists on server
  const filtered = ops.filter((op) => String(op.targetId) !== targetStr);
  const nextOps = hadOfflineCreate
    ? filtered
    : [
        ...filtered,
        {
          id: `op_${Date.now()}`,
          type: "delete",
          targetId: itemId,
          queuedAt: new Date().toISOString(),
        },
      ];
  await saveItemOps(nextOps);
  return { success: true, offlineQueued: true };
}

async function remapPendingOfflineIds(oldId, realId) {
  if (!oldId || !realId) return;
  const oldStr = String(oldId);

  try {
    const cached = await getCachedData("items_all");
    if (Array.isArray(cached)) {
      await setCachedData(
        "items_all",
        cached.map((it) =>
          String(it._id) === oldStr ? { ...it, _id: realId, isOfflinePending: false } : it
        )
      );
    }
  } catch {}

  const invQueue = await getPendingOfflineInvoices();
  let invChanged = false;
  const updatedInvQueue = invQueue.map((job) => {
    const items = job?.payload?.items;
    if (!Array.isArray(items)) return job;
    let jobModified = false;
    const remappedItems = items.map((it) => {
      if (String(it.itemId) === oldStr) {
        jobModified = true;
        return { ...it, itemId: realId };
      }
      return it;
    });
    if (!jobModified) return job;
    invChanged = true;
    return { ...job, payload: { ...job.payload, items: remappedItems } };
  });
  if (invChanged) {
    await saveQueue(updatedInvQueue);
  }
}

export async function syncOfflineItems(itemsApi, onSynced) {
  if (isSyncingItems) {
    return { synced: 0, remaining: (await getPendingOfflineItemOps()).length };
  }
  const ops = await getPendingOfflineItemOps();
  if (!ops.length) return { synced: 0, remaining: 0 };

  isSyncingItems = true;
  let synced = 0;
  let workingOps = [...ops];

  try {
    for (let i = 0; i < ops.length; i++) {
      const op = workingOps[0];
      if (!op) break;
      let res;
      if (op.type === "category") {
        res = await itemsApi.addCategory(op.payload.name);
      } else if (op.type === "create") {
        res = await itemsApi.create(op.payload);
      } else if (op.type === "update") {
        res = await itemsApi.update(op.targetId, op.payload);
      } else if (op.type === "delete") {
        res = await itemsApi.delete(op.targetId);
      }

      if (res && res.success) {
        synced += 1;
        if (op.type === "create" && res.item?._id) {
          const realId = res.item._id;
          const oldStr = String(op.targetId);
          workingOps = workingOps.map((nextOp) =>
            String(nextOp.targetId) === oldStr ? { ...nextOp, targetId: realId } : nextOp
          );
          await remapPendingOfflineIds(oldStr, realId);
        }
        workingOps = workingOps.filter((q) => q.id !== op.id);
        await saveItemOps(workingOps);
      } else if (isNetworkErrorMessage(res?.message)) {
        break;
      } else {
        workingOps = workingOps.filter((q) => q.id !== op.id);
        await saveItemOps(workingOps);
      }
    }

    if (synced > 0 && typeof onSynced === "function") {
      try {
        await onSynced(synced, workingOps.length);
      } catch {}
    }
    return { synced, remaining: workingOps.length };
  } catch (err) {
    if (!isNetworkErrorMessage(err?.message)) {
      return { synced, remaining: workingOps.length };
    }
    return { synced, remaining: workingOps.length };
  } finally {
    isSyncingItems = false;
  }
}

export async function syncAllOfflineData(apiClient, onSynced) {
  const itemResult = await syncOfflineItems(apiClient.items);
  const invResult = await syncOfflineInvoices((payload) => apiClient.invoices.create(payload));
  const totalSynced = (itemResult.synced || 0) + (invResult.synced || 0);
  if (totalSynced > 0 && typeof onSynced === "function") {
    try {
      await onSynced({ itemsSynced: itemResult.synced, invoicesSynced: invResult.synced });
    } catch {}
  }
  return {
    itemsSynced: itemResult.synced || 0,
    itemsRemaining: itemResult.remaining || 0,
    invoicesSynced: invResult.synced || 0,
    invoicesRemaining: invResult.remaining || 0,
  };
}

