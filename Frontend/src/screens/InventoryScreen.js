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

export default function InventoryScreen({ onOpenDrawer, onBack }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [importingPdf, setImportingPdf] = useState(false);
  const [categories, setCategories] = useState(["General"]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

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
      const res = await api.items.getCategories();
      if (res && res.success && Array.isArray(res.categories) && res.categories.length > 0) {
        setCategories(res.categories);
      }
    } catch {}
  }, []);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      let queryParts = [];
      if (search) queryParts.push(`search=${encodeURIComponent(search)}`);
      if (filterLowStock) queryParts.push("lowStock=true");
      if (selectedCategory && selectedCategory !== "All") {
        queryParts.push(`category=${encodeURIComponent(selectedCategory)}`);
      }
      const query = queryParts.join("&");
      const res = await api.items.getAll(query);
      if (res && res.success && Array.isArray(res.items)) {
        setItems(sortItemsNaturally(res.items));
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterLowStock, selectedCategory]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

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
          FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => {});
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
      Alert.alert("Required", "Please enter a category name");
      return;
    }
    setSavingCategory(true);
    try {
      const res = await api.items.addCategory(cat);
      if (res && res.success) {
        setNewCategoryName("");
        setCategoryModalVisible(false);
        await loadCategories();
        setSelectedCategory(cat);
        setFormCategory(cat);
        Alert.alert(
          "Category Ready!",
          `Category "${cat}" has been added. You can now add food to "${cat}".`
        );
      } else {
        Alert.alert("Notice", res?.message || "Failed to add category");
      }
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to add category");
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

  const handleDeleteItem = async (item) => {
    if (!item || !item._id) return;
    Alert.alert(
      "Delete Item",
      `Are you sure you want to delete "${item.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await api.items.delete(item._id);
              if (res && res.success) {
                loadItems();
                Alert.alert("Deleted", `"${item.name}" has been removed from inventory.`);
              } else {
                Alert.alert("Error", res?.message || "Failed to delete item");
              }
            } catch (e) {
              Alert.alert("Error", e.message || "Failed to delete item");
            }
          },
        },
      ]
    );
  };

  const handleSaveItem = async () => {
    Keyboard.dismiss();
    if (!formName.trim() || !formSellingPrice.trim()) {
      Alert.alert("Required Fields", "Please enter Item Name and Selling Price");
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
    if (editingItem) {
      res = await api.items.update(editingItem._id, payload);
    } else {
      res = await api.items.create(payload);
    }

    if (res && res.success) {
      setModalVisible(false);
      resetForm();
      loadItems();
      Alert.alert(
        "Success",
        editingItem ? "Item updated successfully" : "Item added to inventory"
      );
    } else {
      Alert.alert("Error", res?.message || "Failed to save item");
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
    <View style={{ flex: 1 }} className="flex-1 bg-gray-50">
      <View className="bg-blue-600 px-4 pt-10 pb-3">
        <View className="flex-row items-center justify-between mb-2.5">
          <View className="flex-row items-center flex-1 pr-2">
            <TouchableOpacity onPress={onOpenDrawer} className="mr-2 p-1">
              <Ionicons name="menu" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            {onBack ? (
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

        {/* ── 2 Primary Actions: 1. Add Category  2. Add Food / Item ── */}
        <View className="flex-row gap-2 mb-2">
          <TouchableOpacity
            onPress={handleOpenCategoryModal}
            className="flex-1 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 py-2.5 px-3 rounded-xl flex-row items-center justify-center shadow-xs"
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

        <View className="flex-row gap-2 mb-2.5">
          <TouchableOpacity
            onPress={handleImportPdf}
            disabled={importingPdf}
            className="flex-1 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 py-2 px-3 rounded-xl flex-row items-center justify-center shadow-xs"
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
            className="flex-1 bg-white/20 hover:bg-white/30 border border-white/30 py-2 px-3 rounded-xl flex-row items-center justify-center"
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
      </View>

      {/* Category Filter Chips Bar */}
      <View className="bg-white border-b border-gray-100 px-3 py-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          <TouchableOpacity
            onPress={() => setSelectedCategory("All")}
            className={`px-3 py-1.5 rounded-full mr-2 border ${
              selectedCategory === "All"
                ? "bg-blue-600 border-blue-600 shadow-xs"
                : "bg-gray-100 border-gray-200"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                selectedCategory === "All" ? "text-white" : "text-gray-700"
              }`}
            >
              All Categories
            </Text>
          </TouchableOpacity>

          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full mr-2 border ${
                selectedCategory === cat
                  ? "bg-blue-600 border-blue-600 shadow-xs"
                  : "bg-gray-100 border-gray-200"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  selectedCategory === cat ? "text-white" : "text-gray-700"
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
      </View>

      <View className="flex-row bg-white border-b border-gray-200 px-3 py-2">
        <TouchableOpacity
          onPress={() => setFilterLowStock(false)}
          className={`px-3 py-1.5 rounded-full mr-2 ${
            !filterLowStock ? "bg-blue-600" : "bg-gray-100"
          }`}
        >
          <Text
            className={`text-xs font-bold ${
              !filterLowStock ? "text-white" : "text-gray-600"
            }`}
          >
            All Items ({items.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFilterLowStock(true)}
          className={`px-3 py-1.5 rounded-full ${
            filterLowStock ? "bg-red-600" : "bg-gray-100"
          }`}
        >
          <Text
            className={`text-xs font-bold ${
              filterLowStock ? "text-white" : "text-gray-600"
            }`}
          >
            Low Stock Alerts
          </Text>
        </TouchableOpacity>
      </View>

      {loading && items.length === 0 ? (
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(item, index) => item?._id || `item-${index}`}
          contentContainerStyle={{ padding: 12, paddingBottom: 120, flexGrow: 1 }}
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
            return (
              <View className="bg-white rounded-xl p-4 mb-3 border border-gray-200 shadow-sm flex-row items-center justify-between">
                <View className="flex-row items-center flex-1 pr-2">
                  <SafeProductImage uri={item.imageUrl} />
                  <View className="flex-1">
                    <Text className="text-base font-extrabold text-gray-900">
                      {item.name || "Untitled Item"}
                    </Text>
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
                    <View className="flex-row items-center gap-3 mt-1.5">
                      <Text className="text-xs font-bold text-blue-900">
                        Sale: Rs. {item.sellingPrice || 0}
                      </Text>
                      {item.taxRate > 0 ? (
                        <Text className="text-[11px] text-gray-500">
                          GST: {item.taxRate}%
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>

                <View className="flex-row items-center">
                  <View className="items-end mr-2">
                    <Text
                      className={`text-sm font-extrabold ${
                        (item.stock || 0) <= (item.lowStockThreshold || 5)
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
                    onPress={() => handleOpenEdit(item)}
                    className="bg-blue-50 border border-blue-200 w-9 h-9 rounded-lg items-center justify-center mr-2"
                  >
                    <Ionicons name="pencil" size={16} color="#2563EB" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteItem(item)}
                    className="bg-red-50 border border-red-200 w-9 h-9 rounded-lg items-center justify-center"
                  >
                    <Ionicons name="trash" size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </View>
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
                          className={`px-3 py-1.5 rounded-xl mr-2 border flex-row items-center ${
                            isSelected
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
                            className={`text-xs font-bold ml-1.5 ${
                              isSelected ? "text-white" : "text-gray-700"
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

                <View className="flex-row gap-2 mb-6">
                  {["PCS", "KG", "LTR", "BOX", "PACK"].map((u) => (
                    <TouchableOpacity
                      key={u}
                      onPress={() => setFormUnit(u)}
                      className={`flex-1 py-2 rounded-lg border items-center ${
                        formUnit === u
                          ? "bg-blue-600 border-blue-600"
                          : "bg-gray-100 border-gray-300"
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          formUnit === u ? "text-white" : "text-gray-700"
                        }`}
                      >
                        {u}
                      </Text>
                    </TouchableOpacity>
                  ))}
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
                {["Beverages", "Fast Food", "Starters", "Main Course", "Pizza", "Desserts", "Chinese", "Biryani"].map(
                  (sug) => (
                    <TouchableOpacity
                      key={sug}
                      onPress={() => setNewCategoryName(sug)}
                      className="bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg"
                    >
                      <Text className="text-xs font-semibold text-blue-700">{sug}</Text>
                    </TouchableOpacity>
                  )
                )}
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
    </View>
  );
}