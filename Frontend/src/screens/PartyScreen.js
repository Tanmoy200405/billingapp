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
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { api } from "../config/api";
import { downloadReportFile } from "../utils/reportDownloader";
import { getCachedData, setCachedData, getMemoryCachedData } from "../utils/localCache";
import { useResponsive, ResponsiveContainer } from "../utils/responsive";

export default function PartyScreen({ user, isActive = true, onProfileUpdated, onOpenDrawer, onBack }) {
  const { isWide, gridColumns, headerTopPadding } = useResponsive();
  const [parties, setParties] = useState(() => getMemoryCachedData("parties_all") || []);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [vipVisitThreshold, setVipVisitThreshold] = useState(user?.vipVisitThreshold || 3);
  const [vipInputText, setVipInputText] = useState(String(user?.vipVisitThreshold || 3));
  const [savingVipThreshold, setSavingVipThreshold] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [importingPdf, setImportingPdf] = useState(false);
  const [perksModalVisible, setPerksModalVisible] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);
  const [formIsRegular, setFormIsRegular] = useState(false);
  const [formDiscount, setFormDiscount] = useState("0");
  const [formFreebie, setFormFreebie] = useState("");
  const [savingPerks, setSavingPerks] = useState(false);

  // Edit / Add Party Modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingParty, setEditingParty] = useState(null);
  const [partyFormName, setPartyFormName] = useState("");
  const [partyFormPhone, setPartyFormPhone] = useState("");
  const [partyFormType, setPartyFormType] = useState("customer");
  const [partyFormAddress, setPartyFormAddress] = useState("");
  const [partyFormGstin, setPartyFormGstin] = useState("");
  const [partyFormBalance, setPartyFormBalance] = useState("0");
  const [partyFormVisits, setPartyFormVisits] = useState("1");
  const [partyFormIsRegular, setPartyFormIsRegular] = useState(false);
  const [partyFormDiscount, setPartyFormDiscount] = useState("0");
  const [partyFormFreebie, setPartyFormFreebie] = useState("");
  const [savingParty, setSavingParty] = useState(false);

  useEffect(() => {
    if (user?.vipVisitThreshold && user.vipVisitThreshold >= 1) {
      setVipVisitThreshold(user.vipVisitThreshold);
      setVipInputText(String(user.vipVisitThreshold));
      AsyncStorage.setItem("party_vip_threshold", String(user.vipVisitThreshold)).catch(() => {});
      return;
    }
    AsyncStorage.getItem("party_vip_threshold").then((val) => {
      if (val) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed >= 1) {
          setVipVisitThreshold(parsed);
          setVipInputText(String(parsed));
        }
      }
    }).catch(() => {});
  }, [user?.vipVisitThreshold]);

  const updateVipThreshold = async (newVal, showConfirm = true) => {
    const num = parseInt(String(newVal).replace(/[^0-9]/g, ""), 10);
    if (isNaN(num) || num < 1) {
      Alert.alert("Invalid Number", "Please enter 1 or more visits for VIP criteria.");
      return;
    }
    setVipVisitThreshold(num);
    setVipInputText(String(num));
    AsyncStorage.setItem("party_vip_threshold", String(num)).catch(() => {});
    setSavingVipThreshold(true);
    try {
      const res = await api.auth.updateProfile({ vipVisitThreshold: num });
      if (res && res.success && res.user) {
        if (onProfileUpdated) onProfileUpdated(res.user);
      }
      if (showConfirm) {
        Alert.alert("VIP Criteria Saved", `Customers with ${num}+ visits are now marked as VIP.`);
      }
    } catch {
      if (showConfirm) {
        Alert.alert("VIP Criteria Updated", `VIP threshold set to ${num}+ visits.`);
      }
    } finally {
      setSavingVipThreshold(false);
    }
  };

  const loadParties = useCallback(async () => {
    const isUnfiltered = !search && filterType !== "customer" && filterType !== "supplier";
    let hasCached = false;
    if (isUnfiltered) {
      const cached = await getCachedData("parties_all");
      if (Array.isArray(cached) && cached.length > 0) {
        setParties(cached);
        hasCached = true;
      }
    }
    if (!hasCached) setLoading(true);
    let query = search ? `search=${encodeURIComponent(search)}` : "";
    if (filterType === "customer" || filterType === "supplier") {
      query += `${query ? "&" : ""}type=${filterType}`;
    }
    const res = await api.parties.getAll(query);
    setLoading(false);
    if (res && res.success && res.parties) {
      setParties(res.parties);
      if (isUnfiltered) {
        setCachedData("parties_all", res.parties);
      }
    }
  }, [search, filterType]);
  useEffect(() => {
    if (isActive) {
      loadParties();
    }
  }, [isActive]);

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
          if (file.size && file.size > 100 * 1024 * 1024) {
            Alert.alert("File Too Large", "Please choose a PDF smaller than 100 MB.");
            return;
          }
          setImportingPdf(true);
          try {
            const res = await api.parties.importPdfFile(file);
            if (res && res.success) {
              Alert.alert(
                "PDF Party List Imported!",
                `Added: ${res.addedCount || 0}\nUpdated: ${res.updatedCount || 0}\nAlready Existed (Skipped): ${res.skippedCount || 0}`
              );
              loadParties();
            } else {
              Alert.alert(
                "Import Notice",
                res?.message || "Could not extract customer list from this PDF."
              );
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
        const res = await api.parties.importPdfFile(asset.uri);
        if (res && res.success) {
          Alert.alert(
            "PDF Party List Imported!",
            `Added: ${res.addedCount || 0}\nUpdated: ${res.updatedCount || 0}\nAlready Existed (Skipped): ${res.skippedCount || 0}`
          );
          loadParties();
        } else {
          Alert.alert(
            "Import Notice",
            res?.message || "Could not extract customer list from this PDF."
          );
        }
      } finally {
        FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => {});
      }
    } catch (err) {
      Alert.alert("Import Error", err.message || "Failed to import party list from PDF.");
    } finally {
      setImportingPdf(false);
    }
  };
  const handleSavePerks = async () => {
    Keyboard.dismiss();
    if (!selectedParty) return;
    setSavingPerks(true);
    try {
      const payload = {
        isRegular: Boolean(formIsRegular),
        customDiscountPercent: Math.max(0, Math.min(100, Number(formDiscount) || 0)),
        assignedFreebie: formFreebie.trim(),
      };
      const res = await api.parties.updateRegularPerks(selectedParty._id, payload);
      if (res && res.success) {
        setParties((prev) =>
          prev.map((p) => (p._id === selectedParty._id ? { ...p, ...payload, ...(res.party || {}) } : p))
        );
        setPerksModalVisible(false);
        loadParties();
        Alert.alert("Saved", `VIP & perks updated for ${selectedParty.name}`);
      } else {
        Alert.alert("Error", res?.message || "Failed to update perks");
      }
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to update perks");
    } finally {
      setSavingPerks(false);
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

  const openAddPartyModal = () => {
    setEditingParty(null);
    setPartyFormName("");
    setPartyFormPhone("");
    setPartyFormType("customer");
    setPartyFormAddress("");
    setPartyFormGstin("");
    setPartyFormBalance("0");
    setPartyFormVisits("1");
    setPartyFormIsRegular(false);
    setPartyFormDiscount("0");
    setPartyFormFreebie("");
    setEditModalVisible(true);
  };

  const openEditPartyModal = (party) => {
    setEditingParty(party);
    setPartyFormName(party.name || "");
    setPartyFormPhone(party.phone || party.whatsappNumber || "");
    setPartyFormType(party.type || "customer");
    setPartyFormAddress(party.billingAddress || "");
    setPartyFormGstin(party.gstin || "");
    setPartyFormBalance(String(party.balance || 0));
    setPartyFormVisits(String(party.visitCount ?? 1));
    setPartyFormIsRegular(Boolean(party.isRegular || (party.visitCount || 0) >= vipVisitThreshold));
    setPartyFormDiscount(String(party.customDiscountPercent || 0));
    setPartyFormFreebie(party.assignedFreebie || "");
    setEditModalVisible(true);
  };

  const handleSaveParty = async () => {
    Keyboard.dismiss();
    const cleanName = partyFormName.trim();
    const cleanPhone = partyFormPhone.replace(/[^0-9]/g, "");
    if (!cleanName || !cleanPhone) {
      Alert.alert("Required", "Customer name and phone number are required.");
      return;
    }

    setSavingParty(true);
    try {
      const payload = {
        name: cleanName,
        phone: cleanPhone,
        whatsappNumber: cleanPhone,
        type: partyFormType,
        billingAddress: partyFormAddress.trim(),
        gstin: partyFormGstin.trim().toUpperCase(),
        balance: Number(partyFormBalance) || 0,
        visitCount: Math.max(0, parseInt(partyFormVisits, 10) || 0),
        isRegular: Boolean(partyFormIsRegular),
        customDiscountPercent: Math.max(0, Math.min(100, Number(partyFormDiscount) || 0)),
        assignedFreebie: partyFormFreebie.trim(),
      };

      const res = editingParty
        ? await api.parties.update(editingParty._id, payload)
        : await api.parties.create({ ...payload, openingBalance: payload.balance });

      if (res && res.success) {
        setEditModalVisible(false);
        loadParties();
        Alert.alert("Saved", editingParty ? "Party updated successfully." : "Party added successfully.");
      } else {
        Alert.alert("Error", res?.message || "Failed to save party.");
      }
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to save party.");
    } finally {
      setSavingParty(false);
    }
  };

  const executeDeleteParty = async (partyId) => {
    try {
      const res = await api.parties.delete(partyId);
      if (res && res.success) {
        loadParties();
        if (Platform.OS === "web") {
          window.alert("Customer deleted successfully.");
        } else {
          Alert.alert("Deleted", "Customer deleted successfully.");
        }
      } else {
        Alert.alert("Error", res?.message || "Failed to delete customer.");
      }
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to delete customer.");
    }
  };

  const handleDeleteParty = (party) => {
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${party.name}" from your party list?`)) {
        executeDeleteParty(party._id);
      }
      return;
    }
    Alert.alert(
      "Delete Customer",
      `Are you sure you want to delete "${party.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => executeDeleteParty(party._id),
        },
      ]
    );
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
      <View style={{ paddingTop: headerTopPadding }} className="bg-blue-600 px-4 pb-4">
        <ResponsiveContainer maxWidth={1200}>
        <View className="flex-row items-center justify-between mb-2.5">
          <View className="flex-row items-center flex-1 mr-2">
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
            <View>
              <Text className="text-white text-xl font-bold">Customers</Text>
              <Text className="text-blue-200 text-[11px]">
                {parties.length} total · {vipCount} VIP (≥{vipVisitThreshold} visits)
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={openAddPartyModal}
            className="bg-white px-3 py-1.5 rounded-xl flex-row items-center shadow-xs"
          >
            <Ionicons name="person-add-outline" size={14} color="#2563EB" />
            <Text className="text-blue-600 font-bold text-xs ml-1">+ Add</Text>
          </TouchableOpacity>
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
        </ResponsiveContainer>
      </View>
      <View className="bg-white border-b border-gray-200 px-3 py-2">
        <ResponsiveContainer maxWidth={1200}>
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
          <View className="flex-row items-center flex-wrap gap-1">
            <Text className="text-[11px] font-bold text-gray-500 mr-1">VIP Criteria (visits ≥):</Text>
            {[2, 3, 5].map((threshold) => (
              <TouchableOpacity
                key={threshold}
                onPress={() => updateVipThreshold(threshold)}
                className={`px-2 py-1 rounded-md border ${
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
                  {threshold}
                </Text>
              </TouchableOpacity>
            ))}
            <View className="flex-row items-center bg-gray-100 border border-gray-300 rounded-lg px-1.5 py-0.5 ml-1">
              <TextInput
                style={{ width: 42, height: 26, paddingVertical: 0, textAlign: "center", fontSize: 12, fontWeight: "700", color: "#1F2937" }}
                keyboardType="numeric"
                value={vipInputText}
                onChangeText={(txt) => {
                  const clean = txt.replace(/[^0-9]/g, "");
                  setVipInputText(clean);
                }}
                onSubmitEditing={() => {
                  Keyboard.dismiss();
                  updateVipThreshold(vipInputText || 3, true);
                }}
                maxLength={3}
                placeholder="3"
                placeholderTextColor="#9CA3AF"
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  updateVipThreshold(vipInputText || 3, true);
                }}
                disabled={savingVipThreshold}
                className="bg-amber-500 px-2 py-1 rounded ml-1"
              >
                <Text className="text-[10px] font-extrabold text-white">
                  {savingVipThreshold ? "..." : "Set"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </ResponsiveContainer>
      </View>
      <View className="bg-blue-50 border-b border-blue-100 px-4 py-2">
        <ResponsiveContainer maxWidth={1200}>
          <Text className="text-[11px] text-blue-700 font-medium">
            Customers are saved automatically with visit history whenever you create an invoice.
          </Text>
        </ResponsiveContainer>
      </View>
      {loading && displayedParties.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          key={`party-cols-${gridColumns}`}
          numColumns={gridColumns}
          columnWrapperStyle={gridColumns > 1 ? { gap: 12 } : undefined}
          style={{ flex: 1, width: "100%", maxWidth: 1200, alignSelf: "center" }}
          data={displayedParties}
          keyExtractor={(item, index) => item?._id || `party-${index}`}
          contentContainerStyle={{ padding: isWide ? 16 : 12, paddingBottom: 120, flexGrow: 1 }}
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
              <View
                style={gridColumns > 1 ? { flex: 1, maxWidth: `${100 / gridColumns - 1}%` } : undefined}
                className="bg-white rounded-xl p-4 mb-3 border border-gray-200 shadow-sm flex-row items-center justify-between"
              >
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
                <View className="flex-row items-center gap-1.5">
                  <TouchableOpacity
                    onPress={() => openWhatsAppOffer(item)}
                    className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 items-center justify-center"
                  >
                    <FontAwesome name="whatsapp" size={16} color="#059669" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => openPerksDialog(item)}
                    className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 items-center justify-center"
                  >
                    <Ionicons name="gift-outline" size={16} color="#D97706" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => openEditPartyModal(item)}
                    className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 items-center justify-center"
                  >
                    <Ionicons name="create-outline" size={16} color="#2563EB" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteParty(item)}
                    className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 items-center justify-center"
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
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
                  disabled={savingPerks}
                  className="w-full bg-blue-600 py-3.5 rounded-xl items-center shadow flex-row justify-center"
                >
                  {savingPerks ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="text-white font-bold text-sm">Save Customer Perks</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit / Add Party Modal ── */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          Keyboard.dismiss();
          setEditModalVisible(false);
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
                <Text className="text-base font-extrabold text-gray-900">
                  {editingParty ? "Edit Customer / Party" : "Add New Customer / Party"}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    Keyboard.dismiss();
                    setEditModalVisible(false);
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
                contentContainerStyle={{ paddingBottom: 32 }}
              >
                <View className="mb-3">
                  <Text className="text-xs font-bold text-gray-700 mb-1">Party Name *</Text>
                  <TextInput
                    className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900"
                    placeholder="Customer or supplier name"
                    value={partyFormName}
                    onChangeText={setPartyFormName}
                  />
                </View>

                <View className="mb-3">
                  <Text className="text-xs font-bold text-gray-700 mb-1">Phone / WhatsApp Number *</Text>
                  <TextInput
                    className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900"
                    placeholder="10-digit mobile number"
                    keyboardType="phone-pad"
                    value={partyFormPhone}
                    onChangeText={setPartyFormPhone}
                    maxLength={15}
                  />
                </View>

                <View className="mb-3">
                  <Text className="text-xs font-bold text-gray-700 mb-1">Party Type</Text>
                  <View className="flex-row gap-2">
                    {["customer", "supplier"].map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setPartyFormType(t)}
                        className={`flex-1 py-2 rounded-xl border items-center ${
                          partyFormType === t
                            ? "bg-blue-600 border-blue-600"
                            : "bg-gray-100 border-gray-300"
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold capitalize ${
                            partyFormType === t ? "text-white" : "text-gray-700"
                          }`}
                        >
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View className="flex-row gap-3 mb-3">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-gray-700 mb-1">Udhar Balance (Rs)</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900"
                      placeholder="0"
                      keyboardType="numeric"
                      value={partyFormBalance}
                      onChangeText={setPartyFormBalance}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-gray-700 mb-1">Visit Count</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900"
                      placeholder="1"
                      keyboardType="numeric"
                      value={partyFormVisits}
                      onChangeText={setPartyFormVisits}
                    />
                  </View>
                </View>

                <View className="flex-row items-center justify-between bg-amber-50 p-3 rounded-xl border border-amber-200 mb-3">
                  <View>
                    <Text className="text-xs font-bold text-gray-800">VIP / Regular Member</Text>
                    <Text className="text-[10px] text-gray-500">Always treat this customer as VIP</Text>
                  </View>
                  <Switch
                    value={partyFormIsRegular}
                    onValueChange={setPartyFormIsRegular}
                    trackColor={{ false: "#D1D5DB", true: "#FBBF24" }}
                    thumbColor={partyFormIsRegular ? "#D97706" : "#9CA3AF"}
                  />
                </View>

                <View className="flex-row gap-3 mb-3">
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-gray-700 mb-1">VIP Discount (%)</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900"
                      placeholder="0"
                      keyboardType="numeric"
                      value={partyFormDiscount}
                      onChangeText={setPartyFormDiscount}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-gray-700 mb-1">Freebie Gift</Text>
                    <TextInput
                      className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900"
                      placeholder="e.g. Cold Drink"
                      value={partyFormFreebie}
                      onChangeText={setPartyFormFreebie}
                    />
                  </View>
                </View>

                <View className="mb-3">
                  <Text className="text-xs font-bold text-gray-700 mb-1">Billing Address (Optional)</Text>
                  <TextInput
                    className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900"
                    placeholder="Street, city, pincode"
                    value={partyFormAddress}
                    onChangeText={setPartyFormAddress}
                  />
                </View>

                <View className="mb-5">
                  <Text className="text-xs font-bold text-gray-700 mb-1">GSTIN (Optional)</Text>
                  <TextInput
                    className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900"
                    placeholder="e.g. 19AAACB1234F1Z5"
                    autoCapitalize="characters"
                    value={partyFormGstin}
                    onChangeText={setPartyFormGstin}
                  />
                </View>

                <TouchableOpacity
                  onPress={handleSaveParty}
                  disabled={savingParty}
                  className="w-full bg-blue-600 py-3.5 rounded-xl items-center shadow flex-row justify-center"
                >
                  {savingParty ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="text-white font-bold text-sm">
                      {editingParty ? "Update Customer" : "Save Customer"}
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}