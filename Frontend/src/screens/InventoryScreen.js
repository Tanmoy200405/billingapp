import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  Switch,
} from "react-native";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "../config/api";
import { downloadReportFile } from "../utils/reportDownloader";
import { getCachedData, setCachedData, getMemoryCachedData } from "../utils/localCache";
import {
  subscribeOfflineItemOps,
  applyOfflineItemOpsToList,
  queueOfflineItemCreate,
  queueOfflineItemUpdate,
  queueOfflineItemDelete,
  queueOfflineCategoryAdd,
  syncAllOfflineData,
  isNetworkErrorMessage,
} from "../utils/offlineQueue";
import { useResponsive, ResponsiveContainer } from "../utils/responsive";

function SafeProductImage({ uri }) {
  const [hasError, setHasError] = useState(false);

  if (!uri || hasError) {
    return (
      <View className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 items-center justify-center mr-3">
        <FontAwesome5 name="box-open" size={20} color="#2563EB" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      onError={() => setHasError(true)}
      style={{ width: 48, height: 48, borderRadius: 10, marginRight: 12 }}
    />
  );
}

export default function InventoryScreen({ user, isActive = true, onOpenDrawer, onBack }) {
  const { isWide, gridColumns, headerTopPadding } = useResponsive();
  const businessType = user?.businessType || "restaurant";

  // ── 5 Core Sub-tabs: "menu" | "raw" | "recipe" | "transfers" | "po" ──
  const [activeTab, setActiveTab] = useState("menu");

  const [items, setItems] = useState(() => getMemoryCachedData("items_all") || []);
  const [salesSummary, setSalesSummary] = useState(() => getMemoryCachedData("items_sales_summary") || { byItemId: {}, byName: {} });
  const [selectedStatsItem, setSelectedStatsItem] = useState(null);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [itemStatsData, setItemStatsData] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [importingPdf, setImportingPdf] = useState(false);
  const [categories, setCategories] = useState(() => {
    const cached = getMemoryCachedData("items_categories") || ["General"];
    return Array.from(new Set(["General", ...cached.filter(Boolean)]));
  });
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [pendingItemOps, setPendingItemOps] = useState([]);
  const [syncingOfflineItems, setSyncingOfflineItems] = useState(false);

  // ── Form State for Add / Edit Item ──
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("General");
  const [formBarcode, setFormBarcode] = useState("");
  const [formHsn, setFormHsn] = useState("");
  const [formCostPrice, setFormCostPrice] = useState("");
  const [formSellingPrice, setFormSellingPrice] = useState("");
  const [formTaxRate, setFormTaxRate] = useState("0");
  const [formStock, setFormStock] = useState("0");
  const [formUnit, setFormUnit] = useState("PCS");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formItemType, setFormItemType] = useState("FINISHED_GOOD"); // FINISHED_GOOD | RAW_MATERIAL | SEMI_FINISHED
  const [formDineInAvailable, setFormDineInAvailable] = useState(true);
  const [formOnlineAvailable, setFormOnlineAvailable] = useState(true);
  const [formLowStockThreshold, setFormLowStockThreshold] = useState("5");

  // ── Central Kitchen & Transfers State ──
  const [transfers, setTransfers] = useState([]);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferType, setTransferType] = useState("INDENT_REQUEST"); // INDENT_REQUEST | SUPPLY_DISPATCH | DAMAGED_RETURN
  const [transferSource, setTransferSource] = useState("Main Outlet");
  const [transferDest, setTransferDest] = useState("Central Kitchen Hub");
  const [transferItems, setTransferItems] = useState([]);
  const [transferNotes, setTransferNotes] = useState("");
  const [savingTransfer, setSavingTransfer] = useState(false);

  // ── Multi-Stage Recipe (BOM) State ──
  const [recipeModalVisible, setRecipeModalVisible] = useState(false);
  const [selectedDishForRecipe, setSelectedDishForRecipe] = useState(null);
  const [recipeIngredients, setRecipeIngredients] = useState([]);
  const [autoDeductRecipe, setAutoDeductRecipe] = useState(true);
  const [savingRecipe, setSavingRecipe] = useState(false);

  // ── Purchase Order (PO) State ──
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [poLoading, setPoLoading] = useState(false);
  const [poModalVisible, setPoModalVisible] = useState(false);
  const [poSupplierName, setPoSupplierName] = useState("");
  const [poSupplierPhone, setPoSupplierPhone] = useState("");
  const [poSource, setPoSource] = useState("SUPPLIER"); // SUPPLIER | CENTRAL_KITCHEN
  const [poItems, setPoItems] = useState([]);
  const [poNotes, setPoNotes] = useState("");
  const [savingPo, setSavingPo] = useState(false);
  const [frequentItems, setFrequentItems] = useState([]);

  const showNotice = (title, msg) => {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  useEffect(() => {
    const unsub = subscribeOfflineItemOps((ops) => {
      setPendingItemOps(Array.isArray(ops) ? ops : []);
    });
    return unsub;
  }, []);

  const sortItemsNaturally = (list) => {
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
  };

  const loadItems = useCallback(async () => {
    const isUnfiltered = !search && selectedCategory === "All" && !filterLowStock;
    let hasCached = false;
    if (isUnfiltered) {
      const cached = await getCachedData("items_all");
      if (Array.isArray(cached) && cached.length > 0) {
        const mergedCached = await applyOfflineItemOpsToList(cached);
        setItems(sortItemsNaturally(mergedCached));
        hasCached = true;
      }
    }
    if (!hasCached) setLoading(true);

    try {
      const queryParts = [];
      if (search.trim()) queryParts.push(`search=${encodeURIComponent(search.trim())}`);
      if (selectedCategory !== "All") queryParts.push(`category=${encodeURIComponent(selectedCategory)}`);
      if (filterLowStock) queryParts.push("lowStock=true");
      const queryString = queryParts.join("&");

      const res = await api.items.getAll(queryString);
      if (res.success && Array.isArray(res.items)) {
        const merged = await applyOfflineItemOpsToList(res.items);
        const sorted = sortItemsNaturally(merged);
        setItems(sorted);
        if (isUnfiltered) {
          setCachedData("items_all", sorted);
        }
      }
    } catch (e) {
      console.warn("loadItems warning:", e.message);
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory, filterLowStock]);

  const loadSalesSummary = useCallback(async () => {
    try {
      const sRes = await api.items.getSalesSummary();
      if (sRes && sRes.success) {
        const payload = {
          byItemId: sRes.byItemId || {},
          byName: sRes.byName || {},
        };
        setSalesSummary(payload);
        setCachedData("items_sales_summary", payload);
      }
    } catch (e) {
      console.warn("loadSalesSummary error:", e.message);
    }
  }, []);

  const loadTransfers = async () => {
    setTransfersLoading(true);
    try {
      const res = await api.inventory.getTransfers();
      if (res?.success && Array.isArray(res.transfers)) {
        setTransfers(res.transfers);
      }
    } catch (e) {
      console.warn("loadTransfers error:", e.message);
    } finally {
      setTransfersLoading(false);
    }
  };

  const loadPurchaseOrders = async () => {
    setPoLoading(true);
    try {
      const [poRes, freqRes] = await Promise.all([
        api.inventory.getPurchaseOrders(),
        api.inventory.getFrequentItems().catch(() => ({})),
      ]);
      if (poRes?.success && Array.isArray(poRes.purchaseOrders)) {
        setPurchaseOrders(poRes.purchaseOrders);
      }
      if (freqRes?.success && Array.isArray(freqRes.frequentItems)) {
        setFrequentItems(freqRes.frequentItems);
      }
    } catch (e) {
      console.warn("loadPurchaseOrders error:", e.message);
    } finally {
      setPoLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await api.items.getCategories();
      if (res.success && Array.isArray(res.categories)) {
        const normalized = res.categories.map((c) =>
          typeof c === "string" ? c.trim() : (c.name || "General").trim()
        );
        const unique = Array.from(new Set(["General", ...normalized.filter(Boolean)]));
        setCategories(unique);
        setCachedData("items_categories", unique);
      }
    } catch { }
  };

  const handleOpenItemStats = async (item) => {
    if (!item) return;
    setSelectedStatsItem(item);
    setStatsModalVisible(true);
    setStatsLoading(true);

    const quick =
      salesSummary.byItemId?.[item._id] ||
      salesSummary.byName?.[String(item.name || "").trim().toLowerCase()];

    setItemStatsData({
      stats: quick || {
        totalSoldQuantity: 0,
        totalRevenue: 0,
        todaySoldQuantity: 0,
        todayRevenue: 0,
        yesterdaySoldQuantity: 0,
        yesterdayRevenue: 0,
        invoiceCount: 0,
        totalParcelQuantity: 0,
        lastSoldAt: null,
      },
      item,
    });

    try {
      const res = await api.items.getSalesStats(item._id);
      if (res && res.success) {
        setItemStatsData(res);
      }
    } catch {
      // Keep quick stats
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      loadItems();
      loadCategories();
      loadSalesSummary();
      if (activeTab === "transfers") loadTransfers();
      if (activeTab === "po") loadPurchaseOrders();
    }
  }, [isActive, loadItems, loadSalesSummary, activeTab]);

  // ── Quick Channel Availability Toggle ──
  const handleToggleChannel = async (item, channel) => {
    const isDineIn = channel === "dineIn";
    const currentVal = isDineIn ? item.isDineInAvailable !== false : item.isOnlineAvailable !== false;
    const newVal = !currentVal;

    // Optimistically update
    setItems((prev) =>
      prev.map((it) =>
        it._id === item._id
          ? {
            ...it,
            [isDineIn ? "isDineInAvailable" : "isOnlineAvailable"]: newVal,
          }
          : it
      )
    );

    try {
      const payload = isDineIn ? { isDineInAvailable: newVal } : { isOnlineAvailable: newVal };
      await api.inventory.updateAvailability(item._id, payload);
    } catch (e) {
      showNotice("Notice", `Failed to toggle ${channel} availability`);
      loadItems();
    }
  };

  // ── Open Add/Edit Item ──
  const resetForm = () => {
    setEditingItem(null);
    setFormName("");
    setFormCategory("General");
    setFormBarcode("");
    setFormHsn("");
    setFormCostPrice("");
    setFormSellingPrice("");
    setFormTaxRate("0");
    setFormStock("0");
    setFormUnit("PCS");
    setFormImageUrl("");
    setFormItemType(activeTab === "raw" ? "RAW_MATERIAL" : "FINISHED_GOOD");
    setFormDineInAvailable(true);
    setFormOnlineAvailable(true);
    setFormLowStockThreshold("5");
  };

  const handleOpenAdd = () => {
    resetForm();
    if (selectedCategory && selectedCategory !== "All") {
      setFormCategory(selectedCategory);
    }
    setModalVisible(true);
  };

  const handleOpenEdit = (item) => {
    if (!item) return;
    setEditingItem(item);
    setFormName(item.name || "");
    setFormCategory(item.category || "General");
    setFormBarcode(item.barcode || "");
    setFormHsn(item.hsnCode || "");
    setFormCostPrice(item.costPrice !== undefined ? String(item.costPrice) : "");
    setFormSellingPrice(item.sellingPrice !== undefined ? String(item.sellingPrice) : "");
    setFormTaxRate(item.taxRate !== undefined ? String(item.taxRate) : "0");
    setFormStock(item.stock !== undefined ? String(item.stock) : "0");
    setFormUnit(item.unit || "PCS");
    setFormImageUrl(item.imageUrl || "");
    setFormItemType(item.itemType || "FINISHED_GOOD");
    setFormDineInAvailable(item.isDineInAvailable !== false);
    setFormOnlineAvailable(item.isOnlineAvailable !== false);
    setFormLowStockThreshold(String(item.lowStockThreshold || 5));
    setModalVisible(true);
  };

  const handleSaveItem = async () => {
    Keyboard.dismiss();
    if (!formName.trim() || !formSellingPrice.trim()) {
      showNotice("Required Fields", "Please enter Item Name and Selling Price");
      return;
    }

    const payload = {
      name: formName.trim(),
      category: formCategory.trim() || "General",
      barcode: formBarcode.trim() || undefined,
      hsnCode: formHsn.trim() || undefined,
      costPrice: Number(formCostPrice) || 0,
      sellingPrice: Number(formSellingPrice),
      taxRate: Number(formTaxRate) || 0,
      stock: Number(formStock) || 0,
      unit: formUnit,
      imageUrl: formImageUrl || "",
      itemType: formItemType,
      isDineInAvailable: formDineInAvailable,
      isOnlineAvailable: formOnlineAvailable,
      lowStockThreshold: Number(formLowStockThreshold) || 5,
    };

    let res;
    try {
      if (editingItem) {
        res = await api.items.update(editingItem._id, payload);
      } else {
        res = await api.items.create(payload);
      }

      if (res?.success) {
        setModalVisible(false);
        resetForm();
        loadItems();
        showNotice("Success", editingItem ? "Item updated successfully" : "Item added to inventory");
      } else {
        showNotice("Error", res?.message || "Failed to save item");
      }
    } catch (e) {
      showNotice("Error", e.message || "Failed to save item");
    }
  };

  const handleDeleteItem = async (item) => {
    if (!item?._id) return;
    Alert.alert(
      "Delete Item",
      `Are you sure you want to delete "${item.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await api.items.delete(item._id);
              if (res?.success) {
                loadItems();
                showNotice("Deleted", `"${item.name}" removed.`);
              }
            } catch (e) {
              showNotice("Error", e.message || "Could not delete item");
            }
          },
        },
      ]
    );
  };

  // ── Recipe Modal Handlers ──
  const handleOpenRecipeModal = (dish) => {
    setSelectedDishForRecipe(dish);
    setRecipeIngredients(dish.recipe ? [...dish.recipe] : []);
    setAutoDeductRecipe(dish.autoDeductRecipeStock !== false);
    setRecipeModalVisible(true);
  };

  const handleAddRecipeIngredient = () => {
    const rawItems = items.filter((it) => it.itemType === "RAW_MATERIAL" || it.itemType === "SEMI_FINISHED");
    const defaultRaw = rawItems[0] || items[0];
    if (!defaultRaw) {
      showNotice("No Raw Materials", "Please add raw materials first in the 'Raw Materials' tab.");
      return;
    }
    setRecipeIngredients((prev) => [
      ...prev,
      {
        rawMaterialId: defaultRaw._id,
        rawMaterialName: defaultRaw.name,
        quantity: 100,
        unit: defaultRaw.unit || "GM",
        stage: "COOKING",
      },
    ]);
  };

  const handleSaveRecipe = async () => {
    if (!selectedDishForRecipe) return;
    setSavingRecipe(true);
    try {
      const res = await api.inventory.saveRecipe(selectedDishForRecipe._id, {
        recipe: recipeIngredients,
        autoDeductRecipeStock: autoDeductRecipe,
      });
      if (res?.success) {
        setRecipeModalVisible(false);
        showNotice("Recipe Saved", `BOM recipe saved for ${selectedDishForRecipe.name}! POS billing will auto-deduct raw materials.`);
        loadItems();
      } else {
        showNotice("Error", res?.message || "Failed to save recipe");
      }
    } catch (e) {
      showNotice("Error", e.message || "Failed to save recipe");
    } finally {
      setSavingRecipe(false);
    }
  };

  // ── Central Kitchen Transfer Modal Handlers ──
  const handleOpenTransferModal = (type = "INDENT_REQUEST") => {
    setTransferType(type);
    setTransferSource(type === "SUPPLY_DISPATCH" ? "Central Kitchen Hub" : "Main Outlet");
    setTransferDest(type === "SUPPLY_DISPATCH" ? "Main Outlet" : type === "DAMAGED_RETURN" ? "Supplier / Kitchen" : "Central Kitchen Hub");
    const firstItem = items[0];
    setTransferItems(
      firstItem
        ? [
          {
            itemId: firstItem._id,
            name: firstItem.name,
            quantity: 10,
            unit: firstItem.unit || "KG",
            reason: type === "DAMAGED_RETURN" ? "Damaged Packaging" : "",
          },
        ]
        : []
    );
    setTransferNotes("");
    setTransferModalVisible(true);
  };

  const handleSaveTransfer = async () => {
    if (!transferItems.length) {
      showNotice("Required", "Add at least one item to transfer");
      return;
    }
    setSavingTransfer(true);
    try {
      const res = await api.inventory.createTransfer({
        type: transferType,
        sourceType: transferType === "SUPPLY_DISPATCH" ? "CENTRAL_KITCHEN" : "OUTLET",
        sourceName: transferSource,
        destinationType: transferType === "SUPPLY_DISPATCH" ? "OUTLET" : "CENTRAL_KITCHEN",
        destinationName: transferDest,
        items: transferItems,
        notes: transferNotes,
      });

      if (res?.success) {
        setTransferModalVisible(false);
        showNotice("Success", res.message || "Transfer ticket raised successfully");
        loadTransfers();
        loadItems();
      } else {
        showNotice("Error", res?.message || "Failed to create transfer");
      }
    } catch (e) {
      showNotice("Error", e.message || "Failed to create transfer");
    } finally {
      setSavingTransfer(false);
    }
  };

  const handleUpdateTransferStatus = async (transferId, status) => {
    try {
      const res = await api.inventory.updateTransferStatus(transferId, status);
      if (res?.success) {
        showNotice("Updated", res.message || `Transfer marked as ${status}`);
        loadTransfers();
        loadItems();
      }
    } catch (e) {
      showNotice("Error", e.message || "Failed to update status");
    }
  };

  // ── Purchase Order (PO) Modal Handlers ──
  const handleOpenPoModal = (prefillItem = null) => {
    setPoSupplierName("");
    setPoSupplierPhone("");
    setPoSource("SUPPLIER");
    const itemToAdd = prefillItem || items[0];
    setPoItems(
      itemToAdd
        ? [
          {
            itemId: itemToAdd._id,
            name: itemToAdd.name,
            quantity: 25,
            unit: itemToAdd.unit || "KG",
            unitPrice: itemToAdd.costPrice || 50,
          },
        ]
        : []
    );
    setPoNotes("");
    setPoModalVisible(true);
  };

  const handleSavePo = async () => {
    if (!poSupplierName.trim()) {
      showNotice("Required", "Please enter Supplier / Kitchen Name");
      return;
    }
    if (!poItems.length) {
      showNotice("Required", "Add at least one item to the PO");
      return;
    }
    setSavingPo(true);
    try {
      const res = await api.inventory.createPurchaseOrder({
        supplierName: poSupplierName.trim(),
        supplierPhone: poSupplierPhone.trim(),
        source: poSource,
        items: poItems,
        notes: poNotes,
      });

      if (res?.success) {
        setPoModalVisible(false);
        showNotice("Success", `Purchase Order ${res.purchaseOrder?.poNumber} raised successfully!`);
        loadPurchaseOrders();
      } else {
        showNotice("Error", res?.message || "Failed to create PO");
      }
    } catch (e) {
      showNotice("Error", e.message || "Failed to create PO");
    } finally {
      setSavingPo(false);
    }
  };

  const handleUpdatePoStatus = async (poId, status) => {
    try {
      const res = await api.inventory.updatePurchaseOrderStatus(poId, status);
      if (res?.success) {
        showNotice("Updated", res.message || `PO marked as ${status}`);
        loadPurchaseOrders();
        loadItems();
      }
    } catch (e) {
      showNotice("Error", e.message || "Failed to update PO status");
    }
  };

  // Filter items based on active subtab
  const displayedItems = items.filter((it) => {
    if (activeTab === "raw") {
      return it.itemType === "RAW_MATERIAL" || it.itemType === "SEMI_FINISHED";
    }
    if (activeTab === "recipe") {
      return it.itemType !== "RAW_MATERIAL";
    }
    return it.itemType !== "RAW_MATERIAL"; // "menu" shows food dishes & finished goods
  });

  const lowStockRawCount = items.filter(
    (it) =>
      (it.itemType === "RAW_MATERIAL" || it.itemType === "SEMI_FINISHED") &&
      Number(it.stock || 0) <= Number(it.lowStockThreshold || 5)
  ).length;

  return (
    <View style={{ flex: 1 }} className="flex-1 bg-slate-50">
      {/* ── Top Header ── */}
      <View style={{ paddingTop: headerTopPadding }} className="bg-blue-600 px-3 sm:px-4 pb-3 shadow-sm">
        <ResponsiveContainer maxWidth={1200}>
          <View className="flex-row items-center justify-between mb-1">
            <View className="flex-row items-center flex-1 mr-2 overflow-hidden">
              {!isWide && (
                <TouchableOpacity onPress={onOpenDrawer} className="mr-2 p-1" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="menu" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              )}
              {onBack && !isWide ? (
                <TouchableOpacity onPress={onBack} className="flex-row items-center bg-white/20 px-2 py-1 rounded-lg mr-2 shrink-0">
                  <Ionicons name="arrow-back" size={15} color="#FFFFFF" />
                  <Text className="text-white text-xs font-bold ml-0.5">Back</Text>
                </TouchableOpacity>
              ) : null}
              <View className="flex-row items-center flex-1 shrink">
                <Text className="text-white text-base sm:text-lg font-black tracking-wide shrink" numberOfLines={1}>
                  {isWide ? "Restaurant Inventory" : "Inventory"}
                </Text>
                <View className="bg-white/20 border border-white/30 px-2 py-0.5 rounded-full ml-1.5 shrink-0">
                  <Text className="text-white text-[10px] font-extrabold">{items.length}</Text>
                </View>
              </View>
            </View>

            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={() => {
                  loadItems();
                  loadCategories();
                  loadSalesSummary();
                }}
                disabled={loading}
                activeOpacity={0.8}
                className="bg-white/20 p-2 rounded-xl flex-row items-center shrink-0 border border-white/30"
              >
                <Ionicons name="cloud-download-outline" size={16} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleOpenAdd}
                activeOpacity={0.8}
                className="bg-white px-3 py-1.5 rounded-xl flex-row items-center shrink-0 shadow-xs"
              >
                <Ionicons name="add-circle" size={16} color="#2563EB" />
                <Text className="text-blue-600 text-xs font-black ml-1">+ Add Item</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ResponsiveContainer>
      </View>

      {/* ── 5 Core Restaurant Sub-tabs ── */}
      <View className="bg-white border-b border-slate-200 px-2 py-2">
        <ResponsiveContainer maxWidth={1200}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            {[
              { id: "menu", label: "All Items / Menu", icon: "fast-food" },
              { id: "raw", label: `Raw Materials${lowStockRawCount > 0 ? ` (${lowStockRawCount} Low)` : ""}`, icon: "cube" },
              { id: "recipe", label: "Multi-Stage Recipes (BOM)", icon: "restaurant" },
              { id: "transfers", label: "Central Kitchen Hub", icon: "git-network" },
              { id: "po", label: "Purchase Orders (PO)", icon: "receipt" },
            ].map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  className={`flex-row items-center px-3.5 py-2 rounded-xl mr-2 ${isSelected ? "bg-blue-600 shadow-xs" : "bg-slate-100"
                    }`}
                >
                  <Ionicons name={tab.icon} size={14} color={isSelected ? "#FFFFFF" : "#64748B"} style={{ marginRight: 6 }} />
                  <Text className={`text-xs font-black ${isSelected ? "text-white" : "text-slate-700"}`}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </ResponsiveContainer>
      </View>

      {/* ── Search Bar & Filter Strip ── */}
      <View className="bg-white border-b border-slate-200 px-3 py-2">
        <ResponsiveContainer maxWidth={1200}>
          {/* Row 1: Full-width search bar */}
          <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-2">
            <Ionicons name="search" size={16} color="#64748B" />
            <TextInput
              className="flex-1 text-xs text-slate-900 ml-2 font-medium"
              placeholder={`Search ${activeTab === "raw" ? "raw materials..." : activeTab === "transfers" ? "transfers..." : activeTab === "po" ? "purchase orders..." : "dishes & menu..."}`}
              value={search}
              onChangeText={setSearch}
              placeholderTextColor="#94A3B8"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Row 2: Category Filter Chips on their own dedicated row */}
          {activeTab === "menu" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row pb-1">
              {["All", ...categories].map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setSelectedCategory(c)}
                  className={`px-3 py-1.5 rounded-lg border mr-1.5 ${selectedCategory === c ? "bg-slate-900 border-slate-900" : "bg-slate-50 border-slate-200"
                    }`}
                >
                  <Text className={`text-xs font-bold ${selectedCategory === c ? "text-white" : "text-slate-600"}`}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {activeTab === "transfers" && (
            <View className="flex-row gap-1.5 pb-1">
              <TouchableOpacity onPress={() => handleOpenTransferModal("INDENT_REQUEST")} className="bg-blue-600 px-3 py-1.5 rounded-xl flex-row items-center shadow-xs">
                <Ionicons name="arrow-down-circle" size={14} color="#FFFFFF" />
                <Text className="text-white text-xs font-black ml-1">Indent</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleOpenTransferModal("DAMAGED_RETURN")} className="bg-red-600 px-3 py-1.5 rounded-xl flex-row items-center shadow-xs">
                <Ionicons name="return-down-back" size={14} color="#FFFFFF" />
                <Text className="text-white text-xs font-black ml-1">Return</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === "po" && (
            <View className="flex-row pb-1">
              <TouchableOpacity onPress={() => handleOpenPoModal()} className="bg-blue-600 px-3 py-1.5 rounded-xl flex-row items-center shadow-xs">
                <Ionicons name="add" size={15} color="#FFFFFF" />
                <Text className="text-white text-xs font-black ml-1">+ Raise PO</Text>
              </TouchableOpacity>
            </View>
          )}
        </ResponsiveContainer>
      </View>

      {/* ── Main Sub-tab Body ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: isWide ? 20 : 12, paddingBottom: 120, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={loading || transfersLoading || poLoading} onRefresh={() => { loadItems(); loadCategories(); loadSalesSummary(); if (activeTab === "transfers") loadTransfers(); if (activeTab === "po") loadPurchaseOrders(); }} />}
      >
        <ResponsiveContainer maxWidth={1200}>
          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* SUB-TAB 1 & 2: DISHES (MENU) & RAW MATERIALS                   */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {(activeTab === "menu" || activeTab === "raw" || activeTab === "recipe") && (
            <View>
              {activeTab === "raw" && lowStockRawCount > 0 && (
                <View className="bg-red-50 p-3 rounded-2xl border border-red-200 mb-3 flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 mr-2">
                    <Ionicons name="warning" size={20} color="#DC2626" />
                    <View className="ml-2.5">
                      <Text className="text-xs font-black text-red-900">
                        {lowStockRawCount} Raw Material(s) Running Low
                      </Text>
                      <Text className="text-[10px] text-red-700">
                        Stock level is below reorder threshold. Raise a PO or Indent to central kitchen.
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleOpenTransferModal("INDENT_REQUEST")}
                    className="bg-red-600 px-3 py-1.5 rounded-xl"
                  >
                    <Text className="text-white text-xs font-black">Indent Now</Text>
                  </TouchableOpacity>
                </View>
              )}

              {displayedItems.length === 0 ? (
                <View className="py-16 items-center px-4">
                  <Ionicons name={activeTab === "raw" ? "cube-outline" : "fast-food-outline"} size={48} color="#94A3B8" />
                  <Text className="text-sm text-slate-800 mt-3 font-black text-center">
                    {loading ? "Loading items..." : activeTab === "raw" ? "No Raw Materials in Inventory" : "No Food Dishes in Menu"}
                  </Text>
                  {!loading && (
                    <TouchableOpacity onPress={handleOpenAdd} className="mt-4 bg-blue-600 px-4 py-2.5 rounded-xl flex-row items-center">
                      <Ionicons name="add" size={16} color="#FFFFFF" />
                      <Text className="text-white text-xs font-black ml-1">+ Add {activeTab === "raw" ? "Raw Material" : "Dish"}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View className={isWide ? "flex-row flex-wrap justify-between gap-y-3" : "flex-col gap-y-3"}>
                  {displayedItems.map((item) => {
                    const soldData =
                      salesSummary.byItemId?.[item._id] ||
                      salesSummary.byName?.[String(item.name || "").trim().toLowerCase()];
                    const totalSoldQty = soldData?.totalSoldQuantity || 0;
                    const totalSoldRev = soldData?.totalRevenue || 0;
                    const todaySoldQty = soldData?.todaySoldQuantity || 0;
                    const todaySoldRev = soldData?.todayRevenue || 0;

                    return (
                      <View
                        key={item._id}
                        style={{ width: isWide ? "48.8%" : "100%" }}
                        className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs justify-between"
                      >
                        <View>
                          {/* Title & Type Badge */}
                          <View className="flex-row items-center justify-between mb-2">
                            <View className="flex-row items-center flex-1 mr-2">
                              <SafeProductImage uri={item.imageUrl} />
                              <View className="flex-1">
                                <Text className="text-sm font-black text-slate-900" numberOfLines={1}>
                                  {item.name}
                                </Text>
                                <Text className="text-[10px] text-slate-500">
                                  {item.category || "General"} • {item.unit || "PCS"}
                                </Text>
                              </View>
                            </View>

                            <View className="items-end">
                              <Text className={`text-xs font-black ${(item.stock || 0) <= (item.lowStockThreshold || 5) ? "text-red-600" : "text-emerald-700"}`}>
                                {item.stock || 0} {item.unit || "PCS"}
                              </Text>
                              <Text className="text-[9px] text-slate-400">
                                {(item.stock || 0) <= (item.lowStockThreshold || 5) ? "⚠️ Low Stock" : "In Stock"}
                              </Text>
                            </View>
                          </View>

                          {/* Price & Recipe Info */}
                          <View className="flex-row items-center justify-between py-1.5 border-t border-slate-100 flex-wrap gap-1">
                            <Text className="text-xs font-extrabold text-blue-900">
                              Sell: Rs. {item.sellingPrice || 0} {item.costPrice > 0 ? `• Cost: Rs. ${item.costPrice}` : ""}
                            </Text>
                            {item.recipe && item.recipe.length > 0 ? (
                              <View className="bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                                <Text className="text-[9.5px] font-black text-blue-700">
                                  🍳 {item.recipe.length} Ingredients
                                </Text>
                              </View>
                            ) : null}
                          </View>

                          {/* Daily Selling & Sells Today Count */}
                          <TouchableOpacity
                            activeOpacity={0.75}
                            onPress={() => handleOpenItemStats(item)}
                            className="mt-2 pt-1.5 flex-row items-center justify-between"
                          >
                            <View className={`flex-row items-center px-2 py-1 rounded-xl flex-1 mr-2 ${todaySoldQty > 0
                                ? "bg-emerald-50 border border-emerald-300"
                                : "bg-blue-50/60 border border-blue-200"
                              }`}>
                              <Ionicons name={todaySoldQty > 0 ? "flame" : "calendar-outline"} size={13} color={todaySoldQty > 0 ? "#059669" : "#2563EB"} />
                              <Text className={`text-[11px] font-black ml-1.5 flex-1 ${todaySoldQty > 0 ? "text-emerald-800" : "text-blue-900"}`} numberOfLines={1}>
                                Sold Today: <Text className="font-black text-xs">{todaySoldQty} {item.unit || "PCS"}</Text>
                                {todaySoldRev > 0 ? ` (Rs. ${todaySoldRev})` : ""}
                              </Text>
                            </View>

                            <View className="flex-row items-center">
                              <Text className="text-[10px] text-blue-600 font-bold">
                                {totalSoldQty > 0 ? `Total: ${totalSoldQty}` : "Daily Stats"}
                              </Text>
                              <Ionicons name="chevron-forward" size={11} color="#2563EB" style={{ marginLeft: 2 }} />
                            </View>
                          </TouchableOpacity>

                          {/* Channel Toggles (Dine-in vs Online Delivery) */}
                          {activeTab === "menu" && (
                            <View className="flex-row items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                              <TouchableOpacity
                                onPress={() => handleToggleChannel(item, "dineIn")}
                                className={`flex-1 py-1.5 px-2 rounded-xl border flex-row items-center justify-center ${item.isDineInAvailable !== false ? "bg-emerald-50 border-emerald-300" : "bg-slate-100 border-slate-200 opacity-60"
                                  }`}
                              >
                                <Ionicons name="restaurant-outline" size={13} color={item.isDineInAvailable !== false ? "#059669" : "#64748B"} />
                                <Text className={`text-[10px] font-black ml-1.5 ${item.isDineInAvailable !== false ? "text-emerald-800" : "text-slate-600"}`}>
                                  Dine-in: {item.isDineInAvailable !== false ? "ON" : "OFF"}
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                onPress={() => handleToggleChannel(item, "online")}
                                className={`flex-1 py-1.5 px-2 rounded-xl border flex-row items-center justify-center ${item.isOnlineAvailable !== false ? "bg-orange-50 border-orange-300" : "bg-slate-100 border-slate-200 opacity-60"
                                  }`}
                              >
                                <Ionicons name="bicycle-outline" size={13} color={item.isOnlineAvailable !== false ? "#EA580C" : "#64748B"} />
                                <Text className={`text-[10px] font-black ml-1.5 ${item.isOnlineAvailable !== false ? "text-orange-800" : "text-slate-600"}`}>
                                  Online: {item.isOnlineAvailable !== false ? "ON" : "OFF"}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>

                        {/* Card Action Buttons */}
                        <View className="flex-row items-center gap-2 mt-2.5 pt-2 border-t border-slate-100">
                          {item.itemType !== "RAW_MATERIAL" && (
                            <TouchableOpacity
                              onPress={() => handleOpenRecipeModal(item)}
                              className="flex-1 bg-blue-600 py-2 rounded-xl flex-row items-center justify-center shadow-xs"
                            >
                              <Ionicons name="list-circle-outline" size={14} color="#FFFFFF" />
                              <Text className="text-white text-xs font-black ml-1">
                                {item.recipe?.length > 0 ? "Edit Recipe" : "+ Add Recipe"}
                              </Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            onPress={() => handleOpenEdit(item)}
                            className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200"
                          >
                            <Ionicons name="pencil" size={14} color="#2563EB" />
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleDeleteItem(item)}
                            className="px-3 py-2 rounded-xl bg-red-50 border border-red-200"
                          >
                            <Ionicons name="trash" size={14} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* SUB-TAB 3: CENTRAL KITCHEN & STOCK TRANSFERS                   */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "transfers" && (
            <View>
              <View className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs mb-3 flex-row items-center justify-between">
                <View>
                  <Text className="text-xs font-black text-slate-800 uppercase tracking-wide">
                    Central Kitchen Transfer Log ({transfers.length})
                  </Text>
                  <Text className="text-[10px] text-slate-400">
                    Indents, dispatches & damaged stock returns
                  </Text>
                </View>
                <TouchableOpacity onPress={loadTransfers} className="p-1">
                  <Ionicons name="refresh" size={16} color="#64748B" />
                </TouchableOpacity>
              </View>

              {transfers.length === 0 ? (
                <View className="py-14 items-center">
                  <Ionicons name="git-network-outline" size={44} color="#CBD5E1" />
                  <Text className="text-xs text-slate-400 mt-2 font-medium">No transfers recorded yet</Text>
                  <TouchableOpacity onPress={() => handleOpenTransferModal("INDENT_REQUEST")} className="mt-3 bg-blue-600 px-4 py-2 rounded-xl">
                    <Text className="text-white text-xs font-black">+ Raise First Indent Request</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                transfers.map((trf) => (
                  <View key={trf._id} className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs mb-3">
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center">
                        <View
                          className={`px-2 py-0.5 rounded-md mr-2 ${trf.type === "DAMAGED_RETURN" ? "bg-red-100" : trf.type === "SUPPLY_DISPATCH" ? "bg-emerald-100" : "bg-blue-100"
                            }`}
                        >
                          <Text
                            className={`text-[9.5px] font-black ${trf.type === "DAMAGED_RETURN" ? "text-red-800" : trf.type === "SUPPLY_DISPATCH" ? "text-emerald-800" : "text-blue-800"
                              }`}
                          >
                            {trf.type}
                          </Text>
                        </View>
                        <Text className="text-xs font-black text-slate-900">#{trf.transferNumber}</Text>
                      </View>

                      <View
                        className={`px-2 py-0.5 rounded-full border ${trf.status === "RECEIVED" ? "bg-emerald-50 border-emerald-300" : trf.status === "DISPATCHED" ? "bg-blue-50 border-blue-300" : "bg-slate-100 border-slate-300"
                          }`}
                      >
                        <Text className="text-[10px] font-black text-slate-700">{trf.status}</Text>
                      </View>
                    </View>

                    <Text className="text-xs text-slate-700 font-semibold mb-2">
                      📍 {trf.sourceName} ➔ {trf.destinationName}
                    </Text>

                    <View className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-2.5">
                      {(trf.items || []).map((it, idx) => (
                        <Text key={idx} className="text-xs text-slate-800 py-0.5">
                          • <Text className="font-bold">{it.name}</Text>: {it.quantity} {it.unit} {it.reason ? `(Reason: ${it.reason})` : ""}
                        </Text>
                      ))}
                    </View>

                    {trf.status !== "RECEIVED" && (
                      <View className="flex-row gap-2 pt-2 border-t border-slate-100">
                        {trf.status === "PENDING" && (
                          <TouchableOpacity
                            onPress={() => handleUpdateTransferStatus(trf._id, "DISPATCHED")}
                            className="flex-1 bg-blue-600 py-2 rounded-xl items-center"
                          >
                            <Text className="text-white text-xs font-black">Dispatch from Kitchen</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={() => handleUpdateTransferStatus(trf._id, "RECEIVED")}
                          className="flex-1 bg-emerald-600 py-2 rounded-xl items-center shadow-xs"
                        >
                          <Text className="text-white text-xs font-black">Mark Received (+ Add Stock)</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* SUB-TAB 4: PURCHASE ORDER (PO) MANAGEMENT                     */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "po" && (
            <View>
              {frequentItems.length > 0 && (
                <View className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs mb-3">
                  <Text className="text-xs font-black text-slate-800 uppercase tracking-wide mb-2">
                    Frequently Ordered Items
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                    {frequentItems.map((fi, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => handleOpenPoModal({ _id: fi.itemId, name: fi.itemName, unit: fi.unit, costPrice: fi.lastUnitPrice })}
                        className="bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl mr-2 items-center"
                      >
                        <Text className="text-xs font-bold text-blue-950">{fi.itemName}</Text>
                        <Text className="text-[10px] text-blue-700 mt-0.5">
                          {fi.supplierName} • {fi.orderCount} orders
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs mb-3 flex-row items-center justify-between">
                <Text className="text-xs font-black text-slate-800 uppercase tracking-wide">
                  Purchase Orders ({purchaseOrders.length})
                </Text>
                <TouchableOpacity onPress={loadPurchaseOrders} className="p-1">
                  <Ionicons name="refresh" size={16} color="#64748B" />
                </TouchableOpacity>
              </View>

              {purchaseOrders.length === 0 ? (
                <View className="py-14 items-center">
                  <Ionicons name="receipt-outline" size={44} color="#CBD5E1" />
                  <Text className="text-xs text-slate-400 mt-2 font-medium">No purchase orders created</Text>
                  <TouchableOpacity onPress={() => handleOpenPoModal()} className="mt-3 bg-blue-600 px-4 py-2 rounded-xl">
                    <Text className="text-white text-xs font-black">+ Create New PO Ticket</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                purchaseOrders.map((po) => (
                  <View key={po._id} className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs mb-3">
                    <View className="flex-row items-center justify-between mb-2">
                      <View>
                        <Text className="text-xs font-black text-slate-900">PO #{po.poNumber}</Text>
                        <Text className="text-[10px] text-slate-500">
                          Supplier: <Text className="font-bold text-slate-800">{po.supplierName}</Text> {po.supplierPhone ? `(${po.supplierPhone})` : ""}
                        </Text>
                      </View>
                      <View
                        className={`px-2 py-0.5 rounded-full border ${po.status === "RECEIVED" ? "bg-emerald-50 border-emerald-300" : po.status === "RAISED" ? "bg-blue-50 border-blue-300" : "bg-slate-100 border-slate-300"
                          }`}
                      >
                        <Text className="text-[10px] font-black text-slate-700">{po.status}</Text>
                      </View>
                    </View>

                    <View className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-2">
                      {(po.items || []).map((it, idx) => (
                        <View key={idx} className="flex-row justify-between py-0.5">
                          <Text className="text-xs text-slate-800">
                            • {it.name} (x{it.quantity} {it.unit})
                          </Text>
                          <Text className="text-xs font-bold text-slate-900">
                            Rs. {it.total || it.quantity * it.unitPrice}
                          </Text>
                        </View>
                      ))}
                    </View>

                    <View className="flex-row justify-between items-center py-1">
                      <Text className="text-xs font-bold text-slate-600">Grand Total:</Text>
                      <Text className="text-sm font-black text-emerald-800">Rs. {po.grandTotal}</Text>
                    </View>

                    {po.status !== "RECEIVED" && (
                      <View className="flex-row gap-2 pt-2 border-t border-slate-100 mt-2">
                        <TouchableOpacity
                          onPress={() => handleUpdatePoStatus(po._id, "RECEIVED")}
                          className="flex-1 bg-emerald-600 py-2 rounded-xl items-center shadow-xs"
                        >
                          <Text className="text-white text-xs font-black">1-Click Receive (+ Increase Stock)</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
          )}
        </ResponsiveContainer>
      </ScrollView>

      {/* Floating Action Button (FAB) for quick add on mobile */}
      {!isWide && (
        <TouchableOpacity
          onPress={handleOpenAdd}
          activeOpacity={0.85}
          style={{
            position: "absolute",
            bottom: 24,
            right: 20,
            zIndex: 99,
            elevation: 8,
            shadowColor: "#2563EB",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.35,
            shadowRadius: 6,
          }}
          className="bg-blue-600 px-4 py-3 rounded-full flex-row items-center"
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text className="text-white text-xs font-black ml-1">Add Item</Text>
        </TouchableOpacity>
      )}

      {/* ── Modal 1: Add / Edit Item Modal ── */}
      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View className="flex-1 bg-black/50 justify-end sm:justify-center items-center p-0 sm:p-4">
            <View className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[90%] shadow-2xl">
              <View className="flex-row justify-between items-center mb-3 pb-2 border-b border-slate-100">
                <Text className="text-base font-black text-slate-900">{editingItem ? "Edit Item" : "New Inventory Item"}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)} className="p-1">
                  <Ionicons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                {/* Item Classification Type */}
                <Text className="text-xs font-black text-slate-700 mb-1.5 uppercase">Item Type Classification</Text>
                <View className="flex-row gap-1.5 mb-3">
                  {[
                    { id: "FINISHED_GOOD", label: "Dish / Menu" },
                    { id: "RAW_MATERIAL", label: "Raw Ingredient" },
                    { id: "SEMI_FINISHED", label: "Prep / Gravy" },
                  ].map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() => setFormItemType(t.id)}
                      className={`flex-1 py-1.5 rounded-xl items-center border ${formItemType === t.id ? "bg-blue-600 border-blue-600 shadow-xs" : "bg-slate-100 border-slate-200"
                        }`}
                    >
                      <Text className={`text-[11px] font-bold ${formItemType === t.id ? "text-white" : "text-slate-700"}`}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View className="mb-3">
                  <Text className="text-xs font-bold text-slate-700 mb-1">Item / Ingredient Name</Text>
                  <TextInput
                    className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold"
                    placeholder="e.g. Paneer Butter Masala, Dairy Milk, Cooking Oil"
                    value={formName}
                    onChangeText={setFormName}
                  />
                </View>

                <View className="flex-row gap-2 mb-3">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-700 mb-1">Selling Price (Rs)</Text>
                    <TextInput
                      className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold"
                      placeholder="0"
                      keyboardType="numeric"
                      value={formSellingPrice}
                      onChangeText={setFormSellingPrice}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-700 mb-1">Cost Price (Rs)</Text>
                    <TextInput
                      className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
                      placeholder="0"
                      keyboardType="numeric"
                      value={formCostPrice}
                      onChangeText={setFormCostPrice}
                    />
                  </View>
                </View>

                <View className="flex-row gap-2 mb-3">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-700 mb-1">Current Stock</Text>
                    <TextInput
                      className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold"
                      placeholder="0"
                      keyboardType="numeric"
                      value={formStock}
                      onChangeText={setFormStock}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-slate-700 mb-1">Low Stock Alert Level</Text>
                    <TextInput
                      className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900"
                      placeholder="5"
                      keyboardType="numeric"
                      value={formLowStockThreshold}
                      onChangeText={setFormLowStockThreshold}
                    />
                  </View>
                </View>

                {/* Measuring Unit */}
                <View className="mb-3">
                  <Text className="text-xs font-bold text-slate-700 mb-1.5">Measuring Unit</Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {["PCS", "KG", "GM", "LTR", "ML", "PACK", "BOX", "PORTION"].map((u) => (
                      <TouchableOpacity
                        key={u}
                        onPress={() => setFormUnit(u)}
                        className={`py-1.5 px-2.5 rounded-lg border ${formUnit === u ? "bg-blue-600 border-blue-600" : "bg-slate-100 border-slate-300"
                          }`}
                      >
                        <Text className={`text-xs font-bold ${formUnit === u ? "text-white" : "text-slate-700"}`}>
                          {u}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Channel Availability Switches */}
                <View className="bg-slate-50 p-3 rounded-2xl border border-slate-200 mb-4">
                  <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-xs font-bold text-slate-800">Available for Dine-in</Text>
                    <Switch value={formDineInAvailable} onValueChange={setFormDineInAvailable} trackColor={{ false: "#CBD5E1", true: "#93C5FD" }} thumbColor={formDineInAvailable ? "#2563EB" : "#94A3B8"} />
                  </View>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-xs font-bold text-slate-800">Available for Online Orders (Swiggy/Zomato)</Text>
                    <Switch value={formOnlineAvailable} onValueChange={setFormOnlineAvailable} trackColor={{ false: "#CBD5E1", true: "#FDBA74" }} thumbColor={formOnlineAvailable ? "#EA580C" : "#94A3B8"} />
                  </View>
                </View>

                <TouchableOpacity onPress={handleSaveItem} className="w-full bg-blue-600 py-3 rounded-xl items-center shadow-xs">
                  <Text className="text-white font-black text-sm">{editingItem ? "Update Item" : "Save Item"}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal 2: Multi-Stage Recipe (BOM) Builder Modal ── */}
      <Modal visible={recipeModalVisible} animationType="slide" transparent={true} onRequestClose={() => setRecipeModalVisible(false)}>
        <View className="flex-1 bg-black/60 justify-center items-center p-3">
          <View style={{ width: "100%", maxWidth: 640, maxHeight: "90%" }} className="bg-white rounded-3xl p-5 shadow-2xl flex-1">
            <View className="flex-row justify-between items-center pb-3 border-b border-slate-100">
              <View>
                <Text className="text-base font-black text-slate-900">
                  Recipe for {selectedDishForRecipe?.name}
                </Text>
                <Text className="text-[10px] text-slate-500">
                  POS auto-deducts these raw materials on billing
                </Text>
              </View>
              <TouchableOpacity onPress={() => setRecipeModalVisible(false)} className="p-1">
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 py-3" showsVerticalScrollIndicator={false}>
              <View className="flex-row items-center justify-between bg-blue-50 p-3 rounded-2xl border border-blue-200 mb-3">
                <View className="flex-1 mr-2">
                  <Text className="text-xs font-black text-blue-900">Auto-Deduct Stock on Billing</Text>
                  <Text className="text-[10px] text-blue-700">Deduct raw materials automatically when this dish is sold</Text>
                </View>
                <Switch value={autoDeductRecipe} onValueChange={setAutoDeductRecipe} trackColor={{ false: "#CBD5E1", true: "#93C5FD" }} thumbColor={autoDeductRecipe ? "#2563EB" : "#94A3B8"} />
              </View>

              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs font-black text-slate-800 uppercase">Recipe Ingredients ({recipeIngredients.length})</Text>
                <TouchableOpacity onPress={handleAddRecipeIngredient} className="bg-blue-600 px-2.5 py-1 rounded-lg flex-row items-center">
                  <Ionicons name="add" size={13} color="#FFFFFF" />
                  <Text className="text-white text-[11px] font-black ml-1">+ Ingredient</Text>
                </TouchableOpacity>
              </View>

              {recipeIngredients.length === 0 ? (
                <View className="py-8 items-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Text className="text-xs text-slate-400">No ingredients attached yet</Text>
                  <Text className="text-[10px] text-slate-400 mt-1">Tap '+ Ingredient' above to attach raw materials</Text>
                </View>
              ) : (
                recipeIngredients.map((ing, idx) => (
                  <View key={idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 mb-2 flex-row items-center gap-2">
                    <View className="flex-1">
                      <Text className="text-xs font-black text-slate-900">{ing.rawMaterialName}</Text>
                      <Text className="text-[10px] text-slate-500">Stage: {ing.stage || "COOKING"}</Text>
                    </View>

                    <TextInput
                      className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-bold w-16 text-center"
                      keyboardType="numeric"
                      value={String(ing.quantity || 100)}
                      onChangeText={(val) => {
                        const num = Number(val) || 0;
                        setRecipeIngredients((prev) => prev.map((item, i) => (i === idx ? { ...item, quantity: num } : item)));
                      }}
                    />

                    <Text className="text-xs font-bold text-slate-600 w-8">{ing.unit || "GM"}</Text>

                    <TouchableOpacity
                      onPress={() => setRecipeIngredients((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1"
                    >
                      <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity
              onPress={handleSaveRecipe}
              disabled={savingRecipe}
              className="w-full bg-blue-600 py-3 rounded-xl items-center shadow-xs flex-row justify-center"
            >
              {savingRecipe ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-white text-xs font-black">Save Dish Recipe (BOM)</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal 3: Central Kitchen Transfer Modal ── */}
      <Modal visible={transferModalVisible} animationType="slide" transparent={true} onRequestClose={() => setTransferModalVisible(false)}>
        <View className="flex-1 bg-black/60 justify-center items-center p-3">
          <View style={{ width: "100%", maxWidth: 640, maxHeight: "90%" }} className="bg-white rounded-3xl p-5 shadow-2xl flex-1">
            <View className="flex-row justify-between items-center pb-3 border-b border-slate-100">
              <Text className="text-base font-black text-slate-900">
                {transferType === "DAMAGED_RETURN" ? "Return Damaged Stock" : transferType === "SUPPLY_DISPATCH" ? "Supply Dispatch to Outlet" : "Indent Request to Kitchen"}
              </Text>
              <TouchableOpacity onPress={() => setTransferModalVisible(false)} className="p-1">
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 py-3" showsVerticalScrollIndicator={false}>
              <View className="flex-row gap-2 mb-3">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-slate-700 mb-1">From (Source)</Text>
                  <TextInput className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs" value={transferSource} onChangeText={setTransferSource} />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-slate-700 mb-1">To (Destination)</Text>
                  <TextInput className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs" value={transferDest} onChangeText={setTransferDest} />
                </View>
              </View>

              <Text className="text-xs font-black text-slate-800 mb-1.5 uppercase">Transfer Items</Text>
              {transferItems.map((it, idx) => (
                <View key={idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 mb-2">
                  <Text className="text-xs font-black text-slate-900 mb-1">{it.name}</Text>
                  <View className="flex-row gap-2">
                    <TextInput
                      className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs"
                      placeholder="Quantity"
                      keyboardType="numeric"
                      value={String(it.quantity || "")}
                      onChangeText={(val) => {
                        const num = Number(val) || 0;
                        setTransferItems((prev) => prev.map((item, i) => (i === idx ? { ...item, quantity: num } : item)));
                      }}
                    />
                    {transferType === "DAMAGED_RETURN" && (
                      <TextInput
                        className="flex-2 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs"
                        placeholder="Damage reason (e.g. Expired, Leak)"
                        value={it.reason || ""}
                        onChangeText={(val) => {
                          setTransferItems((prev) => prev.map((item, i) => (i === idx ? { ...item, reason: val } : item)));
                        }}
                      />
                    )}
                  </View>
                </View>
              ))}

              <View className="mt-3">
                <Text className="text-xs font-bold text-slate-700 mb-1">Transfer Notes (Optional)</Text>
                <TextInput className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs" placeholder="Urgent weekend restock notes..." value={transferNotes} onChangeText={setTransferNotes} />
              </View>
            </ScrollView>

            <TouchableOpacity onPress={handleSaveTransfer} disabled={savingTransfer} className="w-full bg-blue-600 py-3 rounded-xl items-center shadow-xs">
              {savingTransfer ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text className="text-white text-xs font-black">Submit Transfer Request</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal 4: Purchase Order (PO) Modal ── */}
      <Modal visible={poModalVisible} animationType="slide" transparent={true} onRequestClose={() => setPoModalVisible(false)}>
        <View className="flex-1 bg-black/60 justify-center items-center p-3">
          <View style={{ width: "100%", maxWidth: 640, maxHeight: "90%" }} className="bg-white rounded-3xl p-5 shadow-2xl flex-1">
            <View className="flex-row justify-between items-center pb-3 border-b border-slate-100">
              <Text className="text-base font-black text-slate-900">Raise New Purchase Order (PO)</Text>
              <TouchableOpacity onPress={() => setPoModalVisible(false)} className="p-1">
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 py-3" showsVerticalScrollIndicator={false}>
              <View className="flex-row gap-2 mb-3">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-slate-700 mb-1">Supplier / Kitchen Name</Text>
                  <TextInput className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs" placeholder="e.g. Metro Cash & Carry, Central Hub" value={poSupplierName} onChangeText={setPoSupplierName} />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-slate-700 mb-1">Phone Number</Text>
                  <TextInput className="bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs" placeholder="e.g. 9876543210" keyboardType="phone-pad" value={poSupplierPhone} onChangeText={setPoSupplierPhone} />
                </View>
              </View>

              <Text className="text-xs font-black text-slate-800 mb-1.5 uppercase">Order Items</Text>
              {poItems.map((it, idx) => (
                <View key={idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 mb-2">
                  <Text className="text-xs font-black text-slate-900 mb-1">{it.name}</Text>
                  <View className="flex-row gap-2">
                    <TextInput
                      className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs"
                      placeholder="Qty"
                      keyboardType="numeric"
                      value={String(it.quantity || "")}
                      onChangeText={(val) => {
                        const num = Number(val) || 0;
                        setPoItems((prev) => prev.map((item, i) => (i === idx ? { ...item, quantity: num } : item)));
                      }}
                    />
                    <TextInput
                      className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs"
                      placeholder="Rate / Unit"
                      keyboardType="numeric"
                      value={String(it.unitPrice || "")}
                      onChangeText={(val) => {
                        const num = Number(val) || 0;
                        setPoItems((prev) => prev.map((item, i) => (i === idx ? { ...item, unitPrice: num } : item)));
                      }}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity onPress={handleSavePo} disabled={savingPo} className="w-full bg-blue-600 py-3 rounded-xl items-center shadow-xs">
              {savingPo ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text className="text-white text-xs font-black">Raise Official PO</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal 5: Item Sales & Daily Selling Analytics Modal ── */}
      <Modal
        visible={statsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setStatsModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end sm:justify-center items-center p-0 sm:p-4">
          <TouchableWithoutFeedback onPress={() => setStatsModalVisible(false)}>
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
          </TouchableWithoutFeedback>

          <View className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-6 max-h-[88%] shadow-2xl">
            {/* Header */}
            <View className="flex-row justify-between items-start pb-3 border-b border-gray-200 mb-4">
              <View className="flex-row items-center flex-1 pr-3">
                <SafeProductImage uri={selectedStatsItem?.imageUrl} />
                <View className="flex-1 ml-2">
                  <Text className="text-lg font-black text-gray-900 leading-snug">
                    {selectedStatsItem?.name || "Item Details"}
                  </Text>
                  <View className="flex-row items-center gap-2 mt-0.5">
                    <Text className="text-xs font-semibold text-blue-700">
                      {selectedStatsItem?.category || "General"}
                    </Text>
                    {selectedStatsItem?.barcode ? (
                      <Text className="text-[11px] text-gray-500">
                        SKU: {selectedStatsItem.barcode}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setStatsModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                className="p-1"
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {statsLoading && !itemStatsData?.stats?.totalSoldQuantity ? (
                <View className="py-8 items-center justify-center">
                  <ActivityIndicator size="large" color="#2563EB" />
                  <Text className="text-xs font-bold text-gray-500 mt-2">
                    Calculating sales analytics...
                  </Text>
                </View>
              ) : null}

              {/* Daily Selling (Today & Yesterday) Highlight Card */}
              <View style={{ backgroundColor: "#2563EB" }} className="rounded-2xl p-4 mb-3 shadow-sm">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center">
                    <Ionicons name="calendar" size={17} color="#FFFFFF" />
                    <Text className="text-white text-xs font-black uppercase tracking-wider ml-1.5">
                      Today's Daily Selling
                    </Text>
                  </View>
                  <View className="bg-white/20 px-2 py-0.5 rounded-full">
                    <Text className="text-white text-[10px] font-bold">Today (IST)</Text>
                  </View>
                </View>

                <View className="flex-row items-center justify-between bg-white/10 rounded-xl p-3 mb-2">
                  <View>
                    <Text className="text-blue-100 text-[11px] font-medium">Quantity Sold Today</Text>
                    <Text className="text-white text-2xl font-black">
                      {itemStatsData?.stats?.todaySoldQuantity || 0}{" "}
                      <Text className="text-xs font-bold text-blue-200">
                        {selectedStatsItem?.unit || "PCS"}
                      </Text>
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-blue-100 text-[11px] font-medium">Today's Revenue</Text>
                    <Text className="text-emerald-300 text-2xl font-black">
                      ₹{itemStatsData?.stats?.todayRevenue || 0}
                    </Text>
                  </View>
                </View>

                <View className="flex-row justify-between items-center px-1">
                  <Text className="text-blue-100 text-xs font-semibold">
                    Yesterday: {itemStatsData?.stats?.yesterdaySoldQuantity || 0} {selectedStatsItem?.unit || "PCS"} sold
                  </Text>
                  <Text className="text-blue-100 text-xs font-bold">
                    ₹{itemStatsData?.stats?.yesterdayRevenue || 0}
                  </Text>
                </View>
              </View>

              {/* 7-Day Daily Selling History */}
              {Array.isArray(itemStatsData?.stats?.dailyBreakdown) && itemStatsData.stats.dailyBreakdown.length > 0 ? (
                <View className="bg-white rounded-2xl p-3.5 border border-gray-200 mb-3 shadow-xs">
                  <Text className="text-xs font-extrabold text-gray-800 uppercase tracking-wider mb-2">
                    Recent Daily Breakdown
                  </Text>
                  {itemStatsData.stats.dailyBreakdown.map((day, idx) => (
                    <View
                      key={day.date}
                      className={`flex-row justify-between items-center py-2 ${idx < itemStatsData.stats.dailyBreakdown.length - 1 ? "border-b border-gray-100" : ""
                        }`}
                    >
                      <View className="flex-row items-center">
                        <Ionicons name="time-outline" size={14} color="#6B7280" />
                        <Text className="text-xs font-bold text-gray-800 ml-1.5">{day.date}</Text>
                      </View>
                      <Text className="text-xs font-bold text-blue-700">
                        {day.soldQuantity} {selectedStatsItem?.unit || "PCS"}
                      </Text>
                      <Text className="text-xs font-extrabold text-emerald-700">
                        ₹{day.revenue}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* 4 Key Performance Metrics Cards */}
              <View className="flex-row gap-2.5 mb-2.5">
                <View className="flex-1 bg-blue-50 border border-blue-200 rounded-2xl p-3.5">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-[11px] font-bold text-blue-700 uppercase tracking-wide">
                      Total Sold
                    </Text>
                    <Ionicons name="trending-up" size={16} color="#2563EB" />
                  </View>
                  <Text className="text-xl font-black text-blue-900">
                    {itemStatsData?.stats?.totalSoldQuantity || 0}
                  </Text>
                  <Text className="text-[10px] text-blue-600 font-semibold mt-0.5">
                    {selectedStatsItem?.unit || "PCS"} volume sold
                  </Text>
                </View>

                <View className="flex-1 bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
                      Sales Revenue
                    </Text>
                    <Ionicons name="cash-outline" size={16} color="#059669" />
                  </View>
                  <Text className="text-xl font-black text-emerald-900">
                    ₹{itemStatsData?.stats?.totalRevenue || 0}
                  </Text>
                  <Text className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                    Gross revenue earned
                  </Text>
                </View>
              </View>

              <View className="flex-row gap-2.5 mb-4">
                <View className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                      Times Invoiced
                    </Text>
                    <Ionicons name="receipt-outline" size={16} color="#0F172A" />
                  </View>
                  <Text className="text-xl font-black text-slate-900">
                    {itemStatsData?.stats?.invoiceCount || 0}
                  </Text>
                  <Text className="text-[10px] text-slate-500 font-semibold mt-0.5">
                    Bills created with this item
                  </Text>
                </View>

                <View className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl p-3.5">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">
                      Stock Left
                    </Text>
                    <Ionicons name="cube-outline" size={16} color="#4B5563" />
                  </View>
                  <Text
                    className={`text-xl font-black ${(selectedStatsItem?.stock || 0) <= (selectedStatsItem?.lowStockThreshold || 5) ? "text-red-600" : "text-gray-900"}`}
                  >
                    {selectedStatsItem?.stock || 0}
                  </Text>
                  <Text className="text-[10px] text-gray-500 font-semibold mt-0.5">
                    {selectedStatsItem?.unit || "PCS"} available now
                  </Text>
                </View>
              </View>

              {/* Pricing & Margin Detail Sheet */}
              <View className="bg-gray-50 rounded-2xl p-4 border border-gray-200 mb-4">
                <Text className="text-xs font-extrabold text-gray-800 uppercase tracking-wider mb-2.5">
                  Pricing & Margins
                </Text>

                <View className="flex-row justify-between py-1.5 border-b border-gray-200">
                  <Text className="text-xs text-gray-600">Selling Price</Text>
                  <Text className="text-xs font-bold text-gray-900">₹{selectedStatsItem?.sellingPrice || 0}</Text>
                </View>

                <View className="flex-row justify-between py-1.5 border-b border-gray-200">
                  <Text className="text-xs text-gray-600">Cost / Purchase Price</Text>
                  <Text className="text-xs font-bold text-gray-700">₹{selectedStatsItem?.costPrice || selectedStatsItem?.purchasePrice || 0}</Text>
                </View>

                <View className="flex-row justify-between py-1.5 border-b border-gray-200">
                  <Text className="text-xs text-gray-600">Gross Margin per Unit</Text>
                  <Text className="text-xs font-extrabold text-emerald-700">
                    ₹{Math.max(0, (selectedStatsItem?.sellingPrice || 0) - (selectedStatsItem?.costPrice || selectedStatsItem?.purchasePrice || 0))}
                  </Text>
                </View>

                <View className="flex-row justify-between py-1.5 border-b border-gray-200">
                  <Text className="text-xs text-gray-600">GST / Tax Rate</Text>
                  <Text className="text-xs font-bold text-gray-700">{selectedStatsItem?.taxRate || 0}%</Text>
                </View>

                {itemStatsData?.stats?.totalParcelQuantity > 0 ? (
                  <View className="flex-row justify-between py-1.5 border-b border-gray-200">
                    <Text className="text-xs text-gray-600">
                      {businessType === "salon" ? "Retail Takeaway Sales" : "Parcel Volume"}
                    </Text>
                    <Text className="text-xs font-bold text-gray-800">
                      {itemStatsData.stats.totalParcelQuantity} {selectedStatsItem?.unit || "PCS"}
                    </Text>
                  </View>
                ) : null}

                {itemStatsData?.stats?.lastSoldAt ? (
                  <View className="flex-row justify-between py-1.5">
                    <Text className="text-xs text-gray-600">Last Sold On</Text>
                    <Text className="text-xs font-semibold text-gray-800">
                      {new Date(itemStatsData.stats.lastSoldAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Quick Actions */}
              <View className="flex-row gap-2.5 mb-2">
                <TouchableOpacity
                  onPress={() => {
                    const itemToEdit = selectedStatsItem;
                    setStatsModalVisible(false);
                    setTimeout(() => handleOpenEdit(itemToEdit), 250);
                  }}
                  className="flex-1 bg-blue-600 py-3 rounded-xl flex-row items-center justify-center shadow-xs"
                >
                  <Ionicons name="pencil" size={15} color="#FFFFFF" />
                  <Text className="text-white font-extrabold text-xs ml-1.5">Edit Item Details</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setStatsModalVisible(false)}
                  className="flex-1 bg-gray-100 py-3 rounded-xl items-center justify-center border border-gray-200"
                >
                  <Text className="text-gray-800 font-extrabold text-xs">Close</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
