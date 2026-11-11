import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  Alert,
  Linking,
  Platform,
} from "react-native";
import {
  Ionicons,
  MaterialIcons,
  FontAwesome5,
} from "@expo/vector-icons";
import { api } from "../config/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { shareBackendPdf, printTestSlip } from "../utils/receiptPdfGenerator";
import { getCachedData, setCachedData, getMemoryCachedData } from "../utils/localCache";
import { useResponsive, ResponsiveContainer } from "../utils/responsive";

export default function DashboardScreen({
  user,
  isActive = true,
  onOpenDrawer,
  onNavigateTab,
  onCreateInvoice,
  onEditInvoice,
}) {
  const { isWide, isDesktop, headerTopPadding } = useResponsive();
  const memDash = getMemoryCachedData("dashboard_stats");
  const [stats, setStats] = useState(memDash?.stats || null);
  const [recentTransactions, setRecentTransactions] = useState(memDash?.recentTransactions || []);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showBtGuide, setShowBtGuide] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [billLoading, setBillLoading] = useState(false);
  const [printerPaperSize, setPrinterPaperSize] = useState("2inch");

  const executeDeleteInvoice = async (invoiceId) => {
    try {
      setLoading(true);
      const res = await api.invoices.delete(invoiceId);
      if (res && res.success) {
        setSelectedBill(null);
        if (Platform.OS === "web") {
          window.alert(res.message || "Invoice deleted successfully");
        } else {
          Alert.alert("Deleted", res.message || "Invoice deleted successfully");
        }
        await fetchDashboardData();
      } else {
        const msg = res?.message || "Failed to delete invoice";
        if (Platform.OS === "web") {
          window.alert(msg);
        } else {
          Alert.alert("Error", msg);
        }
      }
    } catch (err) {
      const msg = err.message || "Failed to delete invoice";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInvoice = (invoiceId, invoiceNum) => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        `Are you sure you want to permanently delete Bill #${invoiceNum}? This will restore product inventory.`
      );
      if (confirmed) {
        executeDeleteInvoice(invoiceId);
      }
      return;
    }
    Alert.alert(
      "Delete Invoice",
      `Are you sure you want to permanently delete Bill #${invoiceNum}? This will restore product inventory.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => executeDeleteInvoice(invoiceId),
        },
      ]
    );
  };

  const handleEditInvoice = async (tx) => {
    setSelectedBill(null);
    setBillLoading(true);
    try {
      const res = await api.invoices.getOne(tx._id);
      if (res && res.success && res.invoice) {
        if (onEditInvoice) onEditInvoice(res.invoice);
      } else {
        if (onEditInvoice) onEditInvoice(tx);
      }
    } catch {
      if (onEditInvoice) onEditInvoice(tx);
    } finally {
      setBillLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    const cached = await getCachedData("dashboard_stats");
    if (cached) {
      if (cached.stats) setStats(cached.stats);
      if (cached.recentTransactions) setRecentTransactions(cached.recentTransactions);
    } else {
      setLoading(true);
    }
    const res = await api.dashboard.getStats();
    setLoading(false);
    setRefreshing(false);
    if (res && res.success) {
      setStats(res.stats);
      setRecentTransactions(res.recentTransactions || []);
      setCachedData("dashboard_stats", {
        stats: res.stats,
        recentTransactions: res.recentTransactions || [],
      });
    }
  };
  useEffect(() => {
    if (isActive) {
      fetchDashboardData();
    }
  }, [isActive]);

  useEffect(() => {
    AsyncStorage.getItem("billFormatOptions").then((res) => {
      if (res) {
        try {
          const parsed = JSON.parse(res);
          if (parsed.paperWidth) setPrinterPaperSize(parsed.paperWidth);
        } catch { }
      }
    });
  }, []);
  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };
  const handleTestSlip = async () => {
    setTestingPrinter(true);
    try {
      const storeData = {
        businessName: user?.businessName || "My Store",
        phone: user?.phone || "",
        address: user?.address || "",
        email: user?.email || "",
        gstin: user?.gstin || "",
      };
      await printTestSlip(storeData, { paperWidth: printerPaperSize }, "both");
    } catch (e) {
      Alert.alert("Printer Notice", e.message || "Could not launch print service");
    } finally {
      setTestingPrinter(false);
    }
  };
  return (
    <View style={{ flex: 1 }} className="flex-1 bg-slate-50">
      <View
        style={{ paddingTop: headerTopPadding }}
        className="bg-blue-600 px-4 pb-4 flex-row items-center justify-between shadow-md"
      >
        {!isWide ? (
          <TouchableOpacity onPress={onOpenDrawer} className="p-1">
            <Ionicons name="menu" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <View className="flex-row items-center">
            <Ionicons name="speedometer-outline" size={20} color="#BFDBFE" />
            <Text className="text-blue-100 text-xs font-bold ml-1.5 uppercase tracking-wider">
              Dashboard Overview
            </Text>
          </View>
        )}
        <View className="flex-row items-center">
          {user?.logo ? (
            <Image
              source={{ uri: user.logo }}
              style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8, borderWidth: 1, borderColor: "#FFFFFF" }}
            />
          ) : null}
          <Text className="text-white text-base font-extrabold uppercase tracking-widest">
            {user?.businessName || "COMPANY NAME"}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <TouchableOpacity
            onPress={() => setShowBtGuide(true)}
            className="bg-blue-700 p-1.5 rounded-full mr-1 items-center justify-center border border-blue-400"
          >
            <Ionicons name="bluetooth" size={19} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onRefresh} className="p-1">
            <Ionicons name="sync" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: isWide ? 20 : 12, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <ResponsiveContainer maxWidth={1200}>
          <View style={isWide ? { flexDirection: "row", gap: 16, alignItems: "stretch", marginBottom: 16 } : undefined}>
            <View
              style={isWide ? { flex: 1, marginBottom: 0 } : undefined}
              className="bg-white rounded-2xl p-3.5 mb-3.5 border border-blue-300 shadow-xs flex-row items-center justify-between"
            >
              <View className="flex-row items-center flex-1 mr-2">
                <View className="w-10 h-10 rounded-xl bg-blue-600 items-center justify-center mr-3 shadow-xs">
                  <Ionicons name="bluetooth" size={22} color="#FFFFFF" />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text className="text-xs font-black text-gray-900 uppercase tracking-wider">
                      Thermal Printer
                    </Text>
                    <View className="ml-2 bg-emerald-100 px-1.5 py-0.2 rounded-full flex-row items-center">
                      <View className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1" />
                      <Text className="text-[9px] font-bold text-emerald-800">Ready</Text>
                    </View>
                  </View>
                  <Text className="text-[11px] text-gray-500 font-medium mt-0.5">
                    58mm / 80mm Bluetooth printer connection
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-1.5">
                <TouchableOpacity
                  onPress={handleTestSlip}
                  disabled={testingPrinter}
                  className="bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-xl flex-row items-center active:bg-blue-100"
                >
                  {testingPrinter ? (
                    <ActivityIndicator size="small" color="#2563EB" />
                  ) : (
                    <>
                      <Ionicons name="print-outline" size={13} color="#2563EB" />
                      <Text className="text-blue-700 text-[11px] font-bold ml-1">Test Print</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowBtGuide(true)}
                  className="bg-blue-600 px-3 py-1.5 rounded-xl flex-row items-center shadow-xs"
                >
                  <Ionicons name="bluetooth-outline" size={13} color="#FFFFFF" />
                  <Text className="text-white text-[11px] font-bold ml-1">Connect</Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => (onNavigateTab ? onNavigateTab("reports") : onRefresh())}
              activeOpacity={0.85}
              style={isWide ? { flex: 1.4, marginBottom: 0 } : undefined}
              className="bg-white rounded-2xl p-4 mb-4 border border-blue-200 shadow-sm"
            >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Reports Overview
            </Text>
            <View className="flex-row items-center">
              <Text className="text-xs font-bold text-blue-600 mr-1">
                Check Reports
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#2563EB" />
            </View>
          </View>
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-xs text-gray-500">Today Sales</Text>
              <Text className="text-2xl font-black text-gray-900 mt-0.5">
                Rs. {stats?.todaySalesTotal || 0}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-xs text-gray-500">Invoices</Text>
              <Text className="text-base font-bold text-blue-700 mt-0.5">
                {stats?.todayInvoiceCount || 0} bills
              </Text>
            </View>
          </View>
          <View className="flex-row gap-2 mt-3 pt-3 border-t border-gray-100">
            <View className="flex-1 bg-blue-50/70 p-2 rounded-lg">
              <Text className="text-[10px] text-gray-500">Regular Customers</Text>
              <Text className="text-xs font-bold text-blue-900 mt-0.5">
                {stats?.regularCustomers || 0} active
              </Text>
            </View>
            <View className="flex-1 bg-amber-50/70 p-2 rounded-lg">
              <Text className="text-[10px] text-gray-500">To Collect (Udhar)</Text>
              <Text className="text-xs font-bold text-amber-900 mt-0.5">
                Rs. {stats?.totalReceivable || 0}
              </Text>
            </View>
            <View className="flex-1 bg-red-50/70 p-2 rounded-lg">
              <Text className="text-[10px] text-gray-500">Low Stock</Text>
              <Text className="text-xs font-bold text-red-700 mt-0.5">
                {stats?.lowStockCount || 0} items
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        </View>
        <View className="flex-row items-center justify-between mb-2 px-1">
          <View>
            <Text className="text-xs font-extrabold text-gray-700 uppercase tracking-widest">
              Today's Sale Transactions
            </Text>
            <Text className="text-[10px] text-gray-400">
              Resets daily at midnight • Full history in Reports
            </Text>
          </View>
          <View className="bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
            <Text className="text-[10px] font-bold text-blue-700">
              {recentTransactions.length} today
            </Text>
          </View>
        </View>
        {loading && !refreshing ? (
          <View className="py-12 items-center">
            <ActivityIndicator size="small" color="#2563EB" />
          </View>
        ) : recentTransactions.length === 0 ? (
          <TouchableOpacity
            onPress={onCreateInvoice}
            activeOpacity={0.8}
            className="bg-white rounded-2xl p-8 items-center justify-center border border-gray-200 active:bg-blue-50"
          >
            <FontAwesome5 name="file-invoice-dollar" size={36} color="#2563EB" />
            <Text className="text-gray-700 font-bold text-sm mt-3">
              No sales recorded yet today
            </Text>
            <Text className="text-gray-400 text-center text-xs mt-1">
              Recent transactions reset fresh daily. Past invoices are safely stored in Reports ➔ Sales.
            </Text>
            <Text className="text-blue-600 font-bold text-xs mt-2">
              Tap here or "+ Sale Invoice" below to create today's first bill!
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={isWide ? { flexDirection: "row", flexWrap: "wrap", gap: 12 } : undefined}>
            {recentTransactions.map((tx) => (
              <TouchableOpacity
                key={tx._id}
                activeOpacity={0.8}
                style={isWide ? { width: isDesktop ? "48.9%" : "48.6%", marginBottom: 0 } : undefined}
                onPress={async () => {
                  setBillLoading(true);
                  try {
                    const res = await api.invoices.getOne(tx._id);
                    if (res && res.success && res.invoice) {
                      setSelectedBill(res.invoice);
                    } else {
                      setSelectedBill(tx);
                    }
                  } catch {
                    setSelectedBill(tx);
                  } finally {
                    setBillLoading(false);
                  }
                }}
                className="bg-white rounded-xl p-3.5 mb-2.5 border border-gray-200 shadow-sm flex-row items-center justify-between active:bg-blue-50"
              >
              <View className="flex-1 pr-2">
                <View className="flex-row items-center">
                  <Text className="text-sm font-extrabold text-gray-900 mr-2">
                    {tx.partyName || "Cash Sale"}
                  </Text>
                  {tx.isRegularCustomer ? (
                    <View className="bg-amber-100 px-1.5 py-0.2 rounded">
                      <Text className="text-[9px] font-bold text-amber-800">
                        Regular
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-[11px] text-gray-500 mt-0.5 font-bold">
                  Bill #{tx.invoiceNumber} • {new Date(tx.invoiceDate || tx.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
                {tx.items && tx.items.length > 0 ? (
                  <Text className="text-xs text-blue-900 font-semibold mt-1" numberOfLines={2}>
                    🛍️ {tx.items.map((it) => `${it.name || it.itemName} (x${it.quantity || it.qty || 1})`).join(", ")}
                  </Text>
                ) : null}
                <View className="flex-row items-center gap-1.5 mt-2">
                  <View
                    className={`px-2 py-0.5 rounded border ${tx.paymentMode === "CASH"
                        ? "bg-emerald-50 border-emerald-300"
                        : tx.paymentMode === "UPI"
                          ? "bg-purple-50 border-purple-300"
                          : tx.paymentMode === "UPI/CASH"
                            ? "bg-amber-50 border-amber-300"
                            : "bg-blue-50 border-blue-300"
                      }`}
                  >
                    <Text
                      className={`text-[10px] font-bold ${tx.paymentMode === "CASH"
                          ? "text-emerald-700"
                          : tx.paymentMode === "UPI"
                            ? "text-purple-700"
                            : tx.paymentMode === "UPI/CASH"
                              ? "text-amber-800"
                              : "text-blue-700"
                        }`}
                    >
                      {tx.paymentMode}
                    </Text>
                  </View>
                  <Text className="text-[10px] text-blue-500 font-bold">Tap to view full bill details →</Text>
                </View>
              </View>
              <View className="items-end justify-between ml-2">
                <Text className="text-base font-black text-gray-900 mb-1">
                  Rs. {tx.grandTotal}
                </Text>
                <View className="flex-row items-center gap-1.5 mt-1">
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation && e.stopPropagation();
                      handleEditInvoice(tx);
                    }}
                    className="bg-blue-50 border border-blue-300 px-2.5 py-1.5 rounded-lg flex-row items-center active:bg-blue-100"
                  >
                    <Ionicons name="create-outline" size={13} color="#2563EB" />
                    <Text className="text-blue-800 text-[11px] font-bold ml-1">Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation && e.stopPropagation();
                      handleDeleteInvoice(tx._id, tx.invoiceNumber);
                    }}
                    className="bg-red-50 border border-red-300 px-2.5 py-1.5 rounded-lg flex-row items-center active:bg-red-100"
                  >
                    <Ionicons name="trash-outline" size={13} color="#DC2626" />
                    <Text className="text-red-700 text-[11px] font-bold ml-1">Del</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))}
          </View>
        )}
        </ResponsiveContainer>
      </ScrollView>
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", bottom: 16, left: 0, right: 0, alignItems: "center", zIndex: 50, elevation: 8 }}
      >
        <TouchableOpacity
          onPress={onCreateInvoice}
          activeOpacity={0.85}
          className="bg-blue-600 px-8 py-3.5 rounded-full shadow-lg shadow-blue-600/40 flex-row items-center border border-blue-400"
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
          <Text className="text-white font-extrabold text-sm ml-1.5 uppercase tracking-wider">
            Sale Invoice
          </Text>
        </TouchableOpacity>
      </View>
      {/* Bill loading overlay */}
      {billLoading && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.3)", justifyContent: "center", alignItems: "center", zIndex: 999 }}>
          <View style={{ backgroundColor: "#FFFFFF", borderRadius: 16, padding: 24, alignItems: "center" }}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={{ marginTop: 10, fontWeight: "bold", color: "#374151" }}>Loading Bill...</Text>
          </View>
        </View>
      )}

      {/* Bill Detail Modal */}
      <Modal visible={!!selectedBill} animationType="slide" transparent={true} onRequestClose={() => setSelectedBill(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: isWide ? "center" : "flex-end", alignItems: isWide ? "center" : "stretch", padding: isWide ? 24 : 0 }}>
          {!isWide && (
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => setSelectedBill(null)}
            />
          )}
          <View style={{ backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: isWide ? 24 : 0, borderBottomRightRadius: isWide ? 24 : 0, height: isWide ? "auto" : "82%", maxHeight: "90%", width: "100%", maxWidth: isWide ? 560 : undefined, display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }}>
              <View>
                <Text style={{ fontSize: 17, fontWeight: "900", color: "#111827" }}>Bill #{selectedBill?.invoiceNumber}</Text>
                <Text style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                  {selectedBill?.invoiceDate ? new Date(selectedBill.invoiceDate).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedBill(null)} style={{ padding: 6 }}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} showsVerticalScrollIndicator={true}>
              {/* Customer Info */}
              {selectedBill?.partyName ? (
                <View style={{ backgroundColor: "#EFF6FF", borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="person-circle-outline" size={20} color="#2563EB" />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={{ fontWeight: "800", color: "#1E40AF", fontSize: 13 }}>{selectedBill.partyName}</Text>
                    {selectedBill.partyPhone ? <Text style={{ color: "#3B82F6", fontSize: 11 }}>{selectedBill.partyPhone}</Text> : null}
                  </View>
                </View>
              ) : null}

              {/* Items Table */}
              <View style={{ backgroundColor: "#F9FAFB", borderRadius: 12, overflow: "hidden", marginBottom: 12, borderWidth: 1, borderColor: "#E5E7EB" }}>
                <View style={{ flexDirection: "row", backgroundColor: "#2563EB", paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ flex: 3, color: "#FFFFFF", fontSize: 11, fontWeight: "800" }}>Item</Text>
                  <Text style={{ flex: 1, color: "#FFFFFF", fontSize: 11, fontWeight: "800", textAlign: "center" }}>Qty</Text>
                  <Text style={{ flex: 1.5, color: "#FFFFFF", fontSize: 11, fontWeight: "800", textAlign: "right" }}>Amount</Text>
                </View>
                {(selectedBill?.items || []).length === 0 ? (
                  <View style={{ padding: 14, alignItems: "center" }}>
                    <Text style={{ color: "#9CA3AF", fontSize: 12 }}>No items recorded for this bill.</Text>
                  </View>
                ) : (
                  (selectedBill?.items || []).map((it, idx) => {
                    const price = Number(it.sellingPrice || it.price || it.rate || 0);
                    const qty = Number(it.quantity || it.qty || 1);
                    const total = Number(it.total || it.amount || (price * qty) || 0);
                    return (
                      <View key={idx} style={{ flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#F3F4F6", backgroundColor: idx % 2 === 0 ? "#FFFFFF" : "#F9FAFB", alignItems: "center" }}>
                        <View style={{ flex: 3, paddingRight: 4 }}>
                          <Text style={{ fontSize: 12, color: "#111827", fontWeight: "700" }} numberOfLines={2}>
                            {it.name || it.itemName || "Item"}
                          </Text>
                          {price > 0 ? (
                            <Text style={{ fontSize: 10, color: "#6B7280", marginTop: 1 }}>
                              Rs. {price} / {it.unit || "unit"}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={{ flex: 1, fontSize: 12, color: "#374151", fontWeight: "600", textAlign: "center" }}>{qty}</Text>
                        <Text style={{ flex: 1.5, fontSize: 12, color: "#111827", fontWeight: "800", textAlign: "right" }}>Rs. {total.toLocaleString("en-IN")}</Text>
                      </View>
                    );
                  })
                )}
              </View>

              {/* Totals */}
              <View style={{ backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 16 }}>
                {selectedBill?.subtotal ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ color: "#6B7280", fontSize: 12 }}>Subtotal</Text>
                    <Text style={{ color: "#374151", fontWeight: "600", fontSize: 12 }}>Rs. {Number(selectedBill.subtotal || 0).toLocaleString("en-IN")}</Text>
                  </View>
                ) : null}
                {selectedBill?.discountTotal > 0 ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ color: "#059669", fontSize: 12 }}>Discount</Text>
                    <Text style={{ color: "#059669", fontWeight: "600", fontSize: 12 }}>- Rs. {Number(selectedBill.discountTotal || 0).toLocaleString("en-IN")}</Text>
                  </View>
                ) : null}
                {selectedBill?.taxTotal > 0 ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ color: "#6B7280", fontSize: 12 }}>GST / Tax</Text>
                    <Text style={{ color: "#374151", fontWeight: "600", fontSize: 12 }}>Rs. {Number(selectedBill.taxTotal || 0).toLocaleString("en-IN")}</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 10, marginTop: 4 }}>
                  <Text style={{ color: "#111827", fontSize: 15, fontWeight: "900" }}>Total</Text>
                  <Text style={{ color: "#2563EB", fontSize: 15, fontWeight: "900" }}>Rs. {Number(selectedBill?.grandTotal || 0).toLocaleString("en-IN")}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                  <Text style={{ color: "#6B7280", fontSize: 11 }}>Payment</Text>
                  <Text style={{ color: "#374151", fontSize: 11, fontWeight: "700" }}>{selectedBill?.paymentMode || "CASH"}</Text>
                </View>
              </View>

              {/* Action Buttons: Edit & Delete */}
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                <TouchableOpacity
                  onPress={() => {
                    const inv = selectedBill;
                    handleEditInvoice(inv);
                  }}
                  style={{ flex: 1, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE", borderRadius: 12, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="create-outline" size={16} color="#2563EB" />
                  <Text style={{ color: "#1D4ED8", fontWeight: "800", fontSize: 13, marginLeft: 6 }}>Edit Bill</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleDeleteInvoice(selectedBill._id, selectedBill.invoiceNumber)}
                  style={{ flex: 1, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 12, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  <Text style={{ color: "#DC2626", fontWeight: "800", fontSize: 13, marginLeft: 6 }}>Delete Bill</Text>
                </TouchableOpacity>
              </View>

              {/* Share Button */}
              <TouchableOpacity
                onPress={async () => {
                  if (selectedBill) await shareBackendPdf(selectedBill, `Invoice_${selectedBill.invoiceNumber || selectedBill._id}.pdf`);
                }}
                style={{ backgroundColor: "#25D366", borderRadius: 14, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center" }}
              >
                <FontAwesome5 name="whatsapp" size={16} color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 14, marginLeft: 8 }}>Share Bill on WhatsApp</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showBtGuide} animationType="slide" transparent={true}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 }}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <View className="w-8 h-8 rounded-full bg-blue-100 items-center justify-center mr-2">
                  <Ionicons name="bluetooth" size={18} color="#2563EB" />
                </View>
                <Text className="text-base font-extrabold text-gray-900">
                  Connect Bluetooth Printer
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowBtGuide(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-3">
              <Text className="text-xs font-bold text-blue-900 mb-1">
                How to Connect VEER B41 Thermal Printer:
              </Text>
              <Text className="text-xs text-blue-800 leading-5">
                1. <Text className="font-bold">Turn ON</Text> your VEER B41 printer (power on).{"\n"}
                2. Open phone <Text className="font-bold">Settings ➔ Bluetooth</Text>, scan & pair with <Text className="font-bold">B41</Text> (PIN is <Text className="font-bold">1234</Text> or <Text className="font-bold">0000</Text>).{"\n"}
                3. Because VEER B41 uses Bluetooth (not Wi-Fi), install the free <Text className="font-bold">RawBT Driver</Text> below to stop "Searching for printers" and print in 1 tap!
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => Linking.openURL("https://play.google.com/store/apps/details?id=ru.a402d.rawbtprinter")}
              className="bg-emerald-600 py-2.5 rounded-xl flex-row items-center justify-center mb-3 shadow-xs"
            >
              <Ionicons name="download-outline" size={16} color="#FFFFFF" />
              <Text className="text-white text-xs font-bold ml-1.5">
                Install VEER B41 Driver (RawBT on Play Store)
              </Text>
            </TouchableOpacity>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleTestSlip}
                disabled={testingPrinter}
                className="flex-1 bg-blue-600 py-3 rounded-xl items-center flex-row justify-center shadow-sm"
              >
                {testingPrinter ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="print" size={16} color="#FFFFFF" />
                    <Text className="text-white text-xs font-bold ml-1.5">
                      Send Test Print Slip
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowBtGuide(false);
                  if (onNavigateTab) onNavigateTab("settings");
                }}
                className="flex-1 bg-gray-100 py-3 rounded-xl items-center flex-row justify-center border border-gray-200"
              >
                <Ionicons name="settings-outline" size={16} color="#374151" />
                <Text className="text-gray-800 text-xs font-bold ml-1.5">
                  Printer Settings
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => setShowBtGuide(false)}
              className="mt-3 py-2 items-center"
            >
              <Text className="text-gray-500 font-bold text-xs">Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}