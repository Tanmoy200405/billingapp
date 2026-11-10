import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Alert,
  Linking,
  ActivityIndicator,
  Switch,
  RefreshControl,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { Ionicons, FontAwesome, MaterialIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "../config/api";
import { downloadReportFile } from "../utils/reportDownloader";
export default function PartyScreen({ onOpenDrawer, onBack }) {
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [vipVisitThreshold, setVipVisitThreshold] = useState(3);
  const [bulkSending, setBulkSending] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [importingPdf, setImportingPdf] = useState(false);
  const [perksModalVisible, setPerksModalVisible] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);
  const [formIsRegular, setFormIsRegular] = useState(false);
  const [formDiscount, setFormDiscount] = useState("0");
  const [formFreebie, setFormFreebie] = useState("");
  const loadParties = useCallback(async () => {
    setLoading(true);
    let query = search ? `search=${encodeURIComponent(search)}` : "";
    if (filterType === "vip") {
      query += `${query ? "&" : ""}isRegular=true`;
    } else if (filterType === "customer" || filterType === "supplier") {
      query += `${query ? "&" : ""}type=${filterType}`;
    }
    const res = await api.parties.getAll(query);
    setLoading(false);
    if (res && res.success && res.parties) {
      setParties(res.parties);
    }
  }, [search, filterType]);
  useEffect(() => {
    loadParties();
  }, [filterType]);
  const handleDownloadPartyReport = async () => {
    setDownloadingReport(true);
    const timestamp = new Date().toISOString().slice(0, 10);
    const url = api.reports.getPartiesPdfUrl();
    const fileName = `CustomerLedger_${timestamp}.pdf`;
    const mimeType = "application/pdf";
    try {
      const res = await downloadReportFile(url, fileName, mimeType);
      if (!res.success && res.error) {
        Alert.alert("Download Note", res.error);
      }
    } catch (e) {
      Alert.alert("Download Error", e.message || "Failed to download customer ledger report");
    } finally {
      setDownloadingReport(false);
    }
  };
  const handleImportPdf = async () => {
    Keyboard.dismiss();
    try {
      if (Platform.OS === "web") {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/pdf,.pdf";
        input.onchange = async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setImportingPdf(true);
          try {
            const reader = new FileReader();
            reader.onload = async () => {
              const base64Data = reader.result;
              const res = await api.parties.importPdf({ pdfBase64: base64Data });
              setImportingPdf(false);
              if (res && res.success) {
                Alert.alert(
                  "PDF Party List Imported!",
                  `Successfully parsed and saved customers from PDF.\nAdded: ${res.addedCount || 0}, Updated: ${res.updatedCount || 0}`
                );
                loadParties();
              } else {
                Alert.alert(
                  "Import Notice",
                  res?.message || "Could not extract customer list from this PDF."
                );
              }
            };
            reader.readAsDataURL(file);
          } catch (err) {
            setImportingPdf(false);
            Alert.alert("Error", err.message || "Failed to read PDF file.");
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
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: "base64",
      });

      const res = await api.parties.importPdf({ pdfBase64: base64 });
      setImportingPdf(false);
      if (res && res.success) {
        Alert.alert(
          "PDF Party List Imported!",
          `Successfully parsed and saved customers from PDF.\nAdded: ${res.addedCount || 0}, Updated: ${res.updatedCount || 0}`
        );
        loadParties();
      } else {
        Alert.alert(
          "Import Notice",
          res?.message || "Could not extract customer list from this PDF."
        );
      }
    } catch (err) {
      setImportingPdf(false);
      Alert.alert("Import Error", err.message || "Failed to import party list from PDF.");
    }
  };
  const handleSavePerks = async () => {
    Keyboard.dismiss();
    if (!selectedParty) return;
    const res = await api.parties.updateRegularPerks(selectedParty._id, {
      isRegular: formIsRegular,
      customDiscountPercent: Number(formDiscount) || 0,
      assignedFreebie: formFreebie.trim(),
    });
    if (res && res.success) {
      setPerksModalVisible(false);
      loadParties();
      Alert.alert("Saved", "Customer perks updated");
    } else {
      Alert.alert("Error", res?.message || "Failed to update perks");
    }
  };
  const openWhatsAppOffer = async (party) => {
    const res = await api.parties.getWhatsAppOffer(party._id);
    if (res && res.success && res.whatsappUrl) {
      Linking.openURL(res.whatsappUrl);
    } else {
      const phone = party.whatsappNumber || party.phone;
      Linking.openURL(`https://wa.me/91${phone}`);
    }
  };
  const handleBulkVipOffer = async () => {
    const vips = parties.filter((p) => p.isRegular || (p.visitCount || 0) >= vipVisitThreshold);
    if (!vips.length) {
      Alert.alert("No VIPs", `No customers found meeting the VIP criteria (${vipVisitThreshold}+ visits).`);
      return;
    }
    Alert.alert(
      "Notify All VIPs",
      `Send WhatsApp offer to ${vips.length} VIP customer(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send All",
          onPress: async () => {
            setBulkSending(true);
            const res = await api.parties.sendBulkVipOffer();
            setBulkSending(false);
            if (res && res.success && res.vips && res.vips.length > 0) {
              for (const vip of res.vips) {
                await Linking.openURL(vip.whatsappUrl);
                await new Promise((r) => setTimeout(r, 800));
              }
              Alert.alert("Done", `WhatsApp opened for ${res.vips.length} VIP(s).`);
            } else {
              Alert.alert("No Results", res?.message || "No VIP offers to send.");
            }
          },
        },
      ]
    );
  };
  const openPerksDialog = (party) => {
    setSelectedParty(party);
    setFormIsRegular(Boolean(party.isRegular || (party.visitCount || 0) >= vipVisitThreshold));
    setFormDiscount((party.customDiscountPercent || 0).toString());
    setFormFreebie(party.assignedFreebie || "");
    setPerksModalVisible(true);
  };
  const displayedParties = React.useMemo(() => {
    if (filterType === "vip") {
      return parties.filter((p) => p.isRegular || (p.visitCount || 0) >= vipVisitThreshold);
    }
    return parties;
  }, [parties, filterType, vipVisitThreshold]);
  const vipCount = parties.filter((p) => p.isRegular || (p.visitCount || 0) >= vipVisitThreshold).length;
  const visitLabel = (count) => {
    if (!count || count === 0) return "New Customer";
    if (count === 1) return "1 visit";
    return `${count} visits`;
  };
  return (
    <View style={{ flex: 1 }} className="flex-1 bg-gray-50">
      <View className="bg-blue-600 px-4 pt-10 pb-4">
        <View className="flex-row items-center justify-between mb-2.5">
          <View className="flex-row items-center flex-1 mr-2">
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
            <View>
              <Text className="text-white text-xl font-bold">Customers</Text>
              <Text className="text-blue-200 text-[11px]">
                {parties.length} total · {vipCount} VIP (≥{vipVisitThreshold} visits)
              </Text>
            </View>
          </View>
        </View>
        <View className="flex-row gap-2 mb-2.5">
          <TouchableOpacity
            onPress={handleImportPdf}
            disabled={importingPdf}
            className="flex-1 bg-white/20 hover:bg-white/30 border border-white/30 py-2 px-2.5 rounded-xl flex-row items-center justify-center"
          >
            {importingPdf ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={15} color="#FFFFFF" />
                <Text className="text-white font-bold text-xs ml-1.5">Import PDF</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDownloadPartyReport}
            disabled={downloadingReport}
            className="flex-1 bg-white/20 hover:bg-white/30 border border-white/30 py-2 px-2.5 rounded-xl flex-row items-center justify-center"
          >
            {downloadingReport ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="document-text-outline" size={15} color="#FFFFFF" />
                <Text className="text-white font-bold text-xs ml-1.5">Download PDF</Text>
              </>
            )}
          </TouchableOpacity>
          {vipCount > 0 ? (
            <TouchableOpacity
              onPress={handleBulkVipOffer}
              disabled={bulkSending}
              className="flex-1 bg-amber-400 active:bg-amber-500 py-2 px-2.5 rounded-xl flex-row items-center justify-center shadow-xs"
            >
              {bulkSending ? (
                <ActivityIndicator size="small" color="#78350f" />
              ) : (
                <>
                  <FontAwesome name="whatsapp" size={15} color="#78350f" />
                  <Text className="text-amber-900 font-extrabold text-xs ml-1">VIP Offer</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
        <View className="flex-row bg-white rounded-xl px-3 py-2 items-center">
          <Ionicons name="search" size={18} color="#9CA3AF" />
          <TextInput
            className="flex-1 ml-2 text-sm text-gray-800"
            placeholder="Search by customer name or phone..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={loadParties}
          />
          {search ? (
            <TouchableOpacity onPress={() => { setSearch(""); loadParties(); }}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <View className="bg-white border-b border-gray-200 px-3 py-2">
        <View className="flex-row items-center justify-between flex-wrap gap-2 mb-1">
          <View className="flex-row">
            {[
              { key: "all", label: "All Customers" },
              { key: "vip", label: "VIP Only" },
            ].map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setFilterType(t.key)}
                className={`px-3 py-1.5 rounded-full mr-2 ${
                  filterType === t.key ? "bg-blue-600" : "bg-gray-100"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    filterType === t.key ? "text-white" : "text-gray-600"
                  }`}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View className="flex-row items-center flex-wrap">
            <Text className="text-[11px] font-bold text-gray-500 mr-1.5">VIP Criteria:</Text>
            {[2, 3, 5].map((threshold) => (
              <TouchableOpacity
                key={threshold}
                onPress={() => setVipVisitThreshold(threshold)}
                className={`px-2.5 py-1 rounded-md border mr-1 ${
                  vipVisitThreshold === threshold
                    ? "bg-amber-100 border-amber-400"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <Text
                  className={`text-[10px] font-bold ${
                    vipVisitThreshold === threshold ? "text-amber-800" : "text-gray-600"
                  }`}
                >
                  {threshold} visits
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
      <View className="bg-blue-50 border-b border-blue-100 px-4 py-2">
        <Text className="text-[11px] text-blue-700 font-medium">
          Customers are saved automatically with visit history whenever you create an invoice.
        </Text>
      </View>
      {loading && displayedParties.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={displayedParties}
          keyExtractor={(item, index) => item?._id || `party-${index}`}
          contentContainerStyle={{ padding: 12, paddingBottom: 120, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled={true}
          scrollEnabled={true}
          showsVerticalScrollIndicator={true}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadParties}
              tintColor="#2563EB"
              colors={["#2563EB"]}
            />
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <MaterialIcons name="people-outline" size={52} color="#9CA3AF" />
              <Text className="text-gray-500 font-semibold text-sm mt-3">
                No customers found
              </Text>
              <Text className="text-gray-400 text-xs mt-1">
                Customers will appear here automatically when billing with phone numbers
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            if (!item) return null;
            const isVip = Boolean(item.isRegular || (item.visitCount || 0) >= vipVisitThreshold);
            return (
              <View className="bg-white rounded-xl p-4 mb-3 border border-gray-200 shadow-sm flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <View className="flex-row items-center flex-wrap gap-1.5">
                    <Text className="text-base font-extrabold text-gray-900">
                      {item.name || "Customer"}
                    </Text>
                    {isVip ? (
                      <View className="bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 flex-row items-center">
                        <FontAwesome name="star" size={10} color="#B45309" />
                        <Text className="text-[10px] font-extrabold text-amber-800 ml-1">
                          VIP ({item.visitCount || 0} visits)
                        </Text>
                      </View>
                    ) : (
                      <View className="bg-gray-100 px-2 py-0.5 rounded-full">
                        <Text className="text-[10px] font-medium text-gray-600">
                          {visitLabel(item.visitCount)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-xs text-gray-600 mt-1">
                    📞 +91 {item.phone || item.whatsappNumber || "N/A"}
                  </Text>
                  <View className="flex-row items-center gap-3 mt-1.5 flex-wrap">
                    <Text className="text-[11px] text-gray-500">
                      Spent: <Text className="font-bold text-gray-800">Rs. {item.totalSpent || 0}</Text>
                    </Text>
                    {item.balance > 0 ? (
                      <Text className="text-[11px] text-red-600 font-bold">
                        Udhar: Rs. {item.balance}
                      </Text>
                    ) : null}
                    {item.customDiscountPercent > 0 ? (
                      <Text className="text-[11px] text-emerald-700 font-bold">
                        Perk: {item.customDiscountPercent}% OFF
                      </Text>
                    ) : null}
                    {item.assignedFreebie ? (
                      <Text className="text-[11px] text-purple-700 font-bold">
                        Free: {item.assignedFreebie}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    onPress={() => openWhatsAppOffer(item)}
                    className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 items-center justify-center"
                  >
                    <FontAwesome name="whatsapp" size={18} color="#059669" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => openPerksDialog(item)}
                    className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-200 items-center justify-center"
                  >
                    <Ionicons name="gift-outline" size={18} color="#2563EB" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
      <Modal
        visible={perksModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          Keyboard.dismiss();
          setPerksModalVisible(false);
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

            <View className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[85%] shadow-2xl">
              <View className="flex-row justify-between items-center pb-3 border-b border-gray-100">
                <View>
                  <Text className="text-base font-extrabold text-gray-900">
                    {selectedParty?.name || "Customer Perks"}
                  </Text>
                  <Text className="text-[11px] text-gray-500">Configure VIP status and billing benefits</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    setPerksModalVisible(false);
                  }}
                  className="p-1"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <ScrollView
                className="py-3"
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ paddingBottom: 24 }}
              >
                <View className="flex-row items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-200 mb-3">
                  <View>
                    <Text className="text-xs font-bold text-gray-800">VIP / Regular Member</Text>
                    <Text className="text-[10px] text-gray-500">Unlock special discounts during billing</Text>
                  </View>
                  <Switch
                    value={formIsRegular}
                    onValueChange={setFormIsRegular}
                    trackColor={{ false: "#D1D5DB", true: "#93C5FD" }}
                    thumbColor={formIsRegular ? "#2563EB" : "#9CA3AF"}
                  />
                </View>
                <View className="mb-3">
                  <Text className="text-xs font-bold text-gray-700 mb-1">Custom Discount (%)</Text>
                  <TextInput
                    className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                    placeholder="0"
                    keyboardType="numeric"
                    value={formDiscount}
                    onChangeText={setFormDiscount}
                    returnKeyType="done"
                  />
                </View>
                <View className="mb-5">
                  <Text className="text-xs font-bold text-gray-700 mb-1">Complimentary Freebie Gift</Text>
                  <TextInput
                    className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                    placeholder="e.g. Complimentary Beverage, Free Dessert"
                    value={formFreebie}
                    onChangeText={setFormFreebie}
                    returnKeyType="done"
                    onSubmitEditing={handleSavePerks}
                  />
                </View>
                <TouchableOpacity
                  onPress={handleSavePerks}
                  className="w-full bg-blue-600 py-3.5 rounded-xl items-center shadow"
                >
                  <Text className="text-white font-bold text-sm">Save Customer Perks</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}