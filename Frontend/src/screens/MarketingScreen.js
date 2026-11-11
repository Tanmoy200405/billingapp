import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Linking,
  FlatList,
  Platform,
  KeyboardAvoidingView,
  Switch,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { api } from "../config/api";
import { shareCataloguePdf, CATALOGUE_STYLES } from "../utils/cataloguePdfGenerator";
import { showToast } from "../utils/toast";
import { getCachedData, setCachedData, getMemoryCachedData } from "../utils/localCache";
import { useResponsive, ResponsiveContainer } from "../utils/responsive";
import { THEME } from "../config/theme";

const MARKETING_TEMPLATES = [
  {
    id: "weekend_sale",
    title: "Weekend Mega Sale",
    tag: "Sale",
    icon: "pricetag",
    color: "#2563EB",
    bg: "#EFF6FF",
    message:
      "Special Weekend Offer from {STORE}! Enjoy flat 15% OFF on all your favorite items this weekend. Visit us today or reply here to order directly on WhatsApp!",
  },
  {
    id: "new_arrivals",
    title: "New Arrivals & Stock",
    tag: "Stock",
    icon: "sparkles",
    color: "#059669",
    bg: "#ECFDF5",
    message:
      "Exciting news from {STORE}! Our newest collection and fresh items have just arrived. Drop by our store or message us right here for fast delivery!",
  },
  {
    id: "vip_loyalty",
    title: "VIP Member Reward",
    tag: "VIP",
    icon: "star",
    color: "#D97706",
    bg: "#FEF3C7",
    message:
      "Dear Valued VIP Customer, as a thank you for your regular patronage with {STORE}, we have an exclusive perk waiting on your next visit! Show this message at the counter to redeem.",
  },
  {
    id: "festive_greeting",
    title: "Festive Deals",
    tag: "Festive",
    icon: "gift",
    color: "#2563EB",
    bg: "#EFF6FF",
    message:
      "Warm festive wishes from {STORE}! Celebrate with your loved ones and enjoy our seasonal discounts. We look forward to serving you!",
  },
  {
    id: "we_miss_you",
    title: "Welcome Back 10%",
    tag: "Win-back",
    icon: "heart",
    color: "#DC2626",
    bg: "#FEF2F2",
    message:
      "It has been a while since we saw you at {STORE}! We would love to welcome you back with a special 10% discount on your next visit. Show this message at checkout!",
  },
];

export default function MarketingScreen({ user, isActive = true, onOpenDrawer, onBack }) {
  const { isWide, headerTopPadding } = useResponsive();
  const [catalogues, setCatalogues] = useState(() => getMemoryCachedData("items_all") || []);
  const [parties, setParties] = useState(() => getMemoryCachedData("parties_all") || []);
  const [selectedCatStyle, setSelectedCatStyle] = useState("modern_minimal");
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [generatingCatalogue, setGeneratingCatalogue] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  // Broadcast state
  const [customBroadcastMsg, setCustomBroadcastMsg] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState("all");
  const [autoSendViaServer, setAutoSendViaServer] = useState(Boolean(user?.whatsappLinked));
  const [broadcasting, setBroadcasting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Bulk Dispatcher Queue Modal State
  const [queueModalVisible, setQueueModalVisible] = useState(false);
  const [queueRecipients, setQueueRecipients] = useState([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [sentMap, setSentMap] = useState({});

  const vipThreshold = Number(user?.vipVisitThreshold) || 3;

  const { totalCustomers, vipCount } = useMemo(() => {
    const valid = parties.filter((p) => (p?.whatsappNumber || p?.phone || "").replace(/[^0-9]/g, "").length >= 10);
    const vips = valid.filter((p) => p.isRegular || (p.visitCount || 0) >= vipThreshold);
    return { totalCustomers: valid.length, vipCount: vips.length };
  }, [parties, vipThreshold]);

  useEffect(() => {
    if (isActive) {
      loadMarketingData();
    }
  }, [isActive]);

  const loadMarketingData = async () => {
    const [cachedItems, cachedParties] = await Promise.all([
      getCachedData("items_all"),
      getCachedData("parties_all"),
    ]);
    let hasCached = false;
    if (Array.isArray(cachedItems) && cachedItems.length > 0) {
      setCatalogues(cachedItems);
      hasCached = true;
    }
    if (Array.isArray(cachedParties) && cachedParties.length > 0) {
      setParties(cachedParties);
    }
    if (!hasCached) setLoadingItems(true);
    try {
      const [itemRes, partyRes] = await Promise.all([
        api.items.getAll(),
        api.parties.getAll(),
      ]);
      if (itemRes?.success && Array.isArray(itemRes.items)) {
        setCatalogues(itemRes.items);
        setCachedData("items_all", itemRes.items);
      }
      if (partyRes?.success && Array.isArray(partyRes.parties)) {
        setParties(partyRes.parties);
        setCachedData("parties_all", partyRes.parties);
      }
    } catch {} finally {
      setLoadingItems(false);
    }
  };

  const handlePullRefresh = async () => {
    setRefreshing(true);
    await loadMarketingData().catch(() => {});
    setRefreshing(false);
  };

  const handleStartBroadcast = async () => {
    if (!customBroadcastMsg.trim()) {
      showToast.warning("Please enter your message before sending.", "Empty Message");
      return;
    }

    setBroadcasting(true);
    try {
      const res = await api.parties.broadcastOffer({
        targetAudience: broadcastAudience,
        customMessage: customBroadcastMsg.trim(),
        autoSendViaServer,
      });

      if (!res?.success) {
        showToast.error(res?.message || "No matching customers found.", "Broadcast Notice");
        setBroadcasting(false);
        return;
      }

      const list = res.recipients || [];
      if (!list.length) {
        showToast.warning(
          broadcastAudience === "vips"
            ? "No VIP customers found. Mark customers as Regular in Party or check sales."
            : "No customers with valid mobile numbers found.",
          "No Customers Found"
        );
        setBroadcasting(false);
        return;
      }

      if (res.mode === "server") {
        showToast.success(
          `Queued ${res.sentCount} messages for instant WhatsApp delivery!`,
          "Cloud Broadcast Queued"
        );
        setCustomBroadcastMsg("");
        setSelectedTemplateId(null);
        setBroadcasting(false);
        return;
      }

      setQueueRecipients(list);
      setCurrentQueueIndex(0);
      setSentMap({});
      setQueueModalVisible(true);
      showToast.info(
        `Loaded ${list.length} customer${list.length > 1 ? "s" : ""}. Tap Send to dispatch each.`,
        "Dispatch Queue Ready"
      );
    } catch (err) {
      showToast.error(err.message || "Failed to start broadcast.", "Broadcast Error");
    } finally {
      setBroadcasting(false);
    }
  };

  const handleDispatchCustomer = async (index) => {
    if (!queueRecipients[index]) return;
    const customer = queueRecipients[index];
    const url = customer.whatsappUrl;

    if (url) {
      try {
        await Linking.openURL(url);
        setSentMap((prev) => ({ ...prev, [customer.phone]: true }));
        if (index === currentQueueIndex && index + 1 < queueRecipients.length) {
          setCurrentQueueIndex(index + 1);
        }
        showToast.success(`Opened WhatsApp for ${customer.name}`, "Message Sent");
      } catch {
        showToast.error("Could not launch WhatsApp.", "Link Error");
      }
    }
  };

  const handleApplyTemplate = (tmpl) => {
    const storeName = user?.businessName || "Our Store";
    const formatted = tmpl.message.replace(/\{STORE\}/g, storeName);
    setSelectedTemplateId(tmpl.id);
    setCustomBroadcastMsg(formatted);
    showToast.info(`Template "${tmpl.tag}" applied!`, "Template Loaded");
  };

  const handleShareCatalogue = async () => {
    if (!catalogues.length) {
      showToast.warning("Please add products in Inventory first.", "No Inventory Items");
      return;
    }

    setGeneratingCatalogue(true);
    try {
      const storeData = {
        businessName: user?.businessName || "My Store",
        phone: user?.phone || "",
        address: user?.address || "",
        logo: user?.logo || "",
        email: user?.email || "",
      };
      const res = await shareCataloguePdf(catalogues, storeData, selectedCatStyle);
      if (res && !res.success) {
        showToast.error(res.error || "Could not generate PDF.", "Error");
      } else {
        showToast.success("Catalogue generated successfully!", "PDF Ready");
      }
    } catch (err) {
      showToast.error(err.message || "Failed to generate catalogue.", "Error");
    } finally {
      setGeneratingCatalogue(false);
    }
  };

  const currentRecipient = queueRecipients[currentQueueIndex];
  const sentCount = Object.keys(sentMap).length;
  const totalRecipients = queueRecipients.length;
  const storePreviewName = user?.businessName || "Your Store";
  const targetCount = broadcastAudience === "vips" ? vipCount : totalCustomers;

  return (
    <View style={{ flex: 1, backgroundColor: THEME.surface }} className="flex-1 bg-slate-50">
      {/* ── Unified Brand Header ── */}
      <View style={{ paddingTop: headerTopPadding, backgroundColor: THEME.primary }} className="px-4 pb-4 shadow-sm">
        <ResponsiveContainer maxWidth={1120} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View className="flex-row items-center flex-1">
            {!isWide && (
              <TouchableOpacity onPress={onOpenDrawer} className="mr-2 p-1">
                <Ionicons name="menu" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            )}
            {onBack && !isWide ? (
              <TouchableOpacity
                onPress={onBack}
                className="flex-row items-center bg-white/20 px-2.5 py-1 rounded-lg mr-2.5"
              >
                <Ionicons name="arrow-back" size={14} color="#FFFFFF" />
                <Text className="text-white text-xs font-bold ml-1">Back</Text>
              </TouchableOpacity>
            ) : null}
            <View className="flex-1">
              <Text className="text-white text-xl font-black tracking-tight">Marketing Hub</Text>
              <Text className="text-blue-100 text-[11px] font-medium mt-0.5">
                WhatsApp Campaigns · Digital Catalogues · VIP Retention
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handlePullRefresh}
            disabled={refreshing}
            className="bg-white/20 border border-white/30 px-3 py-1.5 rounded-xl flex-row items-center"
          >
            <Ionicons name="sync" size={14} color="#FFFFFF" />
            <Text className="text-white text-xs font-bold ml-1.5">Sync</Text>
          </TouchableOpacity>
        </ResponsiveContainer>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: isWide ? 20 : 14, paddingBottom: 110 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handlePullRefresh}
              tintColor={THEME.primary}
              colors={[THEME.primary]}
            />
          }
        >
          <ResponsiveContainer maxWidth={1120}>
            {/* ── Top KPI Strip ── */}
            <View className="flex-row gap-2.5 mb-4">
              <View className="flex-1 bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                    Reachable
                  </Text>
                  <View className="w-6 h-6 rounded-lg bg-blue-50 items-center justify-center">
                    <Ionicons name="people" size={13} color={THEME.primary} />
                  </View>
                </View>
                <Text className="text-xl font-black text-slate-900">{totalCustomers}</Text>
                <Text className="text-[10px] text-slate-500 font-medium mt-0.5">Customers with phone</Text>
              </View>

              <View className="flex-1 bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider">
                    VIP Patrons
                  </Text>
                  <View className="w-6 h-6 rounded-lg bg-amber-100 items-center justify-center">
                    <Ionicons name="star" size={13} color={THEME.warning} />
                  </View>
                </View>
                <Text className="text-xl font-black text-slate-900">{vipCount}</Text>
                <Text className="text-[10px] text-slate-500 font-medium mt-0.5">≥{vipThreshold} visits / regular</Text>
              </View>

              <View className="flex-1 bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider">
                    Menu Items
                  </Text>
                  <View className="w-6 h-6 rounded-lg bg-emerald-50 items-center justify-center">
                    <Ionicons name="cube" size={13} color={THEME.success} />
                  </View>
                </View>
                <Text className="text-xl font-black text-slate-900">{catalogues.length}</Text>
                <Text className="text-[10px] text-slate-500 font-medium mt-0.5">Ready for catalogue</Text>
              </View>
            </View>

            {/* ── Main Two-Column Studio on Tablet/Web ── */}
            <View style={isWide ? { flexDirection: "row", gap: 18, alignItems: "flex-start" } : undefined}>
              {/* ── LEFT CARD: WhatsApp Campaign Composer ── */}
              <View
                style={isWide ? { flex: 1.2 } : undefined}
                className="bg-white rounded-2xl p-4 sm:p-5 mb-4 border border-slate-200 shadow-sm"
              >
                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-row items-center flex-1 pr-2">
                    <View className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 items-center justify-center mr-3">
                      <FontAwesome5 name="bullhorn" size={17} color={THEME.primary} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-extrabold text-slate-900">WhatsApp Campaign Studio</Text>
                      <Text className="text-[11px] text-slate-500">
                        Engage repeat buyers & drive walk-in or WhatsApp orders
                      </Text>
                    </View>
                  </View>
                  <View className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <Text className="text-[10px] font-extrabold text-emerald-700">Direct Send</Text>
                  </View>
                </View>

                {/* Audience Segmented Switch */}
                <Text className="text-xs font-bold text-slate-700 mb-2">Target Audience</Text>
                <View className="flex-row bg-slate-100 p-1 rounded-xl border border-slate-200 mb-3">
                  <TouchableOpacity
                    onPress={() => setBroadcastAudience("all")}
                    className={`flex-1 py-2.5 rounded-lg flex-row items-center justify-center ${
                      broadcastAudience === "all" ? "bg-blue-600 shadow-xs" : "bg-transparent"
                    }`}
                  >
                    <Ionicons
                      name="people"
                      size={15}
                      color={broadcastAudience === "all" ? "#FFFFFF" : "#475569"}
                    />
                    <Text
                      className={`text-xs font-extrabold ml-1.5 ${
                        broadcastAudience === "all" ? "text-white" : "text-slate-600"
                      }`}
                    >
                      All Customers ({totalCustomers})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setBroadcastAudience("vips")}
                    className={`flex-1 py-2.5 rounded-lg flex-row items-center justify-center ${
                      broadcastAudience === "vips" ? "bg-amber-500 shadow-xs" : "bg-transparent"
                    }`}
                  >
                    <Ionicons
                      name="star"
                      size={15}
                      color={broadcastAudience === "vips" ? "#FFFFFF" : "#D97706"}
                    />
                    <Text
                      className={`text-xs font-extrabold ml-1.5 ${
                        broadcastAudience === "vips" ? "text-white" : "text-slate-600"
                      }`}
                    >
                      VIP Only ({vipCount})
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Quick Templates */}
                <Text className="text-xs font-bold text-slate-700 mb-2 mt-1">1-Tap Offer Templates</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3.5">
                  {MARKETING_TEMPLATES.map((tmpl) => {
                    const active = selectedTemplateId === tmpl.id;
                    return (
                      <TouchableOpacity
                        key={tmpl.id}
                        onPress={() => handleApplyTemplate(tmpl)}
                        activeOpacity={0.85}
                        style={{
                          borderColor: active ? THEME.primary : THEME.border,
                          backgroundColor: active ? THEME.primaryLight : "#FFFFFF",
                        }}
                        className="w-36 rounded-xl p-2.5 mr-2.5 border shadow-xs"
                      >
                        <View className="flex-row items-center justify-between mb-1.5">
                          <View
                            style={{ backgroundColor: tmpl.bg }}
                            className="w-7 h-7 rounded-lg items-center justify-center"
                          >
                            <Ionicons name={tmpl.icon} size={14} color={tmpl.color} />
                          </View>
                          <View className="bg-slate-100 px-1.5 py-0.5 rounded">
                            <Text className="text-[9px] font-extrabold text-slate-600 uppercase">
                              {tmpl.tag}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-xs font-extrabold text-slate-900" numberOfLines={1}>
                          {tmpl.title}
                        </Text>
                        <Text className="text-[10px] text-slate-500 mt-0.5" numberOfLines={2}>
                          {tmpl.message.replace(/\{STORE\}/g, storePreviewName)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Message Composer */}
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="text-xs font-bold text-slate-700">Campaign Message</Text>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[10px] text-slate-400 font-semibold">
                      {customBroadcastMsg.length} chars
                    </Text>
                    {customBroadcastMsg.length > 0 && (
                      <TouchableOpacity
                        onPress={() => {
                          setCustomBroadcastMsg("");
                          setSelectedTemplateId(null);
                        }}
                      >
                        <Text className="text-[11px] font-bold text-blue-600">Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <TextInput
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  style={{ minHeight: 96 }}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 mb-3"
                  placeholder="Write your announcement, weekend deal, or festive wish..."
                  placeholderTextColor="#94A3B8"
                  value={customBroadcastMsg}
                  onChangeText={(txt) => {
                    setCustomBroadcastMsg(txt);
                    if (selectedTemplateId) setSelectedTemplateId(null);
                  }}
                />

                {/* Live WhatsApp Message Bubble Preview */}
                {customBroadcastMsg.trim().length > 0 && (
                  <View className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 mb-3">
                    <View className="flex-row items-center mb-1.5">
                      <FontAwesome5 name="whatsapp" size={12} color="#059669" />
                      <Text className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider ml-1.5">
                        Customer Preview
                      </Text>
                    </View>
                    <View className="bg-white rounded-xl rounded-tl-none p-2.5 border border-emerald-100">
                      <Text className="text-xs text-slate-800 leading-4">
                        {"Hello Customer!\n\nGreetings from "}
                        <Text className="font-bold">{storePreviewName}</Text>
                        {"!\n\n"}
                        {customBroadcastMsg.trim()}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Auto Cloud Dispatch Switch */}
                <View className="flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-3.5">
                  <View className="flex-1 pr-3">
                    <Text className="text-xs font-bold text-slate-800">
                      Background Cloud Dispatch
                    </Text>
                    <Text className="text-[10px] text-slate-500 mt-0.5">
                      Send automatically via your linked 24/7 store WhatsApp (falls back to queue if unlinked)
                    </Text>
                  </View>
                  <Switch
                    value={autoSendViaServer}
                    onValueChange={setAutoSendViaServer}
                    trackColor={{ false: "#CBD5E1", true: "#93C5FD" }}
                    thumbColor={autoSendViaServer ? THEME.primary : "#F8FAFC"}
                  />
                </View>

                <TouchableOpacity
                  onPress={handleStartBroadcast}
                  disabled={broadcasting}
                  activeOpacity={0.85}
                  style={{ backgroundColor: broadcasting ? "#94A3B8" : THEME.success }}
                  className="py-3.5 rounded-xl flex-row items-center justify-center shadow-sm"
                >
                  {broadcasting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <FontAwesome5 name="whatsapp" size={17} color="#FFFFFF" />
                      <Text className="text-white font-extrabold text-sm ml-2">
                        Send to {targetCount > 0 ? `${targetCount} ` : ""}
                        {broadcastAudience === "vips" ? "VIP Customers" : "Customers"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* ── RIGHT CARD: Digital Product Catalogue Studio ── */}
              <View
                style={isWide ? { flex: 0.95 } : undefined}
                className="bg-white rounded-2xl p-4 sm:p-5 mb-4 border border-slate-200 shadow-sm"
              >
                <View className="flex-row items-center justify-between mb-4">
                  <View className="flex-row items-center flex-1 pr-2">
                    <View className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 items-center justify-center mr-3">
                      <Ionicons name="book-outline" size={19} color={THEME.success} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-extrabold text-slate-900">Digital Menu & Catalogue</Text>
                      <Text className="text-[11px] text-slate-500">
                        Export a branded PDF brochure ready for WhatsApp sharing
                      </Text>
                    </View>
                  </View>
                  <View className="bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                    <Text className="text-[10px] font-extrabold text-blue-700">
                      {CATALOGUE_STYLES.length} Styles
                    </Text>
                  </View>
                </View>

                <Text className="text-xs font-bold text-slate-700 mb-2">Choose Brochure Design</Text>
                <View className="flex-row flex-wrap justify-between mb-2">
                  {CATALOGUE_STYLES.map((cat) => {
                    const isSelected = selectedCatStyle === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() => setSelectedCatStyle(cat.id)}
                        activeOpacity={0.85}
                        style={{
                          width: "48.6%",
                          borderColor: isSelected ? THEME.primary : THEME.border,
                          borderWidth: isSelected ? 2 : 1,
                          backgroundColor: isSelected ? THEME.primaryLight : "#FFFFFF",
                        }}
                        className="rounded-xl p-3 mb-2.5"
                      >
                        <View
                          style={{ backgroundColor: cat.color || THEME.primary, height: 4 }}
                          className="rounded-full mb-2"
                        />
                        <View className="flex-row items-center justify-between mb-1">
                          <Text
                            style={{ color: isSelected ? THEME.primaryDark : THEME.textPrimary }}
                            className="text-xs font-extrabold flex-1 pr-1"
                            numberOfLines={1}
                          >
                            {cat.name}
                          </Text>
                          {isSelected ? (
                            <Ionicons name="checkmark-circle" size={16} color={THEME.primary} />
                          ) : null}
                        </View>
                        {cat.badge ? (
                          <View className="self-start bg-slate-100 px-1.5 py-0.5 rounded mb-1">
                            <Text className="text-[9px] font-bold text-slate-600">{cat.badge}</Text>
                          </View>
                        ) : null}
                        <Text className="text-[10px] text-slate-500 leading-3.5" numberOfLines={2}>
                          {cat.description}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View className="flex-row items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-3.5">
                  <View className="flex-row items-center flex-1 pr-2">
                    <Ionicons name="cube-outline" size={16} color={THEME.primary} />
                    <Text className="text-xs font-bold text-slate-800 ml-2">
                      {loadingItems ? "Loading products..." : `${catalogues.length} products ready in brochure`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={loadMarketingData}
                    className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg"
                  >
                    <Text className="text-[11px] font-bold text-blue-600">Refresh</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={handleShareCatalogue}
                  disabled={generatingCatalogue || !catalogues.length}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: catalogues.length ? THEME.primary : "#94A3B8",
                  }}
                  className="py-3.5 rounded-xl flex-row items-center justify-center shadow-sm"
                >
                  {generatingCatalogue ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="share-social-outline" size={18} color="#FFFFFF" />
                      <Text className="text-white font-extrabold text-sm ml-2">
                        Generate & Share Catalogue PDF
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ResponsiveContainer>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Bulk Dispatcher Queue Modal ── */}
      <Modal
        visible={queueModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setQueueModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(15, 23, 42, 0.55)",
            justifyContent: isWide ? "center" : "flex-end",
            alignItems: isWide ? "center" : "stretch",
            padding: isWide ? 24 : 0,
          }}
        >
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderBottomLeftRadius: isWide ? 24 : 0,
              borderBottomRightRadius: isWide ? 24 : 0,
              padding: 20,
              maxHeight: "86%",
              width: "100%",
              maxWidth: isWide ? 560 : undefined,
            }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <View>
                <Text className="text-base font-black text-slate-900">Bulk Message Dispatcher</Text>
                <Text className="text-xs text-slate-500 mt-0.5">
                  Progress: {sentCount} of {totalRecipients} sent
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setQueueModalVisible(false)}
                className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
              >
                <Ionicons name="close" size={18} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Progress Bar */}
            <View className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3.5">
              <View
                style={{
                  height: "100%",
                  backgroundColor: THEME.success,
                  width: totalRecipients > 0 ? `${(sentCount / totalRecipients) * 100}%` : "0%",
                }}
              />
            </View>

            {currentRecipient ? (
              <View className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-3">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-[10px] font-extrabold text-blue-700 uppercase">
                    Next Up · #{currentQueueIndex + 1} of {totalRecipients}
                  </Text>
                  {currentRecipient.isVip ? (
                    <View className="bg-amber-100 px-2 py-0.5 rounded-full">
                      <Text className="text-[10px] font-extrabold text-amber-800">VIP</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-base font-black text-slate-900">{currentRecipient.name}</Text>
                <Text className="text-xs text-slate-600 mb-3">+91 {currentRecipient.phone}</Text>

                <TouchableOpacity
                  onPress={() => handleDispatchCustomer(currentQueueIndex)}
                  style={{ backgroundColor: THEME.success }}
                  className="py-3 rounded-xl flex-row items-center justify-center"
                >
                  <FontAwesome5 name="whatsapp" size={16} color="#FFFFFF" />
                  <Text className="text-white font-extrabold text-xs ml-2">
                    Send via WhatsApp Now
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <FlatList
              data={queueRecipients}
              keyExtractor={(item, idx) => `${item.phone}_${idx}`}
              style={{ maxHeight: 240 }}
              renderItem={({ item, index }) => {
                const isSent = Boolean(sentMap[item.phone]);
                const isCurrent = index === currentQueueIndex;
                return (
                  <View
                    className={`flex-row items-center justify-between p-2.5 rounded-xl mb-1.5 border ${
                      isCurrent ? "bg-blue-50/70 border-blue-300" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <View className="flex-1 pr-2">
                      <Text className="text-xs font-bold text-slate-900" numberOfLines={1}>
                        {index + 1}. {item.name} {item.isVip ? "⭐" : ""}
                      </Text>
                      <Text className="text-[11px] text-slate-500">+91 {item.phone}</Text>
                    </View>
                    {isSent ? (
                      <View className="flex-row items-center bg-emerald-100 px-2.5 py-1 rounded-lg">
                        <Ionicons name="checkmark-circle" size={14} color={THEME.success} />
                        <Text className="text-[11px] font-bold text-emerald-700 ml-1">Sent</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          setCurrentQueueIndex(index);
                          handleDispatchCustomer(index);
                        }}
                        style={{ backgroundColor: THEME.success }}
                        className="flex-row items-center px-3 py-1.5 rounded-lg"
                      >
                        <FontAwesome5 name="whatsapp" size={12} color="#FFFFFF" />
                        <Text className="text-white text-[11px] font-bold ml-1">Send</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />

            <TouchableOpacity
              onPress={() => setQueueModalVisible(false)}
              className="bg-slate-100 py-3 rounded-xl items-center mt-3"
            >
              <Text className="text-xs font-extrabold text-slate-800">Done / Close Queue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
