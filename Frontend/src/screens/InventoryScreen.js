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
  const [items, setItems] = useState(() => getMemoryCachedData("items_all") || []);
  const [salesSummary, setSalesSummary] = useState({ byItemId: {}, byName: {} });
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
  const [categories, setCategories] = useState(() => getMemoryCachedData("items_categories") || ["General"]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [pendingItemOps, setPendingItemOps] = useState([]);
  const [syncingOfflineItems, setSyncingOfflineItems] = useState(false);

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

  const sortItemsNaturally = (list) => {
    if (!Array.isArray(list)) return [];
    return [...list].sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
  };

  const loadCategories = useCallback(async () => {
    try {
      const cached = await getCachedData("items_categories");
      if (Array.isArray(cached) && cached.length > 0) {
        setCategories(cached);
      }
      const res = await api.items.getCategories();
      if (res && res.success && Array.isArray(res.categories) && res.categories.length > 0) {
        setCategories(res.categories);
        setCachedData("items_categories", res.categories);
      }
    } catch { }
  }, []);

  const filterItemsLocally = (list) => {
    let filtered = Array.isArray(list) ? list : [];
    if (selectedCategory && selectedCategory !== "All") {
      filtered = filtered.filter((it) => (it.category || "General") === selectedCategory);
    }
    if (filterLowStock) {
      filtered = filtered.filter((it) => Number(it.stock ?? 0) <= Number(it.lowStockAlert ?? 5));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (it) =>
          String(it.name || "").toLowerCase().includes(q) ||
          String(it.barcode || "").toLowerCase().includes(q)
      );
    }
    return sortItemsNaturally(filtered);
  };

  const loadItems = useCallback(async () => {
    const isUnfiltered = !search && !filterLowStock && (!selectedCategory || selectedCategory === "All");
    try {
      const cached = await getCachedData("items_all");
      const hasCached = Array.isArray(cached) && cached.length > 0;
      if (hasCached) {
        setItems(isUnfiltered ? cached : filterItemsLocally(cached));
      } else {
        setLoading(true);
      }

      let queryParts = [];
      if (search) queryParts.push(`search=${encodeURIComponent(search)}`);
      if (filterLowStock) queryParts.push("lowStock=true");
      if (selectedCategory && selectedCategory !== "All") {
        queryParts.push(`category=${encodeURIComponent(selectedCategory)}`);
      }
      const query = queryParts.join("&");
      const res = await api.items.getAll(query);
      if (res && res.success && Array.isArray(res.items)) {
        const merged = isUnfiltered ? await applyOfflineItemOpsToList(res.items) : res.items;
        const sorted = sortItemsNaturally(merged);
        setItems(sorted);
        if (isUnfiltered) {
          setCachedData("items_all", sorted);
        }
      } else if (!hasCached) {
        setItems([]);
      }

      // Fetch live sales summary in background for instant sales badges & analytics
      api.items
        .getSalesSummary()
        .then((sRes) => {
          if (sRes && sRes.success) {
            setSalesSummary({
              byItemId: sRes.byItemId || {},
              byName: sRes.byName || {},
            });
          }
        })
        .catch(() => {});
    } catch {
      const cached = await getCachedData("items_all");
      if (Array.isArray(cached)) {
        setItems(isUnfiltered ? cached : filterItemsLocally(cached));
      } else if (!isUnfiltered) {
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, [search, filterLowStock, selectedCategory]);

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

  const handleSyncOfflineItemsNow = async () => {
    if (syncingOfflineItems) return;
    setSyncingOfflineItems(true);
    try {
      const result = await syncAllOfflineData(api);
      if (result.itemsSynced > 0) {
        await loadCategories();
        await loadItems();
      }
    } finally {
      setSyncingOfflineItems(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      loadCategories();
      loadItems();
    }
  }, [isActive]);

  useEffect(() => {
    loadItems();
  }, [filterLowStock, selectedCategory]);

  const handleDownloadInventoryPdf = async () => {
    setDownloadingReport(true);
    const timestamp = new Date().toISOString().slice(0, 10);
    const url = api.reports.getInventoryPdfUrl();
    const fileName = `InventoryReport_${timestamp}.pdf`;
    try {
      const res = await downloadReportFile(url, fileName, "application/pdf");
      if (!res.success && res.error) {
        Alert.alert("Download Notice", res.error);
      }
    } catch (e) {
      Alert.alert("Download Error", e.message || "Failed to download inventory PDF");
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleImportPdf = async () => {
    Keyboard.dismiss();
    try {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/pdf";
        input.onchange = async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          if (file.size && file.size > 100 * 1024 * 1024) {
            Alert.alert("File Too Large", "Please choose a PDF smaller than 100 MB.");
            return;
          }
          setImportingPdf(true);
          try {
            const res = await api.items.importPdfFile(file);
            if (res && res.success) {
              Alert.alert(
                "PDF Menu Imported!",
                `Successfully parsed and added items from PDF.\nAdded: ${res.addedCount || 0}, Updated: ${res.updatedCount || 0}`
              );
              loadItems();
            } else {
              Alert.alert("Import Notice", res?.message || "Could not extract menu items from this PDF.");
            }
          } catch (err) {
            Alert.alert("Error", err.message || "Failed to upload PDF file.");
          } finally {
            setImportingPdf(false);
          }
        };
        input.click();
        return;
      }

      setImportingPdf(true);
      const resDoc = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
      });

      if (resDoc.canceled || !resDoc.assets || !resDoc.assets.length) {
        setImportingPdf(false);
        return;
      }

      const asset = resDoc.assets[0];
      if (asset.size && asset.size > 100 * 1024 * 1024) {
        setImportingPdf(false);
        Alert.alert("File Too Large", "Please choose a PDF smaller than 100 MB.");
        return;
      }

      try {
        const res = await api.items.importPdfFile(Platform.OS === "web" && asset.file ? asset.file : asset.uri);
        if (res && res.success) {
          Alert.alert(
            "PDF Menu Imported!",
            `Successfully parsed and added items from PDF.\nAdded: ${res.addedCount || 0}, Updated: ${res.updatedCount || 0}`
          );
          loadItems();
        } else {
          Alert.alert("Import Notice", res?.message || "Could not extract menu items from this PDF.");
        }
      } finally {
        if (Platform.OS !== "web" && asset.uri) {
          FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => { });
        }
      }
    } catch (err) {
      Alert.alert("Import Error", err.message || "Failed to import items from PDF.");
    } finally {
      setImportingPdf(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const imageUri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setFormImageUrl(imageUri);
      }
    } catch {
      Alert.alert("Notice", "Could not pick image");
    }
  };

  const handleOpenCategoryModal = () => {
    setNewCategoryName("");
    setCategoryModalVisible(true);
  };

  const handleSaveCategory = async () => {
    Keyboard.dismiss();
    const cat = newCategoryName.trim();
    if (!cat) {
      showNotice("Required", "Please enter a category name");
      return;
    }
    setSavingCategory(true);
    try {
      let res = await api.items.addCategory(cat).catch((err) => ({ success: false, message: err.message }));
      if (!res || (!res.success && isNetworkErrorMessage(res.message))) {
        res = await queueOfflineCategoryAdd(cat);
      }
      if (res && res.success) {
        setNewCategoryName("");
        setCategoryModalVisible(false);
        await loadCategories();
        setSelectedCategory(cat);
        setFormCategory(cat);
        showNotice(
          res.offlineQueued ? "Saved Offline" : "Category Ready!",
          res.offlineQueued
            ? `Category "${cat}" added offline & will sync when online.`
            : `Category "${cat}" has been added. You can now add food to "${cat}".`
        );
      } else {
        showNotice("Notice", res?.message || "Failed to add category");
      }
    } catch (e) {
      showNotice("Error", e.message || "Failed to add category");
    } finally {
      setSavingCategory(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingItem(null);
    resetForm();
    if (selectedCategory && selectedCategory !== "All") {
      setFormCategory(selectedCategory);
    } else if (categories.length > 0) {
      setFormCategory(categories[0]);
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
    setModalVisible(true);
  };

  const executeDeleteItem = async (item) => {
    try {
      const isLocalOnly = String(item._id).startsWith("offline_item_");
      let res = isLocalOnly
        ? await queueOfflineItemDelete(item._id)
        : await api.items.delete(item._id).catch((err) => ({ success: false, message: err.message }));

      if (!res || (!res.success && isNetworkErrorMessage(res.message))) {
        res = await queueOfflineItemDelete(item._id);
      }

      if (res && res.success) {
        loadItems();
        showNotice(
          res.offlineQueued ? "Deleted Offline" : "Deleted",
          res.offlineQueued
            ? `"${item.name}" removed locally & will delete on server when online.`
            : `"${item.name}" has been removed from inventory.`
        );
      } else {
        showNotice("Error", res?.message || "Failed to delete item");
      }
    } catch (e) {
      showNotice("Error", e.message || "Failed to delete item");
    }
  };

  const handleDeleteItem = async (item) => {
    if (!item || !item._id) return;
    if (Platform.OS === "web") {
      if (window.confirm(`Are you sure you want to delete "${item.name}"? This cannot be undone.`)) {
        executeDeleteItem(item);
      }
      return;
    }
    Alert.alert(
      "Delete Item",
      `Are you sure you want to delete "${item.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => executeDeleteItem(item),
        },
      ]
    );
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
    };

    let res;
    try {
      if (editingItem) {
        const isLocalOnly = String(editingItem._id).startsWith("offline_item_");
        res = isLocalOnly
          ? await queueOfflineItemUpdate(editingItem._id, payload)
          : await api.items.update(editingItem._id, payload).catch((err) => ({ success: false, message: err.message }));
        if (!res || (!res.success && isNetworkErrorMessage(res.message))) {
          res = await queueOfflineItemUpdate(editingItem._id, payload);
        }
      } else {
        res = await api.items.create(payload).catch((err) => ({ success: false, message: err.message }));
        if (!res || (!res.success && isNetworkErrorMessage(res.message))) {
          res = await queueOfflineItemCreate(payload);
        }
      }
    } catch (err) {
      res = editingItem
        ? await queueOfflineItemUpdate(editingItem._id, payload)
        : await queueOfflineItemCreate(payload);
    }

    if (res && res.success) {
      setModalVisible(false);
      resetForm();
      loadItems();
      if (res.offlineQueued) {
        showNotice(
          "Saved Offline",
          editingItem
            ? `"${payload.name}" updated locally & will sync when online!`
            : `"${payload.name}" added offline — ready to bill now & will sync when online!`
        );
      } else {
        showNotice(
          "Success",
          editingItem ? "Item updated successfully" : "Item added to inventory"
        );
      }
    } else {
      showNotice("Error", res?.message || "Failed to save item");
    }
  };

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
  };

  return (
    <View style={{ flex: 1 }} className="flex-1 bg-slate-50">
      <View style={{ paddingTop: headerTopPadding }} className="bg-blue-600 px-4 pb-3">
        <ResponsiveContainer maxWidth={1200}>
          <View className="flex-row items-center justify-between mb-2.5">
            <View className="flex-row items-center flex-1 pr-2">
              {!isWide && (
                <TouchableOpacity onPress={onOpenDrawer} className="mr-2 p-1">
                  <Ionicons name="menu" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              )}
              {onBack && !isWide ? (
                <TouchableOpacity
                  onPress={onBack}
                  className="flex-row items-center bg-white/20 px-2.5 py-1 rounded-lg mr-2"
                >
                  <Ionicons name="arrow-back" size={16} color="#FFFFFF" />
                  <Text className="text-white text-xs font-bold ml-1">Back</Text>
                </TouchableOpacity>
              ) : null}
              <Text className="text-white text-xl font-bold">Inventory</Text>
              <View className="bg-blue-700/80 px-2 py-0.5 rounded-full ml-2 border border-blue-400/40">
                <Text className="text-white text-[11px] font-bold">{items.length} items</Text>
              </View>
            </View>
          </View>

          <View style={isWide ? { flexDirection: "row", gap: 8, marginBottom: 10, alignItems: "center" } : undefined}>
            {/* ── 2 Primary Actions: 1. Add Category  2. Add Food / Item ── */}
            <View style={isWide ? { flex: 1, flexDirection: "row", gap: 8 } : undefined} className={!isWide ? "flex-row gap-2 mb-2" : ""}>
              <TouchableOpacity
                onPress={handleOpenCategoryModal}
                className="flex-1 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 py-2.5 px-3 rounded-xl flex-row items-center justify-center shadow-xs"
              >
                <Ionicons name="folder-outline" size={17} color="#FFFFFF" />
                <Text className="text-white font-extrabold text-xs ml-1.5">+ Add Category</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleOpenAdd}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 py-2.5 px-3 rounded-xl flex-row items-center justify-center shadow-xs"
              >
                <Ionicons name="fast-food-outline" size={17} color="#FFFFFF" />
                <Text className="text-white font-extrabold text-xs ml-1.5">+ Add Food / Item</Text>
              </TouchableOpacity>
            </View>

            <View style={isWide ? { flex: 0.9, flexDirection: "row", gap: 8 } : undefined} className={!isWide ? "flex-row gap-2 mb-2.5" : ""}>
              <TouchableOpacity
                onPress={handleImportPdf}
                disabled={importingPdf}
                className="flex-1 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 py-2.5 px-3 rounded-xl flex-row items-center justify-center shadow-xs border border-blue-500"
              >
                {importingPdf ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="document-attach" size={15} color="#FFFFFF" />
                    <Text className="text-white font-bold text-xs ml-1.5">Add by PDF</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDownloadInventoryPdf}
                disabled={downloadingReport}
                className="flex-1 bg-white/20 hover:bg-white/30 border border-white/30 py-2.5 px-3 rounded-xl flex-row items-center justify-center"
              >
                {downloadingReport ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={14} color="#FFFFFF" />
                    <Text className="text-white font-bold text-xs ml-1.5">PDF Report</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View className="flex-row bg-white rounded-xl px-3 py-2 items-center shadow-xs">
            <Ionicons name="search" size={18} color="#9CA3AF" />
            <TextInput
              className="flex-1 ml-2 text-sm text-gray-800"
              placeholder="Search items by name or barcode..."
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={loadItems}
            />
            {search ? (
              <TouchableOpacity
                onPress={() => {
                  setSearch("");
                  loadItems();
                }}
              >
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            ) : null}
          </View>
        </ResponsiveContainer>
      </View>

      {/* Category Filter Chips Bar */}
      <View className="bg-white border-b border-gray-100 px-3 py-2">
        <ResponsiveContainer maxWidth={1200}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            <TouchableOpacity
              onPress={() => setSelectedCategory("All")}
              className={`px-3 py-1.5 rounded-full mr-2 border ${selectedCategory === "All"
                  ? "bg-blue-600 border-blue-600 shadow-xs"
                  : "bg-gray-100 border-gray-200"
                }`}
            >
              <Text
                className={`text-xs font-bold ${selectedCategory === "All" ? "text-white" : "text-gray-700"
                  }`}
              >
                All Categories
              </Text>
            </TouchableOpacity>

            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full mr-2 border ${selectedCategory === cat
                    ? "bg-blue-600 border-blue-600 shadow-xs"
                    : "bg-gray-100 border-gray-200"
                  }`}
              >
                <Text
                  className={`text-xs font-bold ${selectedCategory === cat ? "text-white" : "text-gray-700"
                    }`}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              onPress={handleOpenCategoryModal}
              className="px-3 py-1.5 rounded-full border border-dashed border-blue-400 bg-blue-50 flex-row items-center"
            >
              <Ionicons name="add" size={14} color="#2563EB" />
              <Text className="text-xs font-bold text-blue-700 ml-1">+ Category</Text>
            </TouchableOpacity>
          </ScrollView>
        </ResponsiveContainer>
      </View>

      <View className="bg-white border-b border-gray-200 px-3 py-2">
        <ResponsiveContainer maxWidth={1200} style={{ flexDirection: "row" }}>
          <TouchableOpacity
            onPress={() => setFilterLowStock(false)}
            className={`px-3 py-1.5 rounded-full mr-2 ${!filterLowStock ? "bg-blue-600" : "bg-gray-100"
              }`}
          >
            <Text
              className={`text-xs font-bold ${!filterLowStock ? "text-white" : "text-gray-600"
                }`}
            >
              All Items ({items.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilterLowStock(true)}
            className={`px-3 py-1.5 rounded-full ${filterLowStock ? "bg-red-600" : "bg-gray-100"
              }`}
          >
            <Text
              className={`text-xs font-bold ${filterLowStock ? "text-white" : "text-gray-600"
                }`}
            >
              Low Stock Alerts
            </Text>
          </TouchableOpacity>
        </ResponsiveContainer>
      </View>

      {pendingItemOps.length > 0 ? (
        <View className="bg-blue-50 border-b border-blue-200 px-4 py-2.5">
          <ResponsiveContainer maxWidth={1200} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View className="flex-row items-center flex-1 pr-2">
              <Ionicons name="cloud-offline-outline" size={16} color="#2563EB" />
              <Text className="text-xs font-bold text-blue-900 ml-2">
                {pendingItemOps.length} Offline Menu Change{pendingItemOps.length > 1 ? "s" : ""} Pending Sync
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleSyncOfflineItemsNow}
              disabled={syncingOfflineItems}
              className="bg-blue-600 px-3 py-1 rounded-lg flex-row items-center"
            >
              {syncingOfflineItems ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-white text-[11px] font-bold">Sync Now</Text>
              )}
            </TouchableOpacity>
          </ResponsiveContainer>
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          key={`inv-cols-${gridColumns}`}
          numColumns={gridColumns}
          columnWrapperStyle={gridColumns > 1 ? { gap: 12 } : undefined}
          style={{ flex: 1, width: "100%", maxWidth: 1200, alignSelf: "center" }}
          data={items}
          keyExtractor={(item, index) => item?._id || `item-${index}`}
          contentContainerStyle={{ padding: isWide ? 16 : 12, paddingBottom: 120, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled={true}
          scrollEnabled={true}
          showsVerticalScrollIndicator={true}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadItems}
              tintColor="#2563EB"
              colors={["#2563EB"]}
            />
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <MaterialCommunityIcons
                name="package-variant"
                size={48}
                color="#9CA3AF"
              />
              <Text className="text-gray-500 font-semibold text-sm mt-3">
                No items in inventory
              </Text>
              <Text className="text-gray-400 text-xs mt-1">
                Tap 'Add Item' above to start adding products to your store
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            if (!item) return null;
            const soldData =
              salesSummary.byItemId?.[item._id] ||
              salesSummary.byName?.[String(item.name || "").trim().toLowerCase()];
            const totalSoldQty = soldData?.totalSoldQuantity || 0;
            const totalSoldRev = soldData?.totalRevenue || 0;

            return (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => handleOpenItemStats(item)}
                style={gridColumns > 1 ? { flex: 1, maxWidth: `${100 / gridColumns - 1}%` } : undefined}
                className="bg-white rounded-xl p-4 mb-3 border border-gray-200 shadow-sm flex-row items-center justify-between"
              >
                <View className="flex-row items-center flex-1 pr-2">
                  <SafeProductImage uri={item.imageUrl} />
                  <View className="flex-1">
                    <View className="flex-row items-center flex-wrap gap-1.5">
                      <Text className="text-base font-extrabold text-gray-900">
                        {item.name || "Untitled Item"}
                      </Text>
                      {item.isOfflinePending ? (
                        <View className="bg-blue-100 border border-blue-300 px-1.5 py-0.5 rounded">
                          <Text className="text-[9px] font-extrabold text-blue-800 uppercase">Offline</Text>
                        </View>
                      ) : null}
                    </View>
                    <View className="flex-row items-center gap-2 mt-0.5">
                      <Text className="text-xs text-gray-500 font-medium">
                        {item.category || "General"}
                      </Text>
                      {item.barcode ? (
                        <Text className="text-[11px] text-gray-400">
                          Code: {item.barcode}
                        </Text>
                      ) : null}
                    </View>
                    <View className="flex-row items-center flex-wrap gap-2 mt-1.5">
                      <Text className="text-xs font-bold text-blue-900">
                        Sale: Rs. {item.sellingPrice || 0}
                      </Text>
                      {item.taxRate > 0 ? (
                        <Text className="text-[11px] text-gray-500">
                          GST: {item.taxRate}%
                        </Text>
                      ) : null}
                      {totalSoldQty > 0 ? (
                        <View className="bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-full flex-row items-center">
                          <Ionicons name="trending-up" size={11} color="#059669" />
                          <Text className="text-[10px] font-extrabold text-emerald-800 ml-1">
                            Sold: {totalSoldQty} {item.unit || "PCS"} (Rs. {totalSoldRev})
                          </Text>
                        </View>
                      ) : (
                        <View className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">
                          <Text className="text-[9.5px] font-semibold text-gray-500">
                            Tap to view sales
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                <View className="flex-row items-center">
                  <View className="items-end mr-2">
                    <Text
                      className={`text-sm font-extrabold ${(item.stock || 0) <= (item.lowStockThreshold || 5)
                          ? "text-red-600"
                          : "text-emerald-700"
                        }`}
                    >
                      {item.stock || 0} {item.unit || "PCS"}
                    </Text>
                    <Text className="text-[10px] text-gray-400 mt-0.5">
                      {(item.stock || 0) <= (item.lowStockThreshold || 5)
                        ? "Low Stock"
                        : "In Stock"}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation && e.stopPropagation();
                      handleOpenEdit(item);
                    }}
                    className="bg-blue-50 border border-blue-200 w-9 h-9 rounded-lg items-center justify-center mr-2"
                  >
                    <Ionicons name="pencil" size={16} color="#2563EB" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation && e.stopPropagation();
                      handleDeleteItem(item);
                    }}
                    className="bg-red-50 border border-red-200 w-9 h-9 rounded-lg items-center justify-center"
                  >
                    <Ionicons name="trash" size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          Keyboard.dismiss();
          setModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <View className="flex-1 bg-black/50 justify-end sm:justify-center items-center p-0 sm:p-4">
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
            </TouchableWithoutFeedback>

            <View className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 max-h-[85%] sm:max-h-[90%] shadow-2xl">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-lg font-bold text-gray-900">
                  {editingItem ? "Edit Item" : "Add Item"}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    setModalVisible(false);
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ paddingBottom: 60 }}
              >
                <View className="items-center mb-4">
                  {formImageUrl ? (
                    <View className="items-center">
                      <TouchableOpacity onPress={handlePickImage} className="relative">
                        <Image
                          source={{ uri: formImageUrl }}
                          style={{ width: 84, height: 84, borderRadius: 12 }}
                        />
                        <View className="absolute bottom-0 right-0 bg-blue-600 w-6 h-6 rounded-full items-center justify-center border-2 border-white">
                          <Ionicons name="camera" size={12} color="#FFFFFF" />
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setFormImageUrl("")} className="mt-1.5">
                        <Text className="text-xs text-red-500 font-medium">Remove Image</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={handlePickImage}
                      className="w-20 h-20 rounded-xl bg-blue-50 border-2 border-dashed border-blue-300 items-center justify-center"
                    >
                      <Ionicons name="camera" size={24} color="#2563EB" />
                      <Text className="text-[10px] text-blue-600 font-bold mt-1">Product Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* 1. Food Category Selection */}
                <View className="mb-3.5 bg-blue-50/70 p-3 rounded-2xl border border-blue-100">
                  <View className="flex-row items-center justify-between mb-1.5">
                    <Text className="text-xs font-bold text-gray-800">
                      Food Category: <Text className="text-blue-600">{formCategory || "General"}</Text>
                    </Text>
                    <TouchableOpacity onPress={handleOpenCategoryModal}>
                      <Text className="text-[11px] font-bold text-blue-600">+ Add Category</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    className="flex-row py-0.5"
                  >
                    {categories.map((cat) => {
                      const isSelected = formCategory === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          onPress={() => setFormCategory(cat)}
                          className={`px-3 py-1.5 rounded-xl mr-2 border flex-row items-center ${isSelected
                              ? "bg-blue-600 border-blue-600 shadow-xs"
                              : "bg-white border-gray-200"
                            }`}
                        >
                          <Ionicons
                            name={isSelected ? "checkmark-circle" : "folder-outline"}
                            size={13}
                            color={isSelected ? "#FFFFFF" : "#6B7280"}
                          />
                          <Text
                            className={`text-xs font-bold ml-1.5 ${isSelected ? "text-white" : "text-gray-700"
                              }`}
                          >
                            {cat}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                <View className="mb-3">
                  <Text className="text-xs font-bold text-gray-700 mb-1">Food / Item Name</Text>
                  <TextInput
                    className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
                    placeholder="Enter item name"
                    value={formName}
                    onChangeText={setFormName}
                  />
                </View>

                <View className="flex-row gap-3 mb-3">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-gray-700 mb-1">Selling Price (Rs)</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                      placeholder="0.00"
                      keyboardType="numeric"
                      value={formSellingPrice}
                      onChangeText={setFormSellingPrice}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-gray-700 mb-1">Purchase / Cost (Rs)</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                      placeholder="0.00"
                      keyboardType="numeric"
                      value={formCostPrice}
                      onChangeText={setFormCostPrice}
                    />
                  </View>
                </View>

                <View className="flex-row gap-3 mb-3">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-gray-700 mb-1">Category</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                      placeholder="General, Food, etc"
                      value={formCategory}
                      onChangeText={setFormCategory}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-gray-700 mb-1">Tax Rate (GST %)</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                      placeholder="0"
                      keyboardType="numeric"
                      value={formTaxRate}
                      onChangeText={setFormTaxRate}
                    />
                  </View>
                </View>

                <View className="flex-row gap-3 mb-4">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-gray-700 mb-1">Current Stock</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                      placeholder="0"
                      keyboardType="numeric"
                      value={formStock}
                      onChangeText={setFormStock}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-gray-700 mb-1">Barcode / SKU</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                      placeholder="Scanner code"
                      value={formBarcode}
                      onChangeText={setFormBarcode}
                    />
                  </View>
                </View>

                <View className="mb-6">
                  <Text className="text-xs font-bold text-gray-700 mb-1.5">Measuring Unit</Text>
                  <View className="flex-row flex-wrap gap-1.5">
                    {["PCS", "SRV", "HRS", "MIN", "KG", "G", "LTR", "ML", "BOX", "PACK", "BTL", "SET"].map((u) => (
                      <TouchableOpacity
                        key={u}
                        onPress={() => setFormUnit(u)}
                        style={{ minWidth: 44 }}
                        className={`py-1.5 px-2 rounded-lg border items-center justify-center ${formUnit === u
                            ? "bg-blue-600 border-blue-600"
                            : "bg-gray-100 border-gray-300"
                          }`}
                      >
                        <Text
                          className={`text-xs font-bold ${formUnit === u ? "text-white" : "text-gray-700"
                            }`}
                        >
                          {u}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleSaveItem}
                  className="w-full bg-blue-600 py-3.5 rounded-xl items-center shadow mb-6"
                >
                  <Text className="text-white font-bold text-sm">
                    {editingItem ? "Update Item" : "Save Item"}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Modal 2: Add Category Modal ── */}
      <Modal
        visible={categoryModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          Keyboard.dismiss();
          setCategoryModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View className="flex-1 bg-black/50 justify-center items-center p-4">
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
            </TouchableWithoutFeedback>

            <View className="bg-white w-full sm:max-w-md rounded-3xl p-6 shadow-2xl">
              <View className="flex-row justify-between items-center mb-3">
                <View>
                  <Text className="text-lg font-bold text-gray-900">Add New Category</Text>
                  <Text className="text-xs text-gray-500">Create a category to organize your food items</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    setCategoryModalVisible(false);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Quick suggestions */}
              <Text className="text-[11px] font-bold text-gray-500 mb-1.5 uppercase">Quick Suggestions</Text>
              <View className="flex-row flex-wrap gap-1.5 mb-3.5">
                {(
                  businessType === "salon"
                    ? ["Haircut", "Hair Color", "Facial & Skin", "Spa & Massage", "Beard & Shave", "Bridal", "Retail Products"]
                    : businessType === "retail"
                    ? ["Groceries", "Beverages", "Snacks", "Dairy", "Personal Care", "Cleaning", "Stationery"]
                    : businessType === "general"
                    ? ["Services", "Hardware", "Consultation", "Labour", "Spare Parts", "General"]
                    : ["Beverages", "Fast Food", "Starters", "Main Course", "Pizza", "Desserts", "Chinese", "Biryani"]
                ).map((sug) => (
                  <TouchableOpacity
                    key={sug}
                    onPress={() => setNewCategoryName(sug)}
                    className="bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg"
                  >
                    <Text className="text-xs font-semibold text-blue-700">{sug}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View className="mb-4">
                <Text className="text-xs font-bold text-gray-700 mb-1">Category Name *</Text>
                <TextInput
                  className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900"
                  placeholder="e.g. Fast Food, Beverages"
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  autoFocus={true}
                  returnKeyType="done"
                  onSubmitEditing={handleSaveCategory}
                />
              </View>

              <TouchableOpacity
                onPress={handleSaveCategory}
                disabled={savingCategory}
                className="w-full bg-blue-600 py-3.5 rounded-xl items-center shadow flex-row justify-center"
              >
                {savingCategory ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                    <Text className="text-white font-bold text-sm ml-1.5">Save Category</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ────────────────── ITEM SALES & ANALYTICS MODAL ────────────────── */}
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
                <View className="flex-1">
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