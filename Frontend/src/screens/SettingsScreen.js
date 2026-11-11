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
  Linking,
  RefreshControl,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons, FontAwesome, FontAwesome5, MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, setApiBaseUrl, getApiBaseUrl } from "../config/api";
import {
  checkForAppUpdates,
  applyOtaUpdate,
  openApkDownload,
  CURRENT_APP_VERSION,
  GITHUB_RELEASES_URL,
} from "../services/updateService";
import { printTestSlip, INVOICE_STYLES } from "../utils/receiptPdfGenerator";
import { useResponsive, ResponsiveContainer } from "../utils/responsive";

export default function SettingsScreen({ user, onOpenDrawer, onBack, onLogout, onProfileUpdated, initialTab = "profile" }) {
  const { isWide, headerTopPadding } = useResponsive();
  const [activeTab, setActiveTab] = useState(initialTab || "profile");
  const [vipVisitThreshold, setVipVisitThreshold] = useState(user?.vipVisitThreshold || 3);
  const [vipInputText, setVipInputText] = useState(String(user?.vipVisitThreshold || 3));
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (user?.vipVisitThreshold) {
      setVipVisitThreshold(user.vipVisitThreshold);
      setVipInputText(String(user.vipVisitThreshold));
    }
  }, [user?.vipVisitThreshold]);
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [businessName, setBusinessName] = useState(user?.businessName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [gstin, setGstin] = useState(user?.gstin || "");
  const [address, setAddress] = useState(user?.address || "");
  const [upiId, setUpiId] = useState(user?.upiId || "");
  const [logo, setLogo] = useState(user?.logo || "");
  const [invoiceStyle, setInvoiceStyle] = useState(user?.invoiceStyle || "modern_zudio");
  const [saving, setSaving] = useState(false);
  const [printerSize, setPrinterSize] = useState(user?.thermalPrinterSize || "2inch");
  const [printTarget, setPrintTarget] = useState("both");
  const [billShowLogo, setBillShowLogo] = useState(true);
  const [billShowToken, setBillShowToken] = useState(true);
  const [billShowPhone, setBillShowPhone] = useState(true);
  const [billShowEmail, setBillShowEmail] = useState(true);
  const [billShowGstin, setBillShowGstin] = useState(true);
  const [billShowType, setBillShowType] = useState(true);
  const [billFooter, setBillFooter] = useState("Thank you! Visit again.");
  const [showPreview, setShowPreview] = useState(false);
  const [previewTab, setPreviewTab] = useState("both");
  const [savingBillFormat, setSavingBillFormat] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [waStatus, setWaStatus] = useState("disconnected");
  const [waQr, setWaQr] = useState(null);
  const [waPhone, setWaPhone] = useState(null);
  const [waLoading, setWaLoading] = useState(false);
  const [showPairingInput, setShowPairingInput] = useState(false);
  const [pairingPhone, setPairingPhone] = useState(user?.whatsappNumber || user?.phone || "");
  const [pairingCode, setPairingCode] = useState(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  useEffect(() => {
    fetchWaStatus();
    loadBillFormatSettings();
  }, []);
  const loadBillFormatSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem("billFormatOptions");
      if (stored) {
        const opts = JSON.parse(stored);
        if (opts.paperWidth) setPrinterSize(opts.paperWidth);
        if (opts.invoiceStyle) setInvoiceStyle(opts.invoiceStyle);
        if (opts.printTarget) {
          setPrintTarget(opts.printTarget);
          setPreviewTab(opts.printTarget === "kot" ? "cooker" : opts.printTarget === "customer" ? "customer" : "both");
        }
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
        invoiceStyle,
        printTarget,
        showLogo: billShowLogo,
        showTokenNumber: billShowToken,
        showCustomerPhone: billShowPhone,
        showEmail: billShowEmail,
        showGstin: billShowGstin,
        showBillType: billShowType,
        footerNote: billFooter,
      };
      await AsyncStorage.setItem("billFormatOptions", JSON.stringify(opts));
      await api.auth.updateProfile({
        invoiceStyle,
        thermalPrinterSize: printerSize,
      });
      Alert.alert(
        "Saved",
        `Printer & Invoice settings updated! Active style: ${
          INVOICE_STYLES.find((s) => s.id === invoiceStyle)?.name || invoiceStyle
        }`
      );
    } catch {
      Alert.alert("Error", "Could not save printer settings");
    } finally {
      setSavingBillFormat(false);
    }
  };
  const handleTestPrint = async () => {
    setTestingPrinter(true);
    try {
      const storeData = {
        businessName: businessName || user?.businessName || "My Store",
        phone: user?.phone || "",
        address: address || user?.address || "",
        email: email || user?.email || "",
        gstin: gstin || user?.gstin || "",
        logo: logo || user?.logo || "",
      };
      const opts = {
        paperWidth: printerSize,
        invoiceStyle,
        printTarget,
        showLogo: billShowLogo,
        showTokenNumber: billShowToken,
        showCustomerPhone: billShowPhone,
        showEmail: billShowEmail,
        showGstin: billShowGstin,
        showBillType: billShowType,
        footerNote: billFooter,
      };
      await printTestSlip(storeData, opts, printTarget);
    } catch (err) {
      Alert.alert("Print Notice", err.message || "Could not launch print service");
    } finally {
      setTestingPrinter(false);
    }
  };
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
  const handlePullRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchWaStatus();
      if (onProfileUpdated && user) {
        const res = await api.auth.getMe();
        if (res && res.success && res.user) {
          onProfileUpdated(res.user);
        }
      }
    } catch {}
    finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    let interval = null;
    if (waStatus === "scan_qr" || waLoading || pairingCode) {
      interval = setInterval(() => {
        fetchWaStatus();
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [waStatus, waLoading, pairingCode]);
  const handleStartWaLink = async (force = false) => {
    setWaLoading(true);
    setPairingCode(null);
    try {
      const res = await api.whatsapp.init(force);
      if (res && res.success) {
        setWaStatus(res.status);
        setWaQr(res.qrCode || null);
        setWaPhone(res.phoneNumber || null);
        if (!res.qrCode && res.status !== "connected") {
          setWaStatus("scan_qr");
        }
      } else {
        Alert.alert(
          "WhatsApp Notice",
          res?.message || "Could not connect to WhatsApp backend server. Please verify backend connectivity."
        );
      }
    } catch (err) {
      Alert.alert("Error", err.message || "Could not start WhatsApp linking");
    } finally {
      setWaLoading(false);
    }
  };
  const startPairingPolling = () => {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await api.whatsapp.getStatus();
        if (res && res.success && res.status === "connected") {
          clearInterval(interval);
          setWaStatus("connected");
          setWaPhone(res.phoneNumber);
          setPairingCode(null);
          setShowPairingInput(false);
          Alert.alert(
            "WhatsApp 24/7 Linked!",
            `Successfully connected WhatsApp (+${res.phoneNumber || "linked"}). Baileys multi-day persistent sync is active!`
          );
        }
      } catch {}
      if (attempts >= 30) {
        clearInterval(interval);
      }
    }, 2500);
  };
  const handleGetPairingCode = async () => {
    let raw = (pairingPhone || user?.whatsappNumber || user?.phone || "").replace(/[^0-9]/g, "");
    if (!raw) {
      Alert.alert("Phone Required", "Please enter your 10-digit WhatsApp phone number");
      return;
    }
    raw = raw.replace(/^0+/, "");
    if (raw.startsWith("91") && raw.length === 12) {
      raw = raw.slice(2);
    }
    if (raw.length !== 10) {
      Alert.alert("Invalid Phone", "Please enter a valid 10-digit mobile number (e.g. 9876543210)");
      return;
    }
    const fullNumber = `91${raw}`;
    setPairingLoading(true);
    setPairingCode(null);
    try {
      const res = await api.whatsapp.getPairingCode(fullNumber);
      if (res && res.success && res.code) {
        setPairingCode(res.code);
        startPairingPolling();
      } else {
        Alert.alert("Notice", res?.message || "Could not generate pairing code. You can scan the QR code.");
      }
    } catch (err) {
      Alert.alert("Notice", err.message || "Failed to generate pairing code. Please try QR code scan.");
    } finally {
      setPairingLoading(false);
    }
  };
  const handleDisconnectWa = async () => {
    Alert.alert(
      "Unlink WhatsApp",
      "Are you sure you want to unlink WhatsApp from this device? Multi-day sync will be stopped.",
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
        const imageUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setLogo(imageUri);
      }
    } catch (err) {
      Alert.alert("Error", "Could not pick image");
    }
  };
    const handleSaveProfile = async () => {
    setSaving(true);
    const thresholdVal = Math.max(1, parseInt(vipInputText || vipVisitThreshold, 10) || 3);
    setVipVisitThreshold(thresholdVal);
    setVipInputText(String(thresholdVal));
    AsyncStorage.setItem("party_vip_threshold", String(thresholdVal)).catch(() => {});
    const res = await api.auth.updateProfile({
      businessName: businessName.trim(),
      email: email.trim() || undefined,
      gstin: gstin.trim() || undefined,
      address: address.trim() || undefined,
      upiId: upiId.trim() || undefined,
      logo: logo || "",
      invoiceStyle,
      thermalPrinterSize: printerSize,
      vipVisitThreshold: thresholdVal,
    });
    setSaving(false);
    if (res.success && res.user) {
      if (onProfileUpdated) onProfileUpdated(res.user);
      Alert.alert("Settings Saved", "Profile & Business configurations updated successfully");
    } else {
      Alert.alert("Error", res.message || "Failed to update profile");
    }
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
            `New Version ${update.version || CURRENT_APP_VERSION} Available!`,
            `${update.notes || "A new update is ready for download."}\n\nDirect Download Link:\n${update.apkUrl || GITHUB_RELEASES_URL}`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Download APK",
                onPress: () =>
                  openApkDownload(
                    update.apkUrl || GITHUB_RELEASES_URL
                  ),
              },
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
  return (
    <View style={{ flex: 1 }} className="flex-1 bg-gray-50">
      <View style={{ paddingTop: headerTopPadding }} className="bg-blue-600 px-4 pb-3">
        <ResponsiveContainer maxWidth={920} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View className="flex-row items-center">
          {!isWide && (
            <TouchableOpacity onPress={onOpenDrawer} className="mr-2">
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
          <Text className="text-white text-xl font-bold">Settings & Store</Text>
        </View>
        <TouchableOpacity
          onPress={handleSaveProfile}
          disabled={saving}
          className="bg-white/20 px-3 py-1.5 rounded-lg flex-row items-center"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
              <Text className="text-white text-xs font-bold ml-1">Save All</Text>
            </>
          )}
        </TouchableOpacity>
        </ResponsiveContainer>
      </View>
      <View className="bg-blue-700 px-2 py-2">
        <ResponsiveContainer maxWidth={920} style={{ flexDirection: "row", justifyContent: "space-around" }}>
        {[
          { key: "profile", label: "Profile", icon: "storefront-outline" },
          { key: "printer", label: "Printer & Bills", icon: "print-outline" },
          { key: "whatsapp", label: "WhatsApp 24/7", icon: "logo-whatsapp" },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            className={`flex-row items-center px-3 py-2 rounded-xl ${
              activeTab === tab.key ? "bg-white shadow-xs" : "bg-transparent"
            }`}
          >
            <Ionicons
              name={tab.icon}
              size={15}
              color={activeTab === tab.key ? "#2563EB" : "#BFDBFE"}
            />
            <Text
              className={`text-xs font-bold ml-1.5 ${
                activeTab === tab.key ? "text-blue-700" : "text-blue-100"
              }`}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
        </ResponsiveContainer>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: isWide ? 20 : 14, paddingBottom: 120, flexGrow: 1 }}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          nestedScrollEnabled={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handlePullRefresh}
              tintColor="#2563EB"
              colors={["#2563EB"]}
            />
          }
        >
        <ResponsiveContainer maxWidth={920}>
        {activeTab === "profile" && (
          <View>
            <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Store Identity & Branding
                </Text>
                <View className="bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  <Text className="text-[10px] text-blue-700 font-bold">Domain: Profile</Text>
                </View>
              </View>
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
                <Text className="text-xs font-bold text-gray-700 mb-1">Store / Business Name</Text>
                <TextInput
                  className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-semibold"
                  value={businessName}
                  onChangeText={setBusinessName}
                  placeholder="e.g. Chai & More Bistro"
                />
              </View>
              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-700 mb-1">Registered Phone Number</Text>
                <TextInput
                  className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-500"
                  value={user?.phone || ""}
                  editable={false}
                />
              </View>
              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-700 mb-1">Store Email Address</Text>
                <TextInput
                  className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
                  placeholder="e.g. store@example.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text className="text-[11px] text-gray-400 mt-1">
                  Shown on receipts and digital bills sent to customers.
                </Text>
              </View>
              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-700 mb-1">GSTIN Tax Number</Text>
                <TextInput
                  className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
                  placeholder="e.g. 19AAACB1234F1Z5"
                  value={gstin}
                  onChangeText={setGstin}
                  autoCapitalize="characters"
                />
              </View>
              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-700 mb-1">UPI ID (for Bill QR Code)</Text>
                <TextInput
                  className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
                  placeholder="e.g. storename@okaxis"
                  value={upiId}
                  onChangeText={setUpiId}
                />
              </View>
              <View className="mb-2">
                <Text className="text-xs font-bold text-gray-700 mb-1">Store Address</Text>
                <TextInput
                  className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
                  placeholder="Street, City, State, PIN"
                  value={address}
                  onChangeText={setAddress}
                />
              </View>
              <View className="mb-3 pt-2 border-t border-gray-100">
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="text-xs font-bold text-gray-700">VIP Qualification (Visits)</Text>
                  <Text className="text-[11px] font-bold text-blue-600">{vipVisitThreshold} Visits</Text>
                </View>
                <Text className="text-[11px] text-gray-500 mb-2">
                  Customers reaching this number of visits are dynamically awarded VIP privileges.
                </Text>
                <View className="flex-row items-center gap-2">
                  {[2, 3, 4, 5].map((threshold) => (
                    <TouchableOpacity
                      key={threshold}
                      onPress={() => {
                        setVipVisitThreshold(threshold);
                        setVipInputText(String(threshold));
                      }}
                      className={`flex-1 py-2 rounded-xl border items-center ${
                        vipVisitThreshold === threshold
                          ? "bg-blue-600 border-blue-600"
                          : "bg-gray-100 border-gray-200"
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          vipVisitThreshold === threshold ? "text-white" : "text-gray-700"
                        }`}
                      >
                        {threshold}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TextInput
                    className="w-14 bg-gray-100 border border-gray-300 rounded-xl py-2 text-center text-xs font-bold text-gray-900"
                    keyboardType="numeric"
                    placeholder="Custom"
                    value={vipInputText}
                    onChangeText={(txt) => {
                      const clean = txt.replace(/[^0-9]/g, "");
                      setVipInputText(clean);
                      const n = parseInt(clean, 10);
                      if (!isNaN(n) && n >= 1) setVipVisitThreshold(n);
                    }}
                    maxLength={3}
                  />
                </View>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleSaveProfile}
              disabled={saving}
              className="bg-blue-600 py-3 rounded-xl flex-row items-center justify-center mb-4 shadow-sm"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                  <Text className="text-white font-bold text-sm ml-2">Save Profile Settings</Text>
                </>
              )}
            </TouchableOpacity>
            <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  App Version & Updates
                </Text>
                <View className="bg-blue-100 px-2.5 py-0.5 rounded-full">
                  <Text className="text-[11px] text-blue-700 font-extrabold">Installed: v{CURRENT_APP_VERSION}</Text>
                </View>
              </View>
              <Text className="text-xs text-gray-600 mb-3">
                Automatic OTA sync and instant APK installation enabled.
              </Text>
              <TouchableOpacity
                onPress={handleCheckForUpdates}
                disabled={checkingUpdate}
                className="bg-blue-50 border border-blue-200 py-2.5 rounded-xl flex-row items-center justify-center mb-3"
              >
                {checkingUpdate ? (
                  <ActivityIndicator size="small" color="#2563EB" />
                ) : (
                  <>
                    <Ionicons name="cloud-download-outline" size={18} color="#2563EB" />
                    <Text className="text-blue-600 font-bold text-xs ml-1.5">Check for App Updates (v{CURRENT_APP_VERSION})</Text>
                  </>
                )}
              </TouchableOpacity>

              <View className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-xs font-bold text-gray-800">Latest Release: v{CURRENT_APP_VERSION}</Text>
                  <View className="bg-emerald-100 px-2 py-0.5 rounded-full">
                    <Text className="text-[10px] font-extrabold text-emerald-800">APK Available</Text>
                  </View>
                </View>
                <Text className="text-[11px] text-gray-500 mb-2">
                  Direct APK download link for Android:
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    openApkDownload(GITHUB_RELEASES_URL)
                  }
                  className="bg-blue-600 py-2 px-3 rounded-lg flex-row items-center justify-center shadow-sm"
                >
                  <Ionicons name="download-outline" size={15} color="#FFFFFF" />
                  <Text className="text-white text-xs font-bold ml-1.5">Download v{CURRENT_APP_VERSION} APK</Text>
                </TouchableOpacity>
                <Text
                  numberOfLines={1}
                  className="text-[10px] text-gray-400 mt-1.5 text-center"
                  selectable
                >
                  {GITHUB_RELEASES_URL}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onLogout}
              className="w-full bg-red-50 border border-red-200 py-3 rounded-xl items-center mb-8"
            >
              <Text className="text-red-600 font-bold text-sm">Logout Account</Text>
            </TouchableOpacity>
          </View>
        )}
        {activeTab === "printer" && (
          <View>
            <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
              <View className="flex-row items-center justify-between mb-3">
                <View>
                  <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Select Invoice Style (5-6 Styles)
                  </Text>
                  <Text className="text-[11px] text-gray-500 mt-0.5">
                    Choose visual styling for printed receipts & digital PDFs
                  </Text>
                </View>
                <View className="bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                  <Text className="text-[10px] text-indigo-700 font-bold">6 Themes</Text>
                </View>
              </View>
              <View className="gap-2.5 mb-3">
                {INVOICE_STYLES.map((style) => (
                  <TouchableOpacity
                    key={style.id}
                    onPress={() => setInvoiceStyle(style.id)}
                    className={`p-3 rounded-xl border flex-row items-center justify-between ${
                      invoiceStyle === style.id
                        ? "bg-blue-50 border-blue-600 shadow-xs"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <View className="flex-1 pr-2">
                      <View className="flex-row items-center mb-0.5">
                        <Text
                          className={`text-xs font-bold ${
                            invoiceStyle === style.id ? "text-blue-900" : "text-gray-800"
                          }`}
                        >
                          {style.name}
                        </Text>
                        <View className="bg-gray-200/80 px-1.5 py-0.5 rounded ml-2">
                          <Text className="text-[9.5px] font-bold text-gray-700">{style.badge}</Text>
                        </View>
                      </View>
                      <Text className="text-[11px] text-gray-500">{style.description}</Text>
                    </View>
                    <View
                      className={`w-5 h-5 rounded-full border items-center justify-center ${
                        invoiceStyle === style.id
                          ? "border-blue-600 bg-blue-600"
                          : "border-gray-400 bg-white"
                      }`}
                    >
                      {invoiceStyle === style.id ? (
                        <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Printer & Slip Settings
                </Text>
                <TouchableOpacity
                  onPress={saveBillFormatSettings}
                  disabled={savingBillFormat}
                  className="bg-blue-600 px-3 py-1.5 rounded-lg flex-row items-center"
                >
                  {savingBillFormat ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={13} color="#FFFFFF" />
                      <Text className="text-white text-xs font-bold ml-1">Save Format</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <Text className="text-xs font-bold text-gray-700 mb-2">Print Target / For Whom</Text>
              <View className="flex-row gap-2 mb-4">
                {[
                  { key: "both", label: "Both (Customer + KOT)", icon: "copy-outline" },
                  { key: "customer", label: "Customer Only", icon: "receipt-outline" },
                  { key: "kot", label: "Cooker KOT Only", icon: "restaurant-outline" },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => {
                      setPrintTarget(t.key);
                      setPreviewTab(t.key === "kot" ? "cooker" : t.key === "customer" ? "customer" : "both");
                    }}
                    className={`flex-1 py-2.5 px-1.5 rounded-xl border items-center justify-center ${
                      printTarget === t.key
                        ? "bg-blue-600 border-blue-600 shadow-xs"
                        : "bg-gray-100 border-gray-300"
                    }`}
                  >
                    <Ionicons
                      name={t.icon}
                      size={14}
                      color={printTarget === t.key ? "#FFFFFF" : "#4B5563"}
                    />
                    <Text
                      className={`text-[10.5px] font-bold mt-1 text-center ${
                        printTarget === t.key ? "text-white" : "text-gray-700"
                      }`}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text className="text-xs font-bold text-gray-700 mb-2">Paper / Print Width</Text>
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
              <Text className="text-xs font-bold text-gray-700 mb-2">Bill Header & Content Toggles</Text>
              {[
                { label: "Show Store Logo", state: billShowLogo, set: setBillShowLogo },
                { label: "Show Bill / Token Number", state: billShowToken, set: setBillShowToken },
                { label: "Show Customer Phone on Bill", state: billShowPhone, set: setBillShowPhone },
                { label: "Show Store Email in Header", state: billShowEmail, set: setBillShowEmail },
                { label: "Show GSTIN in Header", state: billShowGstin, set: setBillShowGstin },
                { label: "Show Bill Type (Cash Sale / Credit)", state: billShowType, set: setBillShowType },
              ].map(({ label, state, set }) => (
                <View key={label} className="flex-row items-center justify-between py-2 border-b border-gray-100">
                  <Text className="text-xs text-gray-800 font-medium flex-1 pr-2">{label}</Text>
                  <Switch
                    value={state}
                    onValueChange={set}
                    trackColor={{ false: "#D1D5DB", true: "#2563EB" }}
                    thumbColor={state ? "#FFFFFF" : "#9CA3AF"}
                  />
                </View>
              ))}
              <View className="mt-3">
                <Text className="text-xs font-bold text-gray-700 mb-1">Bill Footer Message</Text>
                <TextInput
                  className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
                  placeholder="Thank you! Visit again."
                  value={billFooter}
                  onChangeText={setBillFooter}
                />
              </View>
              <View className="flex-row gap-2 mt-4">
                <TouchableOpacity
                  onPress={() => setShowPreview(true)}
                  className="flex-1 bg-gray-800 py-2.5 rounded-xl flex-row items-center justify-center"
                >
                  <Ionicons name="receipt-outline" size={16} color="#FFFFFF" />
                  <Text className="text-white text-xs font-bold ml-1.5">Preview Receipt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleTestPrint}
                  disabled={testingPrinter}
                  className="flex-1 bg-blue-600 py-2.5 rounded-xl flex-row items-center justify-center"
                >
                  {testingPrinter ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="bluetooth" size={16} color="#FFFFFF" />
                      <Text className="text-white text-xs font-bold ml-1.5">Test Print Slip</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <View className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mt-3">
                <View className="flex-row items-center mb-1">
                  <Ionicons name="information-circle" size={16} color="#2563EB" />
                  <Text className="text-blue-900 font-bold text-xs ml-1">
                    Bluetooth Thermal Printer Guide (VEER B41 / Everycom)
                  </Text>
                </View>
                <Text className="text-[11px] text-blue-800 leading-4">
                  1. Turn ON thermal printer.{"\n"}
                  2. Open Phone Bluetooth, pair with printer device (PIN is <Text className="font-bold">1234</Text> or <Text className="font-bold">0000</Text>).{"\n"}
                  3. For instant 1-tap USB & Bluetooth spooling without searching dialogs, install RawBT driver below.
                </Text>
                <TouchableOpacity
                  onPress={() => Linking.openURL("https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter")}
                  className="bg-emerald-600 py-2.5 rounded-lg items-center mt-2.5 flex-row justify-center shadow-xs"
                >
                  <Ionicons name="download-outline" size={14} color="#FFFFFF" />
                  <Text className="text-white text-xs font-bold ml-1.5">
                    Install Free VEER B41 Driver (RawBT)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        {activeTab === "whatsapp" && (
          <View>
            <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
              <View className="flex-row items-center justify-between mb-2">
                <View>
                  <Text className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    WhatsApp 24/7 Multi-Day Sync
                  </Text>
                  <Text className="text-[10px] text-gray-500 mt-0.5">
                    Baileys Multi-Device Persistent Cloud Engine
                  </Text>
                </View>
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
                      ? "Connected & 24/7 Synced"
                      : waStatus === "scan_qr"
                      ? "Scan QR Code"
                      : "Not Linked"}
                  </Text>
                </View>
              </View>
              {waStatus === "connected" ? (
                <View className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-2">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-2">
                      <Text className="text-xs font-bold text-gray-900">
                        Linked Phone: +{waPhone || user?.whatsappNumber || user?.phone}
                      </Text>
                      <Text className="text-[11px] text-gray-600 mt-0.5">
                        Automatic bill delivery, catalogue distribution and broadcast marketing are active.
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
              ) : waStatus === "scan_qr" || pairingCode ? (
                <View className="items-center bg-gray-50 border border-gray-200 rounded-xl p-4">
                  {waQr ? (
                    <>
                      <Text className="text-xs font-bold text-gray-800 mb-2">
                        Scan this QR code with WhatsApp:
                      </Text>
                      <Image
                        source={{ uri: waQr }}
                        style={{ width: 220, height: 220, borderRadius: 12, backgroundColor: "#FFFFFF" }}
                      />
                      <View className="mt-3 bg-white p-3 rounded-lg border border-gray-200 w-full">
                        <Text className="text-[11px] text-gray-700 font-medium">1. Open WhatsApp on your phone</Text>
                        <Text className="text-[11px] text-gray-700 font-medium mt-1">2. Tap Settings (or 3 dots) → Linked Devices</Text>
                        <Text className="text-[11px] text-gray-700 font-medium mt-1">3. Tap Link a Device and point your camera here</Text>
                      </View>
                    </>
                  ) : (
                    <View className="py-8 items-center justify-center">
                      <ActivityIndicator size="large" color="#059669" />
                      <Text className="text-xs font-bold text-gray-700 mt-3">Connecting to WhatsApp server...</Text>
                      <Text className="text-[11px] text-gray-500 mt-1">Preparing multi-day sync session</Text>
                    </View>
                  )}
                  <View className="flex-row items-center justify-between w-full mt-3">
                    <TouchableOpacity
                      onPress={() => handleStartWaLink(true)}
                      disabled={waLoading}
                      className="flex-row items-center bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg"
                    >
                      <Ionicons name="refresh" size={13} color="#2563EB" />
                      <Text className="text-[11px] font-bold text-blue-600 ml-1">Refresh QR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowPairingInput(!showPairingInput)}
                      className="flex-row items-center bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg"
                    >
                      <Ionicons name="keypad-outline" size={13} color="#059669" />
                      <Text className="text-[11px] font-bold text-emerald-700 ml-1">
                        {showPairingInput ? "Hide Phone Code" : "Or use Phone Code"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {showPairingInput && (
                    <View className="mt-3 w-full bg-white p-3 rounded-lg border border-gray-200">
                      <Text className="text-xs font-bold text-gray-800 mb-1">Link with Phone Number:</Text>
                      <Text className="text-[11px] text-gray-500 mb-2">Enter 10-digit phone number:</Text>
                      <View className="flex-row items-center">
                        <TextInput
                          className="flex-1 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900"
                          placeholder="e.g. 9876543210"
                          placeholderTextColor="#9CA3AF"
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
                          <Text className="text-2xl font-mono font-black text-emerald-900 tracking-widest my-1 select-all">
                            {pairingCode}
                          </Text>
                          <View className="bg-white border border-emerald-200 rounded-lg p-2.5 my-2 w-full">
                            <Text className="text-[11px] text-gray-800 font-bold mb-0.5">
                              How to enter in WhatsApp:
                            </Text>
                            <Text className="text-[10.5px] text-gray-600 leading-4">
                              1. Open WhatsApp ➔ Linked Devices ➔ Link a Device{"\n"}
                              2. Tap "Link with phone number instead" at the bottom{"\n"}
                              3. Type: <Text className="font-mono font-bold text-emerald-900">{pairingCode.replace("-", "")}</Text>
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              fetchWaStatus();
                              Alert.alert("Status", "Checking status with WhatsApp servers...");
                            }}
                            className="bg-emerald-600 px-4 py-2 rounded-lg flex-row items-center mt-1"
                          >
                            <Ionicons name="refresh" size={13} color="#FFFFFF" />
                            <Text className="text-white text-[11px] font-bold ml-1.5">Check Status</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => handleStartWaLink(true)}
                  disabled={waLoading}
                  className="bg-emerald-600 py-3 rounded-xl flex-row items-center justify-center shadow-sm"
                >
                  {waLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <FontAwesome name="whatsapp" size={18} color="#FFFFFF" />
                      <Text className="text-white font-bold text-xs ml-2">
                        Link WhatsApp (Start Multi-Day Sync)
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        </ResponsiveContainer>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal visible={showPreview} animationType="slide" transparent={true}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: isWide ? "center" : "flex-end", alignItems: isWide ? "center" : "stretch", padding: isWide ? 24 : 0 }}>
          <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: isWide ? 20 : 0, borderBottomRightRadius: isWide ? 20 : 0, padding: 16, maxHeight: "90%", width: "100%", maxWidth: isWide ? 520 : undefined }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: "800", color: "#111" }}>
                Receipt Preview ({INVOICE_STYLES.find((s) => s.id === invoiceStyle)?.name || invoiceStyle})
              </Text>
              <TouchableOpacity onPress={() => setShowPreview(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: "row", backgroundColor: "#F3F4F6", borderRadius: 10, padding: 3, marginBottom: 10 }}>
              <TouchableOpacity
                onPress={() => setPreviewTab("both")}
                style={{
                  flex: 1,
                  paddingVertical: 6,
                  borderRadius: 8,
                  alignItems: "center",
                  backgroundColor: previewTab === "both" ? "#FFFFFF" : "transparent",
                }}
              >
                <Text style={{ fontSize: 10.5, fontWeight: "700", color: previewTab === "both" ? "#1D4ED8" : "#6B7280" }}>
                  Both (Cust+KOT)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPreviewTab("customer")}
                style={{
                  flex: 1,
                  paddingVertical: 6,
                  borderRadius: 8,
                  alignItems: "center",
                  backgroundColor: previewTab === "customer" ? "#FFFFFF" : "transparent",
                }}
              >
                <Text style={{ fontSize: 10.5, fontWeight: "700", color: previewTab === "customer" ? "#1D4ED8" : "#6B7280" }}>
                  Customer Only
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
                }}
              >
                <Text style={{ fontSize: 10.5, fontWeight: "700", color: previewTab === "cooker" ? "#B45309" : "#6B7280" }}>
                  Cooker KOT
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {(previewTab === "both" || previewTab === "customer") && (
                <View style={{ backgroundColor: "#ffffff", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: previewTab === "both" ? 12 : 0 }}>
                  <View style={{ alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontSize: 9, fontWeight: "700", color: "#64748B", textTransform: "uppercase", letterSpacing: 1, borderWidth: 1, borderColor: "#CBD5E1", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                      CUSTOMER COPY
                    </Text>
                  </View>
                  <View style={{ alignItems: "center", marginBottom: 8 }}>
                    {billShowLogo && (logo || user?.logo) ? (
                      <Image source={{ uri: logo || user.logo }} style={{ width: 52, height: 52, borderRadius: 8, marginBottom: 4 }} />
                    ) : null}
                    <Text style={{ fontSize: 14, fontWeight: "900", letterSpacing: 0.5, textTransform: "uppercase", color: "#0F172A", textAlign: "center" }}>
                      {businessName || user?.businessName || "MY STORE"}
                    </Text>
                    {address || user?.address ? <Text style={{ fontSize: 10.5, color: "#334155", marginTop: 2, textAlign: "center" }}>{address || user.address}</Text> : null}
                    {user?.phone ? <Text style={{ fontSize: 10.5, color: "#334155", textAlign: "center" }}>Phone: {user.phone}</Text> : null}
                    {billShowEmail && (email || user?.email) ? <Text style={{ fontSize: 10, color: "#475569", textAlign: "center" }}>@: {email || user.email}</Text> : null}
                    {billShowGstin && (gstin || user?.gstin) ? <Text style={{ fontSize: 10, fontWeight: "700", color: "#0F172A", textAlign: "center" }}>GSTIN: {gstin || user.gstin}</Text> : null}
                  </View>
                  <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#94A3B8", marginVertical: 6 }} />
                  {billShowToken ? <Text style={{ fontSize: 11, fontWeight: "800", color: "#0F172A" }}>Bill No: 21</Text> : null}
                  <Text style={{ fontSize: 10.5, color: "#1E293B", marginTop: 1 }}>Created On: 25/07/25 12:03 AM</Text>
                  {billShowType ? <Text style={{ fontSize: 10.5, color: "#1E293B", marginTop: 1 }}>Bill To: Cash Sale</Text> : null}
                  {billShowPhone ? <Text style={{ fontSize: 10.5, color: "#1E293B", marginTop: 1 }}>Customer: Dipak | 9876543210</Text> : null}
                  <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#94A3B8", marginVertical: 6 }} />
                  <View style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: "#0F172A", paddingBottom: 3, marginBottom: 4 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: "800", flex: 3, color: "#0F172A" }}>Item Name</Text>
                    <Text style={{ fontSize: 10.5, fontWeight: "800", width: 28, textAlign: "center", color: "#0F172A" }}>Qty</Text>
                    <Text style={{ fontSize: 10.5, fontWeight: "800", width: 38, textAlign: "right", color: "#0F172A" }}>Rate</Text>
                    <Text style={{ fontSize: 10.5, fontWeight: "800", width: 38, textAlign: "right", color: "#0F172A" }}>Total</Text>
                  </View>
                  <View style={{ flexDirection: "row", paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10.5, flex: 3, color: "#0F172A" }}>Coffee Cappuccino (Hot)</Text>
                    <Text style={{ fontSize: 10.5, width: 28, textAlign: "center", color: "#0F172A" }}>1</Text>
                    <Text style={{ fontSize: 10.5, width: 38, textAlign: "right", color: "#0F172A" }}>159</Text>
                    <Text style={{ fontSize: 10.5, width: 38, textAlign: "right", fontWeight: "700", color: "#0F172A" }}>159</Text>
                  </View>
                  <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#94A3B8", marginVertical: 6 }} />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#0F172A" }}>
                    <Text style={{ fontSize: 11.5, fontWeight: "900", color: "#0F172A" }}>GRAND TOTAL</Text>
                    <Text style={{ fontSize: 11.5, fontWeight: "900", color: "#0F172A" }}>Rs. 159.00</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                    <Text style={{ fontSize: 10, color: "#334155" }}>Payment</Text>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#0F172A" }}>CASH (PAID)</Text>
                  </View>
                  <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#94A3B8", marginVertical: 6 }} />
                  <Text style={{ fontSize: 10.5, fontWeight: "700", textAlign: "center", color: "#0F172A" }}>
                    {billFooter}
                  </Text>
                </View>
              )}
              {previewTab === "both" && (
                <View style={{ alignItems: "center", marginVertical: 6 }}>
                  <Text style={{ color: "#9CA3AF", fontSize: 10, letterSpacing: 2 }}>
                    ✂ - - - - - - - - - - - - - - - - - - - - - ✂
                  </Text>
                </View>
              )}
              {(previewTab === "both" || previewTab === "cooker") && (
                <View style={{ backgroundColor: "#FFFBEB", borderRadius: 12, padding: 12, borderWidth: 2, borderColor: "#B45309" }}>
                  <View style={{ alignItems: "center", marginBottom: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: "900", color: "#B45309", textTransform: "uppercase", letterSpacing: 1 }}>
                      *** COOKER / KITCHEN KOT ***
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#333", marginTop: 2 }}>
                      {businessName || user?.businessName || "MY STORE"}
                    </Text>
                  </View>
                  <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#B45309", marginVertical: 6 }} />
                  <Text style={{ fontFamily: "monospace", fontSize: 32, fontWeight: "900", textAlign: "center", letterSpacing: 2, color: "#92400E" }}>
                    TOKEN: #1
                  </Text>
                  <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: "#B45309", marginVertical: 6 }} />
                  <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "700" }}>Bill No: #INV-1001</Text>
                  <Text style={{ fontFamily: "monospace", fontSize: 11 }}>Time: 28/10/26 08:30 PM</Text>
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
                Paper size: {printerSize} · Target: {printTarget.toUpperCase()}
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
    </View>
  );
}