import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  ActivityIndicator,
  Switch,
  Platform,
  Modal,
} from "react-native";
import { Ionicons, FontAwesome, FontAwesome5 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Updates from "expo-updates";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, setApiBaseUrl, getApiBaseUrl } from "../config/api";
import {
  checkForAppUpdates,
  applyOtaUpdate,
  openApkDownload,
  CURRENT_APP_VERSION,
} from "../services/updateService";

export default function SettingsScreen({ user, onOpenDrawer, onBack, onLogout, onProfileUpdated }) {
  const [businessName, setBusinessName] = useState(user?.businessName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [gstin, setGstin] = useState(user?.gstin || "");
  const [address, setAddress] = useState(user?.address || "");
  const [upiId, setUpiId] = useState(user?.upiId || "");
  const [logo, setLogo] = useState(user?.logo || "");
  const [printerSize, setPrinterSize] = useState(user?.thermalPrinterSize || "3inch");
  const [customApiUrl, setCustomApiUrl] = useState(getApiBaseUrl());
  const [saving, setSaving] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [waStatus, setWaStatus] = useState("disconnected");
  const [waQr, setWaQr] = useState(null);
  const [waPhone, setWaPhone] = useState(null);
  const [waLoading, setWaLoading] = useState(false);
  const [showPairingInput, setShowPairingInput] = useState(false);
  const [pairingPhone, setPairingPhone] = useState(user?.whatsappNumber || user?.phone || "");
  const [pairingCode, setPairingCode] = useState(null);
  const [pairingLoading, setPairingLoading] = useState(false);

  // Bill Format Settings
  const [billShowLogo, setBillShowLogo] = useState(true);
  const [billShowToken, setBillShowToken] = useState(true);
  const [billShowPhone, setBillShowPhone] = useState(true);
  const [billShowEmail, setBillShowEmail] = useState(true);
  const [billShowGstin, setBillShowGstin] = useState(true);
  const [billShowType, setBillShowType] = useState(true);
  const [billFooter, setBillFooter] = useState("Thank you! Visit again.");
  const [showPreview, setShowPreview] = useState(false);
  const [previewTab, setPreviewTab] = useState("customer");
  const [savingBillFormat, setSavingBillFormat] = useState(false);

  const fetchWaStatus = async () => {
    try {
      const res = await api.whatsapp.getStatus();
      if (res && res.success) {
        setWaStatus(res.status);
        setWaQr(res.qrCode);
        setWaPhone(res.phoneNumber);
      }
    } catch {}
  };

  useEffect(() => {
    fetchWaStatus();
    loadBillFormatSettings();
  }, []);

  const loadBillFormatSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem("billFormatOptions");
      if (stored) {
        const opts = JSON.parse(stored);
        if (opts.showLogo !== undefined) setBillShowLogo(opts.showLogo);
        if (opts.showTokenNumber !== undefined) setBillShowToken(opts.showTokenNumber);
        if (opts.showCustomerPhone !== undefined) setBillShowPhone(opts.showCustomerPhone);
        if (opts.showEmail !== undefined) setBillShowEmail(opts.showEmail);
        if (opts.showGstin !== undefined) setBillShowGstin(opts.showGstin);
        if (opts.showBillType !== undefined) setBillShowType(opts.showBillType);
        if (opts.footerNote) setBillFooter(opts.footerNote);
      }
    } catch {}
  };

  const saveBillFormatSettings = async () => {
    setSavingBillFormat(true);
    try {
      const opts = {
        paperWidth: printerSize,
        showLogo: billShowLogo,
        showTokenNumber: billShowToken,
        showCustomerPhone: billShowPhone,
        showEmail: billShowEmail,
        showGstin: billShowGstin,
        showBillType: billShowType,
        footerNote: billFooter,
      };
      await AsyncStorage.setItem("billFormatOptions", JSON.stringify(opts));
      Alert.alert("Saved", "Bill format settings saved!");
    } catch {
      Alert.alert("Error", "Could not save bill format settings");
    } finally {
      setSavingBillFormat(false);
    }
  };

  useEffect(() => {
    let interval = null;
    if (waStatus === "scan_qr" || waLoading) {
      interval = setInterval(() => {
        fetchWaStatus();
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [waStatus, waLoading]);

  const handleStartWaLink = async (force = false) => {
    setWaLoading(true);
    setPairingCode(null);
    try {
      const res = await api.whatsapp.init(force);
      if (res && res.success) {
        setWaStatus(res.status);
        setWaQr(res.qrCode);
        setWaPhone(res.phoneNumber);
      }
    } catch {
      Alert.alert("Error", "Could not start WhatsApp linking");
    } finally {
      setWaLoading(false);
    }
  };

  const handleGetPairingCode = async () => {
    const raw = (pairingPhone || user?.whatsappNumber || user?.phone || "").replace(/[^0-9]/g, "");
    if (!raw) {
      Alert.alert("Phone Required", "Please enter your WhatsApp phone number with country code (e.g. 919876543210)");
      return;
    }
    const fullNumber = raw.length === 10 ? `91${raw}` : raw;
    setPairingLoading(true);
    setPairingCode(null);
    try {
      const res = await api.whatsapp.getPairingCode(fullNumber);
      if (res && res.success && res.code) {
        setPairingCode(res.code);
      } else {
        Alert.alert("Error", res?.message || "Could not generate pairing code. Please try refreshing QR.");
      }
    } catch (err) {
      Alert.alert("Error", err.message || "Failed to generate pairing code");
    } finally {
      setPairingLoading(false);
    }
  };

  const handleDisconnectWa = async () => {
    Alert.alert(
      "Unlink WhatsApp",
      "Are you sure you want to unlink WhatsApp from this device?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlink",
          style: "destructive",
          onPress: async () => {
            setWaLoading(true);
            try {
              await api.whatsapp.disconnect();
              setWaStatus("disconnected");
              setWaQr(null);
              setWaPhone(null);
            } catch {
              Alert.alert("Error", "Could not unlink WhatsApp");
            } finally {
              setWaLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      const update = await checkForAppUpdates(true);
      if (update && update.hasUpdate) {
        if (update.type === "ota") {
          Alert.alert(
            "Update Ready",
            "A new in-app update is downloaded! Restart to apply changes now?",
            [
              { text: "Later", style: "cancel" },
              { text: "Restart Now", onPress: applyOtaUpdate },
            ]
          );
        } else {
          Alert.alert(
            `New Version ${update.version || ""} Available`,
            update.notes || "A new update is ready for download.",
            [
              { text: "Later", style: "cancel" },
              { text: "Download & Install", onPress: () => openApkDownload(update.apkUrl) },
            ]
          );
        }
      } else {
        Alert.alert("Up to Date", `You are on the latest version (v${CURRENT_APP_VERSION}).`);
      }
    } catch {
      Alert.alert("Update Status", `You are running the latest version (v${CURRENT_APP_VERSION}).`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handlePickLogo = async () => {
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
        setLogo(imageUri);
      }
    } catch (err) {
      Alert.alert("Error", "Could not pick image");
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setApiBaseUrl(customApiUrl);

    const res = await api.auth.updateProfile({
      businessName: businessName.trim(),
      email: email.trim() || undefined,
      gstin: gstin.trim() || undefined,
      address: address.trim() || undefined,
      upiId: upiId.trim() || undefined,
      logo: logo || "",
      thermalPrinterSize: printerSize,
    });
    setSaving(false);

    if (res.success && res.user) {
      if (onProfileUpdated) onProfileUpdated(res.user);
      Alert.alert("Settings Saved", "Business profile updated successfully");
    } else {
      Alert.alert("Error", res.message || "Failed to update profile");
    }
  };

  return (
    <View style={{ flex: 1 }} className="flex-1 bg-gray-50">
      <View className="bg-blue-600 px-4 pt-10 pb-4 flex-row items-center justify-between">
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
          <Text className="text-white text-xl font-bold">Settings</Text>
        </View>
        <TouchableOpacity
          onPress={handleSaveProfile}
          disabled={saving}
          className="bg-white/20 px-3 py-1.5 rounded-lg"
        >
          <Text className="text-white text-xs font-bold">Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
        <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
            Store Profile
          </Text>

          <View className="items-center mb-4">
            {logo ? (
              <View className="items-center">
                <TouchableOpacity onPress={handlePickLogo} className="relative">
                  <Image
                    source={{ uri: logo }}
                    style={{ width: 84, height: 84, borderRadius: 42 }}
                  />
                  <View className="absolute bottom-0 right-0 bg-blue-600 w-7 h-7 rounded-full items-center justify-center border-2 border-white">
                    <Ionicons name="camera" size={14} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setLogo("")} className="mt-2">
                  <Text className="text-xs text-red-500 font-medium">Remove Logo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handlePickLogo}
                className="w-20 h-20 rounded-full bg-blue-50 border-2 border-dashed border-blue-300 items-center justify-center"
              >
                <Ionicons name="camera" size={26} color="#2563EB" />
                <Text className="text-[10px] text-blue-600 font-bold mt-1">Add Logo</Text>
              </TouchableOpacity>
            )}
          </View>

          <View className="mb-3">
            <Text className="text-xs font-bold text-gray-700 mb-1">
              Store / Company Name
            </Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
              value={businessName}
              onChangeText={setBusinessName}
            />
          </View>

          <View className="mb-3">
            <Text className="text-xs font-bold text-gray-700 mb-1">
              Registered Phone Number
            </Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-500"
              value={user?.phone || ""}
              editable={false}
            />
          </View>

          <View className="mb-3">
            <Text className="text-xs font-bold text-gray-700 mb-1">
              Store Email Address
            </Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
              placeholder="e.g. store@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text className="text-[11px] text-gray-400 mt-1">
              Shown on bills & receipts sent to customers.
            </Text>
          </View>

          <View className="mb-3">
            <Text className="text-xs font-bold text-gray-700 mb-1">
              GSTIN Tax Number
            </Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
              placeholder="e.g. 19AAACB1234F1Z5"
              value={gstin}
              onChangeText={setGstin}
              autoCapitalize="characters"
            />
          </View>

          <View className="mb-3">
            <Text className="text-xs font-bold text-gray-700 mb-1">
              UPI ID (for bill QR Code)
            </Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
              placeholder="e.g. business@okaxis"
              value={upiId}
              onChangeText={setUpiId}
            />
          </View>

          <View className="mb-1">
            <Text className="text-xs font-bold text-gray-700 mb-1">
              Store Address
            </Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
              placeholder="Street, City, State, PIN"
              value={address}
              onChangeText={setAddress}
            />
          </View>
        </View>

        {/* BILL FORMAT SETTINGS */}
        <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Bill & Receipt Format
            </Text>
            <TouchableOpacity
              onPress={saveBillFormatSettings}
              disabled={savingBillFormat}
              className="bg-blue-600 px-3 py-1.5 rounded-lg"
            >
              {savingBillFormat ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white text-xs font-bold">Save Format</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Paper Size */}
          <Text className="text-xs font-bold text-gray-700 mb-2">Paper / Print Size</Text>
          <View className="flex-row gap-2 mb-4">
            {["2inch", "3inch", "A4", "A5"].map((size) => (
              <TouchableOpacity
                key={size}
                onPress={() => setPrinterSize(size)}
                className={`flex-1 py-2.5 rounded-xl border items-center ${
                  printerSize === size
                    ? "bg-blue-600 border-blue-600"
                    : "bg-gray-100 border-gray-300"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    printerSize === size ? "text-white" : "text-gray-700"
                  }`}
                >
                  {size}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Toggle Options */}
          <Text className="text-xs font-bold text-gray-700 mb-2">Bill Header & Content</Text>
          {[
            { label: "Show Store Logo", state: billShowLogo, set: setBillShowLogo },
            { label: "Show Bill / Token Number", state: billShowToken, set: setBillShowToken },
            { label: "Show Customer Phone on Bill", state: billShowPhone, set: setBillShowPhone },
            { label: "Show Store Email in Header", state: billShowEmail, set: setBillShowEmail },
            { label: "Show GSTIN in Header", state: billShowGstin, set: setBillShowGstin },
            { label: "Show Bill Type (Cash Sale / Credit)", state: billShowType, set: setBillShowType },
          ].map(({ label, state, set }) => (
            <View key={label} className="flex-row items-center justify-between py-2.5 border-b border-gray-100">
              <Text className="text-xs text-gray-800 font-medium flex-1 pr-2">{label}</Text>
              <Switch
                value={state}
                onValueChange={set}
                trackColor={{ false: "#D1D5DB", true: "#2563EB" }}
                thumbColor={state ? "#FFFFFF" : "#9CA3AF"}
              />
            </View>
          ))}

          {/* Footer Note */}
          <View className="mt-3">
            <Text className="text-xs font-bold text-gray-700 mb-1">Bill Footer Message</Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
              placeholder="Thank you! Visit again."
              value={billFooter}
              onChangeText={setBillFooter}
            />
            <Text className="text-[11px] text-gray-400 mt-1">
              Printed at the bottom of every bill / receipt.
            </Text>
          </View>

          {/* Preview Button */}
          <TouchableOpacity
            onPress={() => setShowPreview(true)}
            className="mt-4 bg-gray-800 py-2.5 rounded-xl flex-row items-center justify-center"
          >
            <Ionicons name="receipt-outline" size={16} color="#FFFFFF" />
            <Text className="text-white text-xs font-bold ml-2">Preview Bill Format</Text>
          </TouchableOpacity>
        </View>

        {/* Preview Modal */}
        <Modal visible={showPreview} animationType="slide" transparent={true}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: "90%" }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "800", color: "#111" }}>Bill Format Preview</Text>
                <TouchableOpacity onPress={() => setShowPreview(false)}>
                  <Ionicons name="close" size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Tabs for Customer vs Cooker */}
              <View style={{ flexDirection: "row", backgroundColor: "#F3F4F6", borderRadius: 10, padding: 3, marginBottom: 10 }}>
                <TouchableOpacity
                  onPress={() => setPreviewTab("customer")}
                  style={{
                    flex: 1,
                    paddingVertical: 6,
                    borderRadius: 8,
                    alignItems: "center",
                    backgroundColor: previewTab === "customer" ? "#FFFFFF" : "transparent",
                    shadowColor: previewTab === "customer" ? "#000" : "transparent",
                    shadowOpacity: 0.05,
                    shadowRadius: 2,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: previewTab === "customer" ? "#1D4ED8" : "#6B7280" }}>
                    Customer Bill (2 Copies)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setPreviewTab("cooker")}
                  style={{
                    flex: 1,
                    paddingVertical: 6,
                    borderRadius: 8,
                    alignItems: "center",
                    backgroundColor: previewTab === "cooker" ? "#FFFFFF" : "transparent",
                    shadowColor: previewTab === "cooker" ? "#000" : "transparent",
                    shadowOpacity: 0.05,
                    shadowRadius: 2,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: previewTab === "cooker" ? "#B45309" : "#6B7280" }}>
                    Cooker Slip (Short KOT)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Compact receipt preview rendered in RN */}
              <ScrollView showsVerticalScrollIndicator={false}>
                {previewTab === "customer" ? (
                  <View style={{ backgroundColor: "#f9fafb", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#e5e7eb", borderStyle: "dashed" }}>
                    <View style={{ alignItems: "center", marginBottom: 6 }}>
                      <Text style={{ fontSize: 9, fontWeight: "800", color: "#666", textTransform: "uppercase", letterSpacing: 1, borderWidth: 1, borderColor: "#ccc", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3 }}>
                        CUSTOMER COPY - 1 & 2
                      </Text>
                    </View>
                    {/* Header */}
                    <View style={{ alignItems: "center", marginBottom: 8 }}>
                      {billShowLogo && user?.logo ? (
                        <Image source={{ uri: user.logo }} style={{ width: 60, height: 60, borderRadius: 8, marginBottom: 4 }} />
                      ) : null}
                      <Text style={{ fontFamily: "monospace", fontSize: 13, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" }}>
                        {user?.businessName || "MY STORE"}
                      </Text>
                      {user?.address ? <Text style={{ fontFamily: "monospace", fontSize: 10, color: "#555", marginTop: 2 }}>{user.address}</Text> : null}
                      {user?.phone ? <Text style={{ fontFamily: "monospace", fontSize: 10, color: "#555" }}>Phone: {user.phone}</Text> : null}
                      {billShowEmail && user?.email ? <Text style={{ fontFamily: "monospace", fontSize: 10, color: "#555" }}>@: {user.email}</Text> : null}
                      {billShowGstin && user?.gstin ? <Text style={{ fontFamily: "monospace", fontSize: 10, color: "#555" }}>GSTIN: {user.gstin}</Text> : null}
                    </View>

                    <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#999", marginVertical: 6 }} />

                    {billShowToken ? (
                      <Text style={{ fontFamily: "monospace", fontSize: 24, fontWeight: "900", textAlign: "center", letterSpacing: 2 }}>1</Text>
                    ) : null}

                    <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#999", marginVertical: 6 }} />

                    <Text style={{ fontFamily: "monospace", fontSize: 10 }}>Bill No: 1</Text>
                    <Text style={{ fontFamily: "monospace", fontSize: 10 }}>Created On: 26/10/26 02:40 PM</Text>
                    {billShowType ? <Text style={{ fontFamily: "monospace", fontSize: 10 }}>Bill To: Cash Sale</Text> : null}
                    {billShowPhone ? <Text style={{ fontFamily: "monospace", fontSize: 10 }}>Bill To: Customer | 9876543210</Text> : null}

                    <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#999", marginVertical: 6 }} />

                    <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: "#333", paddingBottom: 3, marginBottom: 4 }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "700", flex: 3 }}>Item Name</Text>
                      <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "700", width: 28, textAlign: "center" }}>Qty</Text>
                      <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "700", width: 36, textAlign: "right" }}>Rate</Text>
                      <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "700", width: 36, textAlign: "right" }}>Total</Text>
                    </View>
                    <View style={{ flexDirection: "row", paddingVertical: 2 }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 10, flex: 3 }}>Coffee Cappuccino</Text>
                      <Text style={{ fontFamily: "monospace", fontSize: 10, width: 28, textAlign: "center" }}>1</Text>
                      <Text style={{ fontFamily: "monospace", fontSize: 10, width: 36, textAlign: "right" }}>159</Text>
                      <Text style={{ fontFamily: "monospace", fontSize: 10, width: 36, textAlign: "right", fontWeight: "700" }}>159</Text>
                    </View>

                    <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#999", marginVertical: 6 }} />

                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 10 }}>Grand Total</Text>
                      <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "900" }}>Rs. 159</Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 10 }}>Payment</Text>
                      <Text style={{ fontFamily: "monospace", fontSize: 10, fontWeight: "700" }}>CASH</Text>
                    </View>

                    <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#999", marginVertical: 6 }} />
                    <Text style={{ fontFamily: "monospace", fontSize: 10, textAlign: "center", color: "#555" }}>{billFooter}</Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: "#FFFBEB", borderRadius: 12, padding: 12, borderWidth: 2, borderColor: "#B45309" }}>
                    <View style={{ alignItems: "center", marginBottom: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: "900", color: "#B45309", textTransform: "uppercase", letterSpacing: 1 }}>
                        *** COOKER / KITCHEN KOT ***
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#333", marginTop: 2 }}>
                        {user?.businessName || "MY STORE"}
                      </Text>
                    </View>

                    <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#B45309", marginVertical: 6 }} />
                    <Text style={{ fontFamily: "monospace", fontSize: 32, fontWeight: "900", textAlign: "center", letterSpacing: 2, color: "#92400E" }}>
                      TOKEN: #1
                    </Text>
                    <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#B45309", marginVertical: 6 }} />

                    <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "700" }}>Bill No: #1</Text>
                    <Text style={{ fontFamily: "monospace", fontSize: 11 }}>Time: 26/10/26 02:40 PM</Text>
                    <Text style={{ fontFamily: "monospace", fontSize: 11 }}>Customer: Cash Customer</Text>

                    <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#B45309", marginVertical: 6 }} />

                    <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: "#000", paddingBottom: 3, marginBottom: 4 }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "900", flex: 3 }}>ORDERED ITEM</Text>
                      <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "900", width: 40, textAlign: "right" }}>QTY</Text>
                    </View>
                    <View style={{ flexDirection: "row", paddingVertical: 3 }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "700", flex: 3 }}>1. Coffee Cappuccino</Text>
                      <Text style={{ fontFamily: "monospace", fontSize: 15, fontWeight: "900", width: 40, textAlign: "right" }}>x 1</Text>
                    </View>

                    <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#B45309", marginVertical: 6 }} />
                    <Text style={{ fontFamily: "monospace", fontSize: 12, fontWeight: "900", textAlign: "center" }}>
                      TOTAL QUANTITY: 1
                    </Text>
                    <Text style={{ fontSize: 10, color: "#666", textAlign: "center", marginTop: 3 }}>
                      [ Kitchen Copy - Prepare Order ]
                    </Text>
                  </View>
                )}

                <Text style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 8 }}>
                  Paper size: {printerSize} · 2 Customer Bills + 1 Cooker KOT
                </Text>
              </ScrollView>

              <TouchableOpacity
                onPress={() => setShowPreview(false)}
                style={{ backgroundColor: "#1D4ED8", borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 12 }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Close Preview</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <View className="bg-white rounded-xl p-4 mb-6 border border-gray-200 shadow-sm">
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Backend API Endpoint
          </Text>
          <TextInput
            className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
            placeholder="http://10.212.56.136:5000/api"
            value={customApiUrl}
            onChangeText={setCustomApiUrl}
            autoCapitalize="none"
          />

          <View className="flex-row flex-wrap gap-2 mt-2">
            <TouchableOpacity
              onPress={() => {
                const url = "http://localhost:5000/api";
                setCustomApiUrl(url);
                setApiBaseUrl(url);
                fetchWaStatus();
                Alert.alert("API Endpoint Changed", "Switched to Localhost (http://localhost:5000/api)");
              }}
              className="bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg"
            >
              <Text className="text-[11px] font-bold text-blue-700">Local (localhost:5000)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                const url = "http://10.212.56.136:5000/api";
                setCustomApiUrl(url);
                setApiBaseUrl(url);
                fetchWaStatus();
                Alert.alert("API Endpoint Changed", "Switched to Local Wi-Fi (http://10.212.56.136:5000/api)");
              }}
              className="bg-purple-50 border border-purple-200 px-2.5 py-1.5 rounded-lg"
            >
              <Text className="text-[11px] font-bold text-purple-700">Local Wi-Fi (10.212.56.136)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                const url = "https://billing-app-backend-lake.vercel.app/api";
                setCustomApiUrl(url);
                setApiBaseUrl(url);
                fetchWaStatus();
                Alert.alert("API Endpoint Changed", "Switched to Vercel Cloud");
              }}
              className="bg-gray-100 border border-gray-300 px-2.5 py-1.5 rounded-lg"
            >
              <Text className="text-[11px] font-bold text-gray-700">Vercel Cloud</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => {
              setApiBaseUrl(customApiUrl.trim());
              fetchWaStatus();
              Alert.alert("Saved", `API Endpoint saved: ${customApiUrl.trim()}`);
            }}
            className="mt-3 bg-gray-900 py-2 rounded-xl items-center"
          >
            <Text className="text-white text-xs font-bold">Apply & Connect Endpoint</Text>
          </TouchableOpacity>
        </View>

        <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Automatic WhatsApp (Linked Devices)
            </Text>
            <View className="flex-row items-center">
              <View
                className={`w-2.5 h-2.5 rounded-full mr-1.5 ${
                  waStatus === "connected"
                    ? "bg-emerald-500"
                    : waStatus === "scan_qr"
                    ? "bg-amber-500"
                    : "bg-gray-400"
                }`}
              />
              <Text
                className={`text-xs font-bold ${
                  waStatus === "connected"
                    ? "text-emerald-700"
                    : waStatus === "scan_qr"
                    ? "text-amber-700"
                    : "text-gray-500"
                }`}
              >
                {waStatus === "connected"
                  ? "Connected"
                  : waStatus === "scan_qr"
                  ? "Waiting for Scan"
                  : "Not Linked"}
              </Text>
            </View>
          </View>

          <Text className="text-xs text-gray-600 mb-2">
            Send bills and marketing automatically from your WhatsApp without GST, Meta approval, or clicking Send.
          </Text>

          <View className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3">
            <Text className="text-[11px] text-amber-800 font-medium">
              💡 <Text className="font-bold">Tip:</Text> WhatsApp Linked Devices requires a persistent server (like your Local Server or Render/Railway). If using Vercel Serverless, WebSockets may reset. You can also share bills directly to WhatsApp using the green WhatsApp button or PDF Share on every invoice!
            </Text>
          </View>

          {waStatus === "connected" ? (
            <View className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-2">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-xs font-bold text-emerald-900">
                    Linked Phone: +{waPhone || user?.whatsappNumber || user?.phone}
                  </Text>
                  <Text className="text-[11px] text-emerald-700 mt-0.5">
                    Bills are sent automatically from this number.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleDisconnectWa}
                  disabled={waLoading}
                  className="bg-red-100 border border-red-300 px-3 py-1.5 rounded-lg"
                >
                  <Text className="text-red-700 text-xs font-bold">Unlink</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : waStatus === "scan_qr" && waQr ? (
            <View className="items-center bg-gray-50 border border-gray-200 rounded-xl p-4">
              <Text className="text-xs font-bold text-gray-800 mb-2">
                Scan this QR code with WhatsApp:
              </Text>
              <Image
                source={{ uri: waQr }}
                style={{ width: 220, height: 220, borderRadius: 12, backgroundColor: "#FFFFFF" }}
              />
              <View className="mt-3 bg-white p-3 rounded-lg border border-gray-200 w-full">
                <Text className="text-[11px] text-gray-700 font-medium">
                  1. Open WhatsApp on your phone
                </Text>
                <Text className="text-[11px] text-gray-700 font-medium mt-1">
                  2. Tap Settings (or 3 dots) → Linked Devices
                </Text>
                <Text className="text-[11px] text-gray-700 font-medium mt-1">
                  3. Tap Link a Device and point your camera here
                </Text>
              </View>

              <View className="flex-row items-center justify-between w-full mt-3">
                <TouchableOpacity
                  onPress={() => handleStartWaLink(true)}
                  disabled={waLoading}
                  className="flex-row items-center bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg"
                >
                  <Ionicons name="refresh" size={13} color="#2563EB" />
                  <Text className="text-[11px] font-bold text-blue-600 ml-1">
                    Refresh QR
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setShowPairingInput(!showPairingInput)}
                  className="flex-row items-center bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg"
                >
                  <Ionicons name="keypad-outline" size={13} color="#059669" />
                  <Text className="text-[11px] font-bold text-emerald-700 ml-1">
                    {showPairingInput ? "Hide Pairing Code" : "Or use Phone Code"}
                  </Text>
                </TouchableOpacity>
              </View>

              {showPairingInput && (
                <View className="mt-3 w-full bg-white p-3 rounded-lg border border-gray-200">
                  <Text className="text-xs font-bold text-gray-800 mb-1">
                    Link with Phone Number:
                  </Text>
                  <Text className="text-[11px] text-gray-500 mb-2">
                    Enter WhatsApp number with country code:
                  </Text>
                  <View className="flex-row items-center">
                    <TextInput
                      className="flex-1 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs"
                      placeholder="e.g. 919876543210"
                      value={pairingPhone}
                      onChangeText={setPairingPhone}
                      keyboardType="phone-pad"
                    />
                    <TouchableOpacity
                      onPress={handleGetPairingCode}
                      disabled={pairingLoading}
                      className="ml-2 bg-emerald-600 px-3 py-2 rounded-lg"
                    >
                      {pairingLoading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text className="text-white text-xs font-bold">Get Code</Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  {pairingCode ? (
                    <View className="mt-3 bg-emerald-50 border border-emerald-300 rounded-lg p-3 items-center">
                      <Text className="text-[11px] text-emerald-800 font-bold mb-1">
                        Your WhatsApp Pairing Code:
                      </Text>
                      <Text className="text-xl font-mono font-extrabold text-emerald-900 tracking-widest my-1">
                        {pairingCode}
                      </Text>
                      <Text className="text-[10px] text-emerald-700 text-center mt-1">
                        WhatsApp → Linked Devices → Link with phone number instead → Enter this code.
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => handleStartWaLink(true)}
              disabled={waLoading}
              className="bg-emerald-600 py-2.5 rounded-xl flex-row items-center justify-center shadow-sm"
            >
              {waLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <FontAwesome name="whatsapp" size={18} color="#FFFFFF" />
                  <Text className="text-white font-bold text-xs ml-2">
                    Link WhatsApp (Scan QR)
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              In-App Updates
            </Text>
            <View className="bg-blue-100 px-2.5 py-0.5 rounded-full">
              <Text className="text-[11px] text-blue-700 font-extrabold">
                v{CURRENT_APP_VERSION}
              </Text>
            </View>
          </View>
          <Text className="text-xs text-gray-600 mb-3">
            In-app OTA and APK updates enabled. The app updates automatically so you don't need to reinstall manually.
          </Text>
          <TouchableOpacity
            onPress={handleCheckForUpdates}
            disabled={checkingUpdate}
            className="bg-blue-50 border border-blue-200 py-2.5 rounded-xl flex-row items-center justify-center"
          >
            {checkingUpdate ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <>
                <Ionicons name="cloud-download-outline" size={18} color="#2563EB" />
                <Text className="text-blue-600 font-bold text-xs ml-1.5">
                  Check for App Updates
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={onLogout}
          className="w-full bg-red-50 border border-red-200 py-3.5 rounded-xl items-center mb-8"
        >
          <Text className="text-red-600 font-bold text-sm">Logout Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
