import React, { useState, useEffect, useCallback } from "react";
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
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import { api } from "../config/api";
import { shareCataloguePdf, CATALOGUE_STYLES } from "../utils/cataloguePdfGenerator";
import { showToast } from "../utils/toast";

// ─── 3-Colour Palette ────────────────────────────────────────────────
const C = {
  navy: "#1E3A8A",      // Primary Theme
  navyDark: "#172554",  // Deep Navy for headers
  navyLight: "#EFF6FF", // Soft Navy tint for chips/cards
  emerald: "#059669",   // Action / WhatsApp / Success
  emeraldLight: "#ECFDF5", // Soft emerald tint
  white: "#FFFFFF",     // Clean card & background
  slate50: "#F8FAFC",   // Clean surface
  slate100: "#F1F5F9",  // Subtle divider
  slate200: "#E2E8F0",  // Crisp border
  slate400: "#94A3B8",  // Subtle icons
  slate600: "#475569",  // Secondary text
  slate900: "#0F172A",  // Deep readable text
  amber: "#D97706",     // VIP gold accent
  amberLight: "#FEF3C7",
};

const MARKETING_TEMPLATES = [
  {
    id: "weekend_sale",
    title: "🎉 Weekend Mega Discount",
    tag: "Sale",
    message: "Special Weekend Offer from {STORE}! Enjoy flat 15% OFF on all your favorite items this weekend. Visit us today or reply here to order directly on WhatsApp! 🛍️",
  },
  {
    id: "new_arrivals",
    title: "🌟 New Arrivals & Fresh Stock",
    tag: "Stock",
    message: "Exciting news from {STORE}! Our newest collection and fresh items have just arrived. Drop by our store or message us right here for fast home delivery! 🚀",
  },
  {
    id: "vip_loyalty",
    title: "👑 VIP Member Exclusive Reward",
    tag: "VIP",
    message: "Dear Valued VIP Customer, as a thank you for your regular patronage with {STORE}, we have an exclusive perk waiting on your next visit! Show this message at the counter to redeem. 🎁",
  },
  {
    id: "festive_greeting",
    title: "🪔 Festive Greetings & Special Deals",
    tag: "Festive",
    message: "Warm festive wishes from {STORE}! Celebrate with your loved ones and enjoy our seasonal discounts. We look forward to serving you! 🪔🎉",
  },
  {
    id: "we_miss_you",
    title: "❤️ We Miss You — Welcome Back",
    tag: "Win-back",
    message: "It has been a while since we saw you at {STORE}! We would love to welcome you back with a special 10% discount on your next visit. Show this message at checkout! 😊",
  },
];

export default function MarketingScreen({ user, onOpenDrawer, onBack }) {
  const [catalogues, setCatalogues] = useState([]);
  const [selectedCatStyle, setSelectedCatStyle] = useState("modern_minimal");
  const [generatingCatalogue, setGeneratingCatalogue] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  // Broadcast state
  const [customBroadcastMsg, setCustomBroadcastMsg] = useState("");
  const [broadcastAudience, setBroadcastAudience] = useState("all");
  const [broadcasting, setBroadcasting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Bulk Dispatcher Queue Modal State
  const [queueModalVisible, setQueueModalVisible] = useState(false);
  const [queueRecipients, setQueueRecipients] = useState([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [sentMap, setSentMap] = useState({});

  useEffect(() => {
    loadMenuItems();
  }, []);

  const loadMenuItems = async () => {
    setLoadingItems(true);
    try {
      const res = await api.items.getAll();
      if (res?.success) setCatalogues(res.items || []);
    } catch {} finally {
      setLoadingItems(false);
    }
  };

  const handlePullRefresh = async () => {
    setRefreshing(true);
    await loadMenuItems().catch(() => {});
    setRefreshing(false);
  };

  // ─── Trigger Broadcast ───────────────────────────────────────────────
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
        autoSendViaServer: false, // Provide full control via the Dispatcher Queue
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

      // If sent directly via server socket
      if (res.mode === "server") {
        showToast.success(
          `Delivered to ${res.sentCount} customers directly via WhatsApp!`,
          "Broadcast Delivered 🎉"
        );
        setCustomBroadcastMsg("");
        setBroadcasting(false);
        return;
      }

      // Open the interactive multi-customer dispatch queue
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

  // ─── Dispatch a specific customer from the queue ─────────────────────
  const handleDispatchCustomer = async (index) => {
    if (!queueRecipients[index]) return;
    const customer = queueRecipients[index];
    const url = customer.whatsappUrl;

    if (url) {
      try {
        await Linking.openURL(url);
        // Mark as sent
        setSentMap((prev) => ({ ...prev, [customer.phone]: true }));

        // Advance to next un-sent customer
        if (index === currentQueueIndex && index + 1 < queueRecipients.length) {
          setCurrentQueueIndex(index + 1);
        }

        showToast.success(`Opened WhatsApp for ${customer.name}`, "Message Sent");
      } catch (e) {
        showToast.error("Could not launch WhatsApp.", "Link Error");
      }
    }
  };

  const handleApplyTemplate = (tmpl) => {
    const storeName = user?.businessName || "Our Store";
    const formatted = tmpl.message.replace(/\{STORE\}/g, storeName);
    setCustomBroadcastMsg(formatted);
    showToast.info(`Template "${tmpl.tag}" applied!`, "Template Loaded");
  };

  const handleShareCatalogue = async () => {
    if (!catalogues.length) {
      showToast.warning("Please add products to your inventory first.", "Catalogue Empty");
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

  return (
    <View style={{ flex: 1, backgroundColor: C.slate50 }}>
      {/* ── Header (Deep Navy) ── */}
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity onPress={onOpenDrawer} style={{ padding: 6, marginRight: 8 }}>
            <Ionicons name="menu" size={24} color={C.white} />
          </TouchableOpacity>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={14} color={C.white} />
              <Text style={{ color: C.white, fontSize: 12, fontWeight: "700", marginLeft: 4 }}>Back</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Marketing & Growth</Text>
            <Text style={styles.headerSubtitle}>Broadcasts · Catalogues · VIP Retention</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handlePullRefresh} tintColor={C.navy} colors={[C.navy]} />}
        >
        {/* ── Card 1: WhatsApp Bulk & VIP Broadcast ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: C.navyLight }]}>
              <FontAwesome5 name="bullhorn" size={16} color={C.navy} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.cardTitle}>WhatsApp Broadcast</Text>
              <Text style={styles.cardSubtitle}>Dispatch offers to all customers or VIP-only</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: C.emeraldLight }]}>
              <Text style={[styles.badgeText, { color: C.emerald }]}>Verified Direct</Text>
            </View>
          </View>

          {/* Audience Selector */}
          <Text style={styles.fieldLabel}>Select Target Audience:</Text>
          <View style={styles.audienceRow}>
            <TouchableOpacity
              onPress={() => setBroadcastAudience("all")}
              style={[
                styles.audienceOption,
                broadcastAudience === "all" && { backgroundColor: C.navy, borderColor: C.navy },
              ]}
            >
              <Ionicons
                name="people"
                size={16}
                color={broadcastAudience === "all" ? C.white : C.slate600}
              />
              <Text
                style={[
                  styles.audienceOptionText,
                  broadcastAudience === "all" && { color: C.white, fontWeight: "800" },
                ]}
              >
                All Customers
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setBroadcastAudience("vips")}
              style={[
                styles.audienceOption,
                broadcastAudience === "vips" && { backgroundColor: C.amber, borderColor: C.amber },
              ]}
            >
              <Ionicons
                name="star"
                size={16}
                color={broadcastAudience === "vips" ? C.white : C.amber}
              />
              <Text
                style={[
                  styles.audienceOptionText,
                  broadcastAudience === "vips" && { color: C.white, fontWeight: "800" },
                ]}
              >
                👑 VIP Only
              </Text>
            </TouchableOpacity>
          </View>

          {broadcastAudience === "vips" ? (
            <View style={styles.vipNoticeBox}>
              <Ionicons name="sparkles" size={16} color={C.amber} />
              <Text style={styles.vipNoticeText}>
                Targets all regular patrons, frequent repeat buyers, and customers with custom discounts.
              </Text>
            </View>
          ) : (
            <View style={[styles.vipNoticeBox, { backgroundColor: C.navyLight, borderColor: "#BFDBFE" }]}>
              <Ionicons name="information-circle" size={16} color={C.navy} />
              <Text style={[styles.vipNoticeText, { color: C.navy }]}>
                Targets all registered parties and walk-in invoice customers with valid phone numbers.
              </Text>
            </View>
          )}

          {/* Template Quick Chips */}
          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>Quick Message Templates:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {MARKETING_TEMPLATES.map((tmpl) => (
              <TouchableOpacity
                key={tmpl.id}
                onPress={() => handleApplyTemplate(tmpl)}
                style={styles.templateChip}
              >
                <Text style={styles.templateChipText}>{tmpl.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Message Input */}
          <Text style={styles.fieldLabel}>Your Broadcast Message:</Text>
          <TextInput
            multiline
            numberOfLines={4}
            style={styles.messageInput}
            placeholder="Type your announcement, festival offer, or discount here..."
            placeholderTextColor={C.slate400}
            value={customBroadcastMsg}
            onChangeText={setCustomBroadcastMsg}
          />

          {/* Send Broadcast Button */}
          <TouchableOpacity
            onPress={handleStartBroadcast}
            disabled={broadcasting}
            style={[styles.primaryButton, { backgroundColor: broadcasting ? C.slate400 : C.emerald }]}
          >
            {broadcasting ? (
              <ActivityIndicator size="small" color={C.white} />
            ) : (
              <>
                <FontAwesome5 name="whatsapp" size={18} color={C.white} />
                <Text style={styles.primaryButtonText}>
                  Launch Broadcast to {broadcastAudience === "vips" ? "VIP Members" : "All Customers"}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.guaranteeNote}>
            🛡️ Safe Multi-Customer Queue · No dropped messages · Sends to every customer
          </Text>
        </View>

        {/* ── Card 2: Catalogue PDF Generator ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: C.emeraldLight }]}>
              <Ionicons name="document-text" size={18} color={C.emerald} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.cardTitle}>Product Catalogue PDF</Text>
              <Text style={styles.cardSubtitle}>Share elegant product brochures directly to WhatsApp</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: C.navyLight }]}>
              <Text style={[styles.badgeText, { color: C.navy }]}>{CATALOGUE_STYLES.length} Themes</Text>
            </View>
          </View>

          <Text style={styles.fieldLabel}>Select PDF Presentation Theme:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {CATALOGUE_STYLES.map((cat) => {
              const isSelected = selectedCatStyle === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setSelectedCatStyle(cat.id)}
                  style={[
                    styles.themeCard,
                    isSelected && { borderColor: C.navy, borderWidth: 2, backgroundColor: C.navyLight },
                  ]}
                >
                  <View style={{ backgroundColor: cat.color || C.navy, height: 4, borderRadius: 2, marginBottom: 6 }} />
                  <Text style={[styles.themeCardTitle, isSelected && { color: C.navy, fontWeight: "800" }]}>
                    {cat.name}
                  </Text>
                  <Text style={styles.themeCardDesc} numberOfLines={2}>
                    {cat.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.stockStatusRow}>
            <Ionicons name="cube-outline" size={16} color={C.navy} />
            <Text style={styles.stockStatusText}>
              {loadingItems ? "Counting inventory..." : `${catalogues.length} active products ready in inventory`}
            </Text>
            <TouchableOpacity onPress={loadMenuItems} style={styles.refreshChip}>
              <Text style={styles.refreshChipText}>Refresh</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={handleShareCatalogue}
            disabled={generatingCatalogue || !catalogues.length}
            style={[
              styles.primaryButton,
              { backgroundColor: catalogues.length ? C.navy : C.slate400, marginTop: 10 },
            ]}
          >
            {generatingCatalogue ? (
              <ActivityIndicator size="small" color={C.white} />
            ) : (
              <>
                <Ionicons name="share-social-outline" size={18} color={C.white} />
                <Text style={styles.primaryButtonText}>Generate & Share Catalogue PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Fail-Safe Bulk Dispatcher Queue Modal ── */}
      <Modal
        visible={queueModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setQueueModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.queueModalCard}>
            {/* Modal Header */}
            <View style={styles.queueModalHeader}>
              <View>
                <Text style={styles.queueModalTitle}>Bulk Message Dispatcher</Text>
                <Text style={styles.queueModalSubtitle}>
                  Progress: {sentCount} of {totalRecipients} dispatched
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setQueueModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color={C.slate600} />
              </TouchableOpacity>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: totalRecipients > 0 ? `${(sentCount / totalRecipients) * 100}%` : "0%" },
                ]}
              />
            </View>

            {/* Current Recipient Highlight Card */}
            {currentRecipient ? (
              <View style={styles.currentCard}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={styles.currentCardBadge}>
                    CUSTOMER #{currentQueueIndex + 1} OF {totalRecipients}
                  </Text>
                  {currentRecipient.isVip && (
                    <View style={styles.vipBadgeSmall}>
                      <Text style={styles.vipBadgeSmallText}>👑 VIP</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.currentCustomerName}>{currentRecipient.name}</Text>
                <Text style={styles.currentCustomerPhone}>+91 {currentRecipient.phone}</Text>

                <TouchableOpacity
                  onPress={() => handleDispatchCustomer(currentQueueIndex)}
                  style={styles.currentSendBtn}
                >
                  <FontAwesome5 name="whatsapp" size={18} color={C.white} />
                  <Text style={styles.currentSendBtnText}>
                    Send to {currentRecipient.name.split(" ")[0]} (WhatsApp)
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={C.white} />
                </TouchableOpacity>

                <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 8 }}>
                  {currentQueueIndex + 1 < totalRecipients && (
                    <TouchableOpacity
                      onPress={() => setCurrentQueueIndex(currentQueueIndex + 1)}
                      style={{ paddingHorizontal: 10, paddingVertical: 4 }}
                    >
                      <Text style={{ color: C.slate600, fontSize: 12, fontWeight: "600" }}>Skip to Next ➔</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : (
              <View style={[styles.currentCard, { alignItems: "center", paddingVertical: 24 }]}>
                <Ionicons name="checkmark-circle" size={48} color={C.emerald} />
                <Text style={{ fontSize: 16, fontWeight: "800", color: C.slate900, marginTop: 8 }}>
                  All Recipients Completed!
                </Text>
                <Text style={{ fontSize: 12, color: C.slate600, marginTop: 4 }}>
                  Every customer in the queue has been handled.
                </Text>
              </View>
            )}

            {/* All Recipients List */}
            <Text style={[styles.fieldLabel, { marginTop: 14, marginBottom: 8 }]}>
              Recipient Queue ({totalRecipients}):
            </Text>
            <FlatList
              data={queueRecipients}
              keyExtractor={(item) => item.phone}
              style={{ maxHeight: 200 }}
              renderItem={({ item, index }) => {
                const isSent = Boolean(sentMap[item.phone]);
                const isCurrent = index === currentQueueIndex;
                return (
                  <View
                    style={[
                      styles.queueRow,
                      isCurrent && { borderColor: C.navy, backgroundColor: C.navyLight },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={styles.queueRowName}>{item.name}</Text>
                        {item.isVip && <Text style={styles.queueVipTag}>VIP</Text>}
                      </View>
                      <Text style={styles.queueRowPhone}>+91 {item.phone}</Text>
                    </View>

                    {isSent ? (
                      <View style={styles.sentBadge}>
                        <Ionicons name="checkmark-done" size={14} color={C.emerald} />
                        <Text style={styles.sentBadgeText}>Sent</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          setCurrentQueueIndex(index);
                          handleDispatchCustomer(index);
                        }}
                        style={styles.rowSendBtn}
                      >
                        <FontAwesome5 name="whatsapp" size={12} color={C.white} />
                        <Text style={styles.rowSendBtnText}>Send</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              }}
            />

            {/* Close Button */}
            <TouchableOpacity
              onPress={() => setQueueModalVisible(false)}
              style={styles.doneBtn}
            >
              <Text style={styles.doneBtnText}>Done / Close Queue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Stylesheet ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  header: {
    backgroundColor: C.navyDark,
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 8,
  },
  headerTitle: {
    color: C.white,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    marginTop: 2,
  },
  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.slate200,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: C.slate900,
  },
  cardSubtitle: {
    fontSize: 11,
    color: C.slate600,
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: C.slate900,
    marginBottom: 6,
  },
  audienceRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  audienceOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.slate200,
    backgroundColor: C.white,
  },
  audienceOptionText: {
    fontSize: 13,
    fontWeight: "700",
    color: C.slate600,
  },
  vipNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.amberLight,
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  vipNoticeText: {
    flex: 1,
    fontSize: 11,
    color: "#92400E",
    fontWeight: "600",
    lineHeight: 16,
  },
  templateChip: {
    backgroundColor: C.slate100,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: C.slate200,
  },
  templateChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: C.slate700 || "#334155",
  },
  messageInput: {
    backgroundColor: C.slate50,
    borderWidth: 1,
    borderColor: C.slate200,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: C.slate900,
    textAlignVertical: "top",
    minHeight: 90,
    marginBottom: 14,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: C.white,
    fontSize: 14,
    fontWeight: "800",
  },
  guaranteeNote: {
    fontSize: 10,
    color: C.slate600,
    textAlign: "center",
    marginTop: 8,
    fontWeight: "600",
  },
  themeCard: {
    width: 130,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.slate200,
    backgroundColor: C.white,
    marginRight: 8,
  },
  themeCardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: C.slate900,
  },
  themeCardDesc: {
    fontSize: 9,
    color: C.slate600,
    marginTop: 2,
  },
  stockStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.slate100,
    padding: 10,
    borderRadius: 10,
    marginVertical: 8,
  },
  stockStatusText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: C.slate900,
    marginLeft: 6,
  },
  refreshChip: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate200,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  refreshChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: C.navy,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    padding: 16,
  },
  queueModalCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 18,
    maxHeight: "85%",
  },
  queueModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  queueModalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: C.slate900,
  },
  queueModalSubtitle: {
    fontSize: 11,
    color: C.slate600,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.slate100,
    justifyContent: "center",
    alignItems: "center",
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: C.slate100,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 14,
  },
  progressBarFill: {
    height: 6,
    backgroundColor: C.emerald,
    borderRadius: 3,
  },
  currentCard: {
    backgroundColor: C.slate50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.emerald,
    padding: 14,
  },
  currentCardBadge: {
    fontSize: 10,
    fontWeight: "800",
    color: C.emerald,
    letterSpacing: 0.5,
  },
  vipBadgeSmall: {
    backgroundColor: C.amberLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  vipBadgeSmallText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#92400E",
  },
  currentCustomerName: {
    fontSize: 17,
    fontWeight: "900",
    color: C.slate900,
    marginTop: 6,
  },
  currentCustomerPhone: {
    fontSize: 13,
    color: C.slate600,
    marginTop: 1,
    marginBottom: 12,
  },
  currentSendBtn: {
    backgroundColor: C.emerald,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  currentSendBtnText: {
    color: C.white,
    fontSize: 13,
    fontWeight: "800",
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.slate200,
    backgroundColor: C.white,
    marginBottom: 6,
  },
  queueRowName: {
    fontSize: 13,
    fontWeight: "700",
    color: C.slate900,
  },
  queueVipTag: {
    backgroundColor: C.amberLight,
    color: "#92400E",
    fontSize: 9,
    fontWeight: "800",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  queueRowPhone: {
    fontSize: 11,
    color: C.slate600,
    marginTop: 1,
  },
  sentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.emeraldLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sentBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: C.emerald,
  },
  rowSendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.emerald,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  rowSendBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: C.white,
  },
  doneBtn: {
    backgroundColor: C.slate100,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  doneBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: C.slate900,
  },
});
