import React, { useState, useEffect } from "react";
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
} from "react-native";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "../config/api";

export default function InventoryScreen({ onOpenDrawer, onBack }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

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

  const loadItems = async () => {
    setLoading(true);
    let query = search ? `search=${encodeURIComponent(search)}` : "";
    if (filterLowStock) {
      query += `${query ? "&" : ""}lowStock=true`;
    }
    const res = await api.items.getAll(query);
    setLoading(false);
    if (res.success && res.items) {
      setItems(res.items);
    }
  };

  useEffect(() => {
    loadItems();
  }, [filterLowStock]);

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
      Alert.alert("Error", "Could not pick image");
    }
  };

  const handleOpenAdd = () => {
    setEditingItem(null);
    resetForm();
    setModalVisible(true);
  };

  const handleOpenEdit = (item) => {
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

  const handleSaveItem = async () => {
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

    if (res.success) {
      setModalVisible(false);
      resetForm();
      loadItems();
      Alert.alert(
        "Success",
        editingItem ? "Item updated successfully" : "Item added to inventory"
      );
    } else {
      Alert.alert("Error", res.message || "Failed to save item");
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
      <View className="bg-blue-600 px-4 pt-10 pb-4">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <TouchableOpacity onPress={onOpenDrawer} className="mr-2">
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
          </View>
          <TouchableOpacity
            onPress={handleOpenAdd}
            className="bg-white/20 px-3 py-1.5 rounded-lg flex-row items-center"
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text className="text-white font-bold text-xs ml-1">Add Item</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row bg-white rounded-xl px-3 py-2 items-center">
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

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
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
            </View>
          }
          renderItem={({ item }) => (
            <View className="bg-white rounded-xl p-4 mb-3 border border-gray-200 shadow-sm flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 pr-2">
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={{ width: 48, height: 48, borderRadius: 10, marginRight: 12 }}
                  />
                ) : (
                  <View className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 items-center justify-center mr-3">
                    <FontAwesome5 name="box-open" size={20} color="#2563EB" />
                  </View>
                )}
                <View className="flex-1">
                  <Text className="text-base font-extrabold text-gray-900">
                    {item.name}
                  </Text>
                  <View className="flex-row items-center gap-2 mt-0.5">
                    <Text className="text-xs text-gray-500 font-medium">
                      {item.category}
                    </Text>
                    {item.barcode ? (
                      <Text className="text-[11px] text-gray-400">
                        Code: {item.barcode}
                      </Text>
                    ) : null}
                  </View>
                  <View className="flex-row items-center gap-3 mt-1.5">
                    <Text className="text-xs font-bold text-blue-900">
                      Sale: Rs. {item.sellingPrice}
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
                      item.stock <= (item.lowStockThreshold || 5)
                        ? "text-red-600"
                        : "text-emerald-700"
                    }`}
                  >
                    {item.stock} {item.unit}
                  </Text>
                  <Text className="text-[10px] text-gray-400 mt-0.5">
                    {item.stock <= (item.lowStockThreshold || 5)
                      ? "Low Stock"
                      : "In Stock"}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => handleOpenEdit(item)}
                  className="bg-blue-50 border border-blue-200 w-9 h-9 rounded-lg items-center justify-center"
                >
                  <Ionicons name="pencil" size={16} color="#2563EB" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 max-h-[90%]">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-gray-900">
                {editingItem ? "Edit Item" : "Add Item"}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
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

              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-700 mb-1">Product / Item Name</Text>
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
                  <Text className="text-xs font-bold text-gray-700 mb-1">Cost Price (Rs)</Text>
                  <TextInput
                    className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                    placeholder="0.00"
                    keyboardType="numeric"
                    value={formCostPrice}
                    onChangeText={setFormCostPrice}
                  />
                </View>
              </View>

              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-700 mb-1">Category</Text>
                <TextInput
                  className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
                  placeholder="e.g. Grocery, Electronics, Drinks"
                  value={formCategory}
                  onChangeText={setFormCategory}
                />
              </View>

              <View className="flex-row gap-3 mb-3">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-gray-700 mb-1">HSN Code</Text>
                  <TextInput
                    className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                    placeholder="e.g. 1006"
                    value={formHsn}
                    onChangeText={setFormHsn}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-gray-700 mb-1">GST Tax Rate (%)</Text>
                  <TextInput
                    className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                    placeholder="0, 5, 12, 18, 28"
                    keyboardType="numeric"
                    value={formTaxRate}
                    onChangeText={setFormTaxRate}
                  />
                </View>
              </View>

              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
                  <Text className="text-xs font-bold text-gray-700 mb-1">Opening Stock</Text>
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
      </Modal>
    </View>
  );
}
