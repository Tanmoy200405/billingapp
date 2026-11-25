import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
} from "react-native";
import { Ionicons, MaterialIcons, FontAwesome5 } from "@expo/vector-icons";
import { api } from "../config/api";
import { downloadReportFile } from "../utils/reportDownloader";
import { shareBackendPdf } from "../utils/receiptPdfGenerator";
import { getCachedData, setCachedData, getMemoryCachedData } from "../utils/localCache";
import { useResponsive, ResponsiveContainer } from "../utils/responsive";
import { REPORTS_CATALOG, REPORT_CATEGORIES } from "../data/reportsCatalog";

export default function ReportsScreen({ isActive = true, onOpenDrawer, onBack }) {
  const { isWide, headerTopPadding } = useResponsive();
  
  // Clean top navigation: "overview" or "hub"
  const [activeTab, setActiveTab] = useState("overview");
  const [period, setPeriod] = useState("today");
  const [topDays, setTopDays] = useState(365);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Cached overview data
  const [salesData, setSalesData] = useState(() => getMemoryCachedData("reports_sales_today") || null);
  const [inventoryItems, setInventoryItems] = useState(() => {
    const c = getMemoryCachedData("items_all");
    return Array.isArray(c) ? c : [];
  });
  const [parties, setParties] = useState(() => {
    const c = getMemoryCachedData("parties_all");
    return Array.isArray(c) ? c : [];
  });
  const [topItemsData, setTopItemsData] = useState(() => {
    const c = getMemoryCachedData("reports_topItems_365");
    return Array.isArray(c?.topItems) ? c.topItems : [];
  });
  const [overallTopData, setOverallTopData] = useState(() => {
    const c = getMemoryCachedData("reports_topItems_365");
    return Array.isArray(c?.overallTop) ? c.overallTop : [];
  });
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Reports Directory Hub State
  const [hubSearch, setHubSearch] = useState("");
  const [hubPeriod, setHubPeriod] = useState("today");
  const [expandedCategory, setExpandedCategory] = useState("sales"); // default expand 1st category

  // Active Report Viewer Modal State
  const [activeReportModal, setActiveReportModal] = useState(null);
  const [reportResultData, setReportResultData] = useState(null);
  const [loadingReportRun, setLoadingReportRun] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);

  // Category sales modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [loadingCategorySales, setLoadingCategorySales] = useState(false);
  const [categorySalesData, setCategorySalesData] = useState(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("All");

  const loadData = async () => {
    let hasCached = false;
    try {
      const c = await getCachedData(`reports_sales_${period}`);
      if (c) {
        setSalesData(c);
        hasCached = true;
      }
      if (!hasCached) setLoading(true);
      const res = await api.reports.getSales(`period=${period}`);
      if (res.success) {
        setSalesData(res);
        setCachedData(`reports_sales_${period}`, res);
      }

      // Also refresh inventory valuation and parties if needed
      api.items.getAll().then((r) => {
        if (r?.success && Array.isArray(r.items)) {
          setInventoryItems(r.items);
          setCachedData("items_all", r.items);
        }
      }).catch(() => {});

      api.parties.getAll().then((r) => {
        if (r?.success && r.parties) {
          setParties(r.parties);
          setCachedData("parties_all", r.parties);
        }
      }).catch(() => {});

      api.reports.getTopItems(`days=${topDays}`).then((r) => {
        if (r?.success) {
          if (Array.isArray(r.topItems)) setTopItemsData(r.topItems);
          if (Array.isArray(r.overallTop)) setOverallTopData(r.overallTop);
          setCachedData(`reports_topItems_${topDays}`, r);
        }
      }).catch(() => {});
    } catch (e) {
      console.warn("Reports loadData notice:", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      loadData();
    }
  }, [period, topDays, isActive]);

  const handleOpenReportViewer = async (report) => {
    setActiveReportModal(report);
    setLoadingReportRun(true);
    setReportResultData(null);
    try {
      const res = await api.reports.runReport(report.id, `period=${hubPeriod}`);
      if (res?.success) {
        setReportResultData(res);
      } else {
        Alert.alert("Report Notice", res?.message || "Could not generate report data.");
      }
    } catch (err) {
      Alert.alert("Report Error", err.message || "Failed to load report data.");
    } finally {
      setLoadingReportRun(false);
    }
  };

  const handleDownloadHubReport = async (report, format = "pdf") => {
    setDownloadingReport(true);
    try {
      const url = api.reports.getExportUrl(report.id, format, `period=${hubPeriod}`);
      const filename = `${report.title.replace(/[^a-zA-Z0-9_-]/g, "_")}_${hubPeriod}.${format}`;
      const mime = format === "pdf" ? "application/pdf" : "text/csv";
      await downloadReportFile(url, filename, mime);
    } catch (err) {
      Alert.alert("Download Notice", err.message || "Failed to download report file.");
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleOpenCategorySales = async () => {
    setShowCategoryModal(true);
    setLoadingCategorySales(true);
    try {
      const res = await api.reports.getCategorySales(365);
      if (res.success) {
        setCategorySalesData(res);
      } else {
        Alert.alert("Notice", res.message || "Failed to load category sales data");
      }
    } catch (err) {
      Alert.alert("Error", err.message || "Could not fetch category sales");
    } finally {
      setLoadingCategorySales(false);
    }
  };

  const handleDownloadGeneral = async (type = "sales", format = "pdf") => {
    setDownloading(true);
    let url = "";
    let fileName = "";
    let mimeType = format === "pdf" ? "application/pdf" : "text/csv";
    const timestamp = new Date().toISOString().slice(0, 10);
    if (type === "sales") {
      url = api.reports.getSalesPdfUrl(`period=${period}`);
      fileName = `SalesReport_${period}_${timestamp}.pdf`;
    } else if (type === "inventory") {
      url = api.reports.getInventoryPdfUrl();
      fileName = `InventoryReport_${timestamp}.pdf`;
    } else if (type === "parties") {
      url = api.reports.getPartiesPdfUrl();
      fileName = `CustomerLedger_${timestamp}.pdf`;
    }
    try {
      const res = await downloadReportFile(url, fileName, mimeType);
      if (!res.success && res.error) {
        Alert.alert("Download Note", res.error);
      }
    } catch (e) {
      Alert.alert("Download Error", e.message || "Could not complete download");
    } finally {
      setDownloading(false);
    }
  };

  // Top 5 essential popular reports for quick access
  const POPULAR_REPORT_IDS = [
    "daily_sales_summary",
    "gstr1_summary",
    "item_wise_sales",
    "low_stock_reorder",
    "table_turnover_rate",
  ];
  const popularReports = REPORTS_CATALOG.filter((r) => POPULAR_REPORT_IDS.includes(r.id));

  // Filtered reports for search
  const isSearching = Boolean(hubSearch.trim());
  const searchResults = isSearching
    ? REPORTS_CATALOG.filter(
        (r) =>
          r.title?.toLowerCase().includes(hubSearch.toLowerCase()) ||
          r.description?.toLowerCase().includes(hubSearch.toLowerCase()) ||
          r.category?.toLowerCase().includes(hubSearch.toLowerCase())
      )
    : [];

  return (
    <View style={{ flex: 1 }} className="flex-1 bg-slate-50">
      {/* ── Header ── */}
      <View style={{ paddingTop: headerTopPadding }} className="bg-blue-600 px-4 pb-3 shadow-sm">
        <ResponsiveContainer maxWidth={1120} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View className="flex-row items-center">
            {!isWide && (
              <TouchableOpacity onPress={onOpenDrawer} className="mr-3 p-1">
                <Ionicons name="menu" size={26} color="#FFFFFF" />
              </TouchableOpacity>
            )}
            <View>
              <Text className="text-white text-lg font-black tracking-wide">
                Analytics & Reports
              </Text>
              <Text className="text-blue-100 text-[10px] font-medium">
                Real-time metrics, tax compliance & full catalog
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={loadData}
            disabled={loading}
            className="bg-white/20 p-2 rounded-xl border border-white/30"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="refresh" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </ResponsiveContainer>
      </View>

      {/* ── Clean 2-Tab Navigation Switcher ── */}
      <View className="bg-white border-b border-slate-200 px-3 py-2">
        <ResponsiveContainer maxWidth={1120} style={{ flexDirection: "row" }}>
          <TouchableOpacity
            onPress={() => setActiveTab("overview")}
            className={`flex-1 py-2.5 rounded-xl items-center flex-row justify-center mx-1 transition-all ${
              activeTab === "overview" ? "bg-blue-600 shadow-xs" : "bg-slate-100"
            }`}
          >
            <Ionicons
              name="stats-chart"
              size={15}
              color={activeTab === "overview" ? "#FFFFFF" : "#64748B"}
            />
            <Text
              className={`text-xs font-black ml-1.5 ${
                activeTab === "overview" ? "text-white" : "text-slate-700"
              }`}
            >
              Overview & KPIs
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setActiveTab("hub")}
            className={`flex-1 py-2.5 rounded-xl items-center flex-row justify-center mx-1 transition-all ${
              activeTab === "hub" ? "bg-blue-600 shadow-xs" : "bg-slate-100"
            }`}
          >
            <Ionicons
              name="folder-open"
              size={15}
              color={activeTab === "hub" ? "#FFFFFF" : "#64748B"}
            />
            <Text
              className={`text-xs font-black ml-1.5 ${
                activeTab === "hub" ? "text-white" : "text-slate-700"
              }`}
            >
              All Reports (55+)
            </Text>
          </TouchableOpacity>
        </ResponsiveContainer>
      </View>

      {/* ── Main Content Area ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: isWide ? 20 : 14, paddingBottom: 120, flexGrow: 1 }}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} />}
      >
        <ResponsiveContainer maxWidth={1120}>
          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB 1: OVERVIEW & KPIS (CLEAN & UNCLUTTERED)                  */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "overview" && (
            <View>
              {/* Period Selector Pills */}
              <View className="flex-row gap-1.5 mb-4 bg-white p-1.5 rounded-2xl border border-slate-200">
                {[
                  { id: "today", label: "Today" },
                  { id: "yesterday", label: "Yesterday" },
                  { id: "week", label: "Last 7 Days" },
                  { id: "month", label: "This Month" },
                  { id: "365", label: "Yearly" },
                ].map((p) => {
                  const isSelected = period === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => setPeriod(p.id)}
                      className={`flex-1 py-2 rounded-xl items-center justify-center ${
                        isSelected ? "bg-blue-600 shadow-xs" : "bg-transparent"
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? "text-white" : "text-slate-600"
                        }`}
                      >
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 4 Clean Hero KPI Cards */}
              <View className="flex-row gap-2.5 mb-2.5">
                <View className="flex-1 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[11px] font-bold text-slate-500 uppercase">Gross Sales</Text>
                    <Ionicons name="cash-outline" size={16} color="#2563EB" />
                  </View>
                  <Text className="text-xl font-black text-slate-900 mt-1">
                    Rs. {Number(salesData?.summary?.totalSales || 0).toLocaleString("en-IN")}
                  </Text>
                  <Text className="text-[10px] text-slate-400 mt-0.5">
                    {salesData?.summary?.totalBills || 0} Bills Generated
                  </Text>
                </View>

                <View className="flex-1 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[11px] font-bold text-slate-500 uppercase">Discounts</Text>
                    <Ionicons name="pricetag-outline" size={16} color="#059669" />
                  </View>
                  <Text className="text-xl font-black text-emerald-600 mt-1">
                    Rs. {Number(salesData?.summary?.totalDiscount || 0).toLocaleString("en-IN")}
                  </Text>
                  <Text className="text-[10px] text-slate-400 mt-0.5">
                    Diner Savings Given
                  </Text>
                </View>
              </View>

              {/* Payment Split & Tax Row */}
              <View className="flex-row gap-2 mb-3">
                <View className="flex-1 bg-emerald-50/80 p-3 rounded-xl border border-emerald-200">
                  <Text className="text-[10px] font-bold text-emerald-800">Cash Collected</Text>
                  <Text className="text-sm font-black text-emerald-950 mt-0.5">
                    Rs. {Number(salesData?.summary?.totalCash || 0).toLocaleString("en-IN")}
                  </Text>
                </View>
                <View className="flex-1 bg-blue-50/80 p-3 rounded-xl border border-blue-200">
                  <Text className="text-[10px] font-bold text-blue-800">UPI Received</Text>
                  <Text className="text-sm font-black text-blue-950 mt-0.5">
                    Rs. {Number(salesData?.summary?.totalUpi || 0).toLocaleString("en-IN")}
                  </Text>
                </View>
                <View className="flex-1 bg-slate-100 p-3 rounded-xl border border-slate-300">
                  <Text className="text-[10px] font-bold text-slate-700">GST Collected</Text>
                  <Text className="text-sm font-black text-slate-900 mt-0.5">
                    Rs. {Number(salesData?.summary?.totalTax || 0).toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>

              {/* Channel Distribution (Dine-in / Swiggy / Zomato) */}
              <View className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs mb-4">
                <Text className="text-xs font-black text-slate-800 mb-2 uppercase tracking-wide">
                  Order Channels Breakdown
                </Text>
                <View className="flex-row gap-2">
                  <View className="flex-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <Text className="text-[10px] font-bold text-slate-600">Dine-in / Counter</Text>
                    <Text className="text-sm font-black text-slate-900 mt-0.5">
                      Rs. {Number(salesData?.summary?.totalCounter || 0).toLocaleString("en-IN")}
                    </Text>
                    <Text className="text-[10px] text-slate-400">
                      {salesData?.summary?.counterOrders || 0} orders
                    </Text>
                  </View>
                  <View className="flex-1 bg-orange-50/70 p-2.5 rounded-xl border border-orange-200">
                    <Text className="text-[10px] font-bold text-orange-700">Swiggy Delivery</Text>
                    <Text className="text-sm font-black text-orange-950 mt-0.5">
                      Rs. {Number(salesData?.summary?.totalSwiggy || 0).toLocaleString("en-IN")}
                    </Text>
                    <Text className="text-[10px] text-orange-600">
                      {salesData?.summary?.swiggyOrders || 0} orders
                    </Text>
                  </View>
                  <View className="flex-1 bg-red-50/70 p-2.5 rounded-xl border border-red-200">
                    <Text className="text-[10px] font-bold text-red-700">Zomato Delivery</Text>
                    <Text className="text-sm font-black text-red-950 mt-0.5">
                      Rs. {Number(salesData?.summary?.totalZomato || 0).toLocaleString("en-IN")}
                    </Text>
                    <Text className="text-[10px] text-red-600">
                      {salesData?.summary?.zomatoOrders || 0} orders
                    </Text>
                  </View>
                </View>
              </View>

              {/* Quick Export Strip (Single Row, 0 Clutter) */}
              <View className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs mb-4 flex-row items-center justify-between">
                <View className="flex-1 mr-3">
                  <Text className="text-xs font-black text-slate-900">
                    Instant Official PDF Exports
                  </Text>
                  <Text className="text-[10px] text-slate-500">
                    Generate formatted A4 audit reports for {period.toUpperCase()}
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => handleDownloadGeneral("sales", "pdf")}
                    disabled={downloading}
                    className="bg-red-600 px-3 py-2 rounded-xl flex-row items-center shadow-xs"
                  >
                    <Ionicons name="document-text" size={14} color="#FFFFFF" />
                    <Text className="text-white text-xs font-extrabold ml-1.5">Sales PDF</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleDownloadGeneral("parties", "pdf")}
                    disabled={downloading}
                    className="bg-blue-600 px-3 py-2 rounded-xl flex-row items-center shadow-xs"
                  >
                    <Ionicons name="people" size={14} color="#FFFFFF" />
                    <Text className="text-white text-xs font-extrabold ml-1.5">Ledger PDF</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Overall Top Selling Items Banner */}
              <View className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs mb-4">
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center">
                    <Ionicons name="trophy" size={18} color="#EAB308" />
                    <Text className="text-xs font-black text-slate-900 ml-1.5 uppercase tracking-wider">
                      Top Selling Dishes
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleOpenCategorySales}
                    className="bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 flex-row items-center"
                  >
                    <Text className="text-[11px] font-bold text-blue-700">Category Breakdown ➔</Text>
                  </TouchableOpacity>
                </View>

                {(!Array.isArray(overallTopData) || overallTopData.length === 0) ? (
                  <View className="py-4 items-center">
                    <Text className="text-xs text-slate-400">No dish sales recorded yet in this period</Text>
                  </View>
                ) : (
                  (Array.isArray(overallTopData) ? overallTopData : []).slice(0, 4).map((it, idx) => (
                    <View
                      key={idx}
                      className="flex-row items-center justify-between py-2 border-b border-slate-100 last:border-b-0"
                    >
                      <View className="flex-row items-center flex-1 pr-2">
                        <View
                          style={{
                            backgroundColor: idx === 0 ? "#EAB308" : idx === 1 ? "#94A3B8" : idx === 2 ? "#B45309" : "#F1F5F9",
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 8,
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "900", color: idx < 3 ? "#FFFFFF" : "#64748B" }}>
                            {idx + 1}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-xs font-bold text-slate-900" numberOfLines={1}>
                            {it.name || "Item"}
                          </Text>
                          <Text className="text-[10px] text-slate-500">
                            {it.category ? `${it.category} • ` : ""}Sold: <Text className="font-extrabold text-blue-700">{it.totalQty} units</Text>
                          </Text>
                        </View>
                      </View>
                      <View className="items-end">
                        <Text className="text-xs font-black text-emerald-700">
                          Rs. {Number(it.totalRevenue || 0).toLocaleString("en-IN")}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* Recent Invoices List */}
              <View className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mb-6">
                <View className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex-row justify-between items-center">
                  <Text className="text-xs font-black text-slate-700 uppercase tracking-wide">
                    Recent Bills ({salesData?.invoices?.length || 0})
                  </Text>
                  <Text className="text-[10px] text-slate-400 font-bold">Tap bill for details</Text>
                </View>

                {(salesData?.invoices || []).length === 0 ? (
                  <View className="py-8 items-center">
                    <Ionicons name="receipt-outline" size={32} color="#CBD5E1" />
                    <Text className="text-xs text-slate-400 mt-2">No bills generated in this period</Text>
                  </View>
                ) : (
                  (salesData?.invoices || []).slice(0, 10).map((inv) => (
                    <TouchableOpacity
                      key={inv._id}
                      activeOpacity={0.8}
                      onPress={() => setSelectedInvoice(inv)}
                      className="px-4 py-2.5 border-b border-slate-100 flex-row items-center justify-between active:bg-blue-50/50"
                    >
                      <View className="flex-1 mr-2">
                        <View className="flex-row items-center">
                          <Text className="text-xs font-black text-slate-900">
                            Bill #{inv.invoiceNumber}
                          </Text>
                          <View className="bg-slate-100 px-1.5 py-0.5 rounded ml-2">
                            <Text className="text-[9px] font-bold text-slate-600">
                              {inv.paymentMode}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-xs text-slate-700 mt-0.5" numberOfLines={1}>
                          {inv.partyName || "Walk-in Guest"}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-xs font-black text-slate-900">
                          Rs. {Number(inv.grandTotal || 0).toLocaleString("en-IN")}
                        </Text>
                        <Text className="text-[9px] text-emerald-600 font-bold">
                          {inv.paymentStatus || "PAID"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </View>
          )}

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB 2: ALL REPORTS (55+) DIRECTORY (CLEAN ACCORDION CATALOG)  */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          {activeTab === "hub" && (
            <View>
              {/* Clean Search Input & Period Bar */}
              <View className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs mb-3">
                <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-2.5">
                  <Ionicons name="search" size={17} color="#64748B" />
                  <TextInput
                    className="flex-1 text-xs text-slate-900 ml-2 font-medium"
                    placeholder="Search any report (e.g., GST, Daily, P&L, Waiter, Stock)..."
                    value={hubSearch}
                    onChangeText={setHubSearch}
                    placeholderTextColor="#94A3B8"
                  />
                  {hubSearch ? (
                    <TouchableOpacity onPress={() => setHubSearch("")} className="p-1">
                      <Ionicons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Period Selector Pills */}
                <View className="flex-row gap-1">
                  {[
                    { id: "today", label: "Today" },
                    { id: "yesterday", label: "Yesterday" },
                    { id: "week", label: "7 Days" },
                    { id: "month", label: "This Month" },
                    { id: "365", label: "Yearly" },
                  ].map((p) => {
                    const isSelected = hubPeriod === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => setHubPeriod(p.id)}
                        className={`flex-1 py-1.5 rounded-lg items-center justify-center ${
                          isSelected ? "bg-slate-900" : "bg-slate-100"
                        }`}
                      >
                        <Text
                          className={`text-[11px] font-bold ${
                            isSelected ? "text-white" : "text-slate-600"
                          }`}
                        >
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ── If User is Searching: Show Flat Compact Results List ── */}
              {isSearching ? (
                <View className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mb-6 p-3">
                  <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Search Results ({searchResults.length})
                  </Text>
                  {searchResults.length === 0 ? (
                    <View className="py-8 items-center">
                      <Ionicons name="search-outline" size={32} color="#CBD5E1" />
                      <Text className="text-xs text-slate-400 mt-2">No reports matching "{hubSearch}"</Text>
                    </View>
                  ) : (
                    searchResults.map((report) => (
                      <View
                        key={report.id}
                        className="py-2.5 border-b border-slate-100 last:border-b-0 flex-row items-center justify-between"
                      >
                        <View className="flex-1 mr-2">
                          <Text className="text-xs font-black text-slate-900" numberOfLines={1}>
                            {report.title}
                          </Text>
                          <Text className="text-[10px] text-slate-500 mt-0.5" numberOfLines={1}>
                            {report.description}
                          </Text>
                        </View>
                        <View className="flex-row gap-1.5">
                          <TouchableOpacity
                            onPress={() => handleOpenReportViewer(report)}
                            className="bg-blue-600 px-2.5 py-1.5 rounded-lg flex-row items-center"
                          >
                            <Ionicons name="eye-outline" size={13} color="#FFFFFF" />
                            <Text className="text-white text-[10px] font-bold ml-1">View</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDownloadHubReport(report, "pdf")}
                            className="bg-slate-100 px-2 py-1.5 rounded-lg border border-slate-200 items-center justify-center"
                          >
                            <Ionicons name="document-text-outline" size={13} color="#DC2626" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDownloadHubReport(report, "csv")}
                            className="bg-slate-100 px-2 py-1.5 rounded-lg border border-slate-200 items-center justify-center"
                          >
                            <Ionicons name="download-outline" size={13} color="#059669" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              ) : (
                /* ── If Not Searching: Show Clean Featured + 7 Category Accordions ── */
                <View>
                  {/* Featured / Most Used Quick Access */}
                  <View className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 mb-3.5">
                    <View className="flex-row items-center justify-between mb-2">
                      <View className="flex-row items-center">
                        <Ionicons name="star" size={15} color="#EAB308" />
                        <Text className="text-xs font-black text-slate-900 ml-1.5 uppercase tracking-wider">
                          Frequently Used Reports
                        </Text>
                      </View>
                      <Text className="text-[10px] text-blue-600 font-bold">Quick Access</Text>
                    </View>

                    {popularReports.map((report) => (
                      <View
                        key={report.id}
                        className="py-2 border-b border-slate-100 last:border-b-0 flex-row items-center justify-between"
                      >
                        <View className="flex-1 mr-2">
                          <Text className="text-xs font-bold text-slate-900" numberOfLines={1}>
                            {report.title}
                          </Text>
                          <Text className="text-[10px] text-slate-400" numberOfLines={1}>
                            {report.description}
                          </Text>
                        </View>
                        <View className="flex-row gap-1">
                          <TouchableOpacity
                            onPress={() => handleOpenReportViewer(report)}
                            className="bg-blue-600 px-2.5 py-1.5 rounded-lg flex-row items-center"
                          >
                            <Ionicons name="eye-outline" size={12} color="#FFFFFF" />
                            <Text className="text-white text-[10px] font-bold ml-1">Run</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDownloadHubReport(report, "pdf")}
                            className="bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200 items-center justify-center"
                          >
                            <Ionicons name="document-text-outline" size={13} color="#DC2626" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDownloadHubReport(report, "csv")}
                            className="bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200 items-center justify-center"
                          >
                            <Ionicons name="download-outline" size={13} color="#059669" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* 7 Clean Categorized Accordions (Zero clutter!) */}
                  <Text className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2 ml-1">
                    Report Folders by Category (55 Reports)
                  </Text>

                  {REPORT_CATEGORIES.filter((c) => c.id !== "all").map((category) => {
                    const isExpanded = expandedCategory === category.id;
                    const catReports = REPORTS_CATALOG.filter((r) => r.category === category.id);

                    return (
                      <View
                        key={category.id}
                        className="bg-white rounded-2xl border border-slate-200 shadow-xs mb-2.5 overflow-hidden"
                      >
                        {/* Category Header Row (Tap to expand/collapse) */}
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => setExpandedCategory(isExpanded ? null : category.id)}
                          className={`flex-row items-center justify-between p-3.5 ${
                            isExpanded ? "bg-slate-50 border-b border-slate-200" : "bg-white"
                          }`}
                        >
                          <View className="flex-row items-center flex-1">
                            <View className="w-8 h-8 rounded-xl bg-blue-50 items-center justify-center mr-2.5 border border-blue-100">
                              <Ionicons name={category.icon || "folder"} size={16} color="#2563EB" />
                            </View>
                            <View className="flex-1">
                              <Text className="text-xs font-black text-slate-900">
                                {category.label}
                              </Text>
                              <Text className="text-[10px] text-slate-500">
                                {catReports.length} Specialized Reports
                              </Text>
                            </View>
                          </View>
                          <View className="flex-row items-center">
                            <View className="bg-slate-200/80 px-2 py-0.5 rounded-full mr-2">
                              <Text className="text-[10px] font-extrabold text-slate-700">
                                {catReports.length}
                              </Text>
                            </View>
                            <Ionicons
                              name={isExpanded ? "chevron-up" : "chevron-down"}
                              size={18}
                              color="#64748B"
                            />
                          </View>
                        </TouchableOpacity>

                        {/* Expanded Reports List */}
                        {isExpanded && (
                          <View className="p-3">
                            {catReports.map((report) => (
                              <View
                                key={report.id}
                                className="py-2.5 border-b border-slate-100 last:border-b-0 flex-row items-center justify-between"
                              >
                                <View className="flex-1 mr-2">
                                  <Text className="text-xs font-bold text-slate-900" numberOfLines={1}>
                                    {report.title}
                                  </Text>
                                  <Text className="text-[10px] text-slate-500 mt-0.5" numberOfLines={1}>
                                    {report.description}
                                  </Text>
                                </View>

                                <View className="flex-row gap-1.5">
                                  <TouchableOpacity
                                    onPress={() => handleOpenReportViewer(report)}
                                    className="bg-blue-600 px-2.5 py-1.5 rounded-lg flex-row items-center shadow-xs"
                                  >
                                    <Ionicons name="eye-outline" size={13} color="#FFFFFF" />
                                    <Text className="text-white text-[10px] font-bold ml-1">Run</Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    onPress={() => handleDownloadHubReport(report, "pdf")}
                                    className="bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200 items-center justify-center"
                                  >
                                    <Ionicons name="document-text-outline" size={13} color="#DC2626" />
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    onPress={() => handleDownloadHubReport(report, "csv")}
                                    className="bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200 items-center justify-center"
                                  >
                                    <Ionicons name="download-outline" size={13} color="#059669" />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </ResponsiveContainer>
      </ScrollView>

      {/* ── Modal 1: Bill Detail Modal ── */}
      <Modal visible={!!selectedInvoice} animationType="slide" transparent={true} onRequestClose={() => setSelectedInvoice(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: isWide ? "center" : "flex-end", alignItems: isWide ? "center" : "stretch", padding: isWide ? 24 : 0 }}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setSelectedInvoice(null)}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View style={{ backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: isWide ? 24 : 0, borderBottomRightRadius: isWide ? 24 : 0, maxHeight: "88%", width: "100%", maxWidth: isWide ? 560 : undefined }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: "900", color: "#111827" }}>Bill #{selectedInvoice?.invoiceNumber}</Text>
                <Text style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                  {selectedInvoice?.createdAt || selectedInvoice?.invoiceDate
                    ? new Date(selectedInvoice.createdAt || selectedInvoice.invoiceDate).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                    : ""}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedInvoice(null)} style={{ padding: 6 }}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
              {selectedInvoice?.partyName ? (
                <View style={{ backgroundColor: "#EFF6FF", borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="person-circle-outline" size={20} color="#2563EB" />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={{ fontWeight: "800", color: "#1E40AF", fontSize: 13 }}>{selectedInvoice.partyName}</Text>
                    {selectedInvoice.partyPhone ? <Text style={{ color: "#3B82F6", fontSize: 11 }}>{selectedInvoice.partyPhone}</Text> : null}
                  </View>
                </View>
              ) : null}

              <View style={{ backgroundColor: "#F9FAFB", borderRadius: 12, overflow: "hidden", marginBottom: 12, borderWidth: 1, borderColor: "#E5E7EB" }}>
                <View style={{ flexDirection: "row", backgroundColor: "#2563EB", paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ flex: 3, color: "#FFFFFF", fontSize: 11, fontWeight: "800" }}>Item</Text>
                  <Text style={{ flex: 1, color: "#FFFFFF", fontSize: 11, fontWeight: "800", textAlign: "center" }}>Qty</Text>
                  <Text style={{ flex: 1.5, color: "#FFFFFF", fontSize: 11, fontWeight: "800", textAlign: "right" }}>Amount</Text>
                </View>
                {(selectedInvoice?.items || []).map((it, idx) => {
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
                })}
              </View>

              <View style={{ backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 16 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 10 }}>
                  <Text style={{ color: "#111827", fontSize: 15, fontWeight: "900" }}>Total</Text>
                  <Text style={{ color: "#2563EB", fontSize: 15, fontWeight: "900" }}>Rs. {Number(selectedInvoice?.grandTotal || 0).toLocaleString("en-IN")}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                  <Text style={{ color: "#6B7280", fontSize: 11 }}>Payment Mode</Text>
                  <Text style={{ color: "#374151", fontSize: 11, fontWeight: "700" }}>{selectedInvoice?.paymentMode || "CASH"}</Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={async () => {
                  if (selectedInvoice) await shareBackendPdf(selectedInvoice, `Invoice_${selectedInvoice.invoiceNumber || selectedInvoice._id}.pdf`);
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

      {/* ── Modal 2: Category Sales Per Day Modal ── */}
      <Modal
        visible={showCategoryModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: isWide ? "center" : "flex-end", alignItems: isWide ? "center" : "stretch", padding: isWide ? 24 : 0 }}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShowCategoryModal(false)}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View style={{ backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: isWide ? 24 : 0, borderBottomRightRadius: isWide ? 24 : 0, maxHeight: "90%", flex: 1, width: "100%", maxWidth: isWide ? 680 : undefined }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18, borderBottomWidth: 1, borderBottomColor: "#F3F4F6", backgroundColor: "#2563EB", borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="pie-chart" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 16, fontWeight: "900", color: "#FFFFFF", marginLeft: 8 }}>
                    Category-Wise Sales Per Day
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: "#DBEAFE", marginTop: 2, fontWeight: "600" }}>
                  Full Yearly Breakdown (Past 365 Days)
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)} style={{ padding: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 12 }}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {loadingCategorySales ? (
              <View style={{ padding: 40, alignItems: "center", justifyContent: "center", flex: 1 }}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={{ fontSize: 13, fontWeight: "bold", color: "#2563EB", marginTop: 14 }}>
                  Analyzing category sales for the whole year...
                </Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                  <View style={{ flex: 1, backgroundColor: "#EFF6FF", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#BFDBFE" }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: "#1D4ED8", textTransform: "uppercase" }}>Categories</Text>
                    <Text style={{ fontSize: 20, fontWeight: "900", color: "#1E3A8A", marginTop: 2 }}>
                      {(categorySalesData?.yearlyCategorySummary || categorySalesData?.yearly || []).length}
                    </Text>
                  </View>
                  <View style={{ flex: 1.3, backgroundColor: "#ECFDF5", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#A7F3D0" }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: "#065F46", textTransform: "uppercase" }}>Yearly Category Sales</Text>
                    <Text style={{ fontSize: 20, fontWeight: "900", color: "#064E3B", marginTop: 2 }}>
                      Rs. {(categorySalesData?.yearlyCategorySummary || categorySalesData?.yearly || []).reduce((acc, c) => acc + (c.totalRevenue || 0), 0).toLocaleString("en-IN")}
                    </Text>
                  </View>
                </View>

                {(categorySalesData?.dailyCategorySales || categorySalesData?.data || categorySalesData?.daily || []).slice(0, 15).map((day, dIdx) => (
                  <View key={dIdx} style={{ backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 12, overflow: "hidden" }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F8FAFC", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" }}>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: "#1E293B" }}>
                        {new Date(day.date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: "#059669" }}>
                        Rs. {(day.categories || []).reduce((acc, c) => acc + (c.totalRevenue || 0), 0).toLocaleString("en-IN")}
                      </Text>
                    </View>
                    <View style={{ padding: 10 }}>
                      {(day.categories || []).map((cat, cIdx) => (
                        <View key={cIdx} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                          <Text style={{ fontSize: 11, color: "#4B5563" }}>🏷️ {cat.category}</Text>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#111827" }}>Rs. {Number(cat.totalRevenue || 0).toLocaleString("en-IN")}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal 3: Report Results Runner Modal ── */}
      <Modal
        visible={Boolean(activeReportModal)}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveReportModal(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.55)", justifyContent: "center", alignItems: "center", padding: 16 }}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setActiveReportModal(null)}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View style={{ width: "100%", maxWidth: 840, maxHeight: "90%", backgroundColor: "#FFFFFF", borderRadius: 24, padding: 20, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 20, elevation: 10, flex: 1 }}>
            <View className="flex-row items-center justify-between pb-3 border-b border-gray-200">
              <View className="flex-row items-center flex-1 mr-2">
                <View style={{ backgroundColor: "#EFF6FF" }} className="w-9 h-9 rounded-xl items-center justify-center mr-2.5">
                  <Ionicons name={activeReportModal?.icon || "document-text"} size={18} color="#2563EB" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-black text-gray-900" numberOfLines={1}>
                    {activeReportModal?.title}
                  </Text>
                  <Text className="text-xs text-gray-500" numberOfLines={1}>
                    {activeReportModal?.category?.toUpperCase()} • Period: {hubPeriod.toUpperCase()}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setActiveReportModal(null)} className="p-1">
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {loadingReportRun ? (
              <View className="flex-1 items-center justify-center py-12">
                <ActivityIndicator size="large" color="#2563EB" />
                <Text className="text-xs font-bold text-gray-500 mt-3">Computing report analytics...</Text>
              </View>
            ) : reportResultData ? (
              <ScrollView className="flex-1 pt-3" showsVerticalScrollIndicator={false}>
                {Array.isArray(reportResultData.summary) && reportResultData.summary.length > 0 && (
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {reportResultData.summary.map((kpi, idx) => (
                      <View
                        key={idx}
                        style={{
                          flex: 1,
                          minWidth: 120,
                          backgroundColor: "#F8FAFC",
                          borderRadius: 14,
                          padding: 12,
                          borderWidth: 1,
                          borderColor: "#E2E8F0",
                        }}
                      >
                        <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                          {kpi.label}
                        </Text>
                        <Text style={{ color: kpi.color || "#0F172A" }} className="text-base font-black">
                          {kpi.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View className="border border-gray-200 rounded-2xl overflow-hidden mb-4 bg-white shadow-xs">
                  <View className="bg-slate-900 flex-row px-3 py-2.5">
                    {(reportResultData.columns || []).map((col) => (
                      <Text
                        key={col?.key || Math.random()}
                        style={{
                          flex: 1,
                          textAlign: col?.align || "left",
                          color: "#FFFFFF",
                          fontSize: 11,
                          fontWeight: "800",
                        }}
                        numberOfLines={1}
                      >
                        {col?.label || ""}
                      </Text>
                    ))}
                  </View>

                  {(!reportResultData.rows || !Array.isArray(reportResultData.rows) || reportResultData.rows.length === 0) ? (
                    <View className="py-8 items-center justify-center">
                      <Ionicons name="file-tray-outline" size={28} color="#94A3B8" />
                      <Text className="text-xs text-gray-400 mt-2 font-medium">
                        No transactions recorded for this period.
                      </Text>
                    </View>
                  ) : (
                    (reportResultData.rows || []).map((row, rIdx) => (
                      <View
                        key={rIdx}
                        style={{
                          backgroundColor: rIdx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                          borderTopWidth: 1,
                          borderTopColor: "#F1F5F9",
                        }}
                        className="flex-row items-center px-3 py-2.5"
                      >
                        {(reportResultData.columns || []).map((col) => (
                          <Text
                            key={col?.key || Math.random()}
                            style={{
                              flex: 1,
                              textAlign: col?.align || "left",
                              color: "#1E293B",
                              fontSize: 11,
                              fontWeight: col?.align === "right" ? "700" : "500",
                            }}
                            numberOfLines={1}
                          >
                            {row && col?.key && row[col.key] !== undefined && row[col.key] !== null
                              ? String(row[col.key])
                              : "--"}
                          </Text>
                        ))}
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            ) : null}

            <View className="pt-3 border-t border-gray-200 flex-row gap-3">
              <TouchableOpacity
                onPress={() => handleDownloadHubReport(activeReportModal, "pdf")}
                disabled={downloadingReport}
                className="flex-1 bg-red-600 py-3 rounded-xl flex-row items-center justify-center shadow-xs"
              >
                <Ionicons name="document-text" size={16} color="#FFFFFF" />
                <Text className="text-white text-xs font-black ml-2">Download PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleDownloadHubReport(activeReportModal, "csv")}
                disabled={downloadingReport}
                className="flex-1 bg-emerald-600 py-3 rounded-xl flex-row items-center justify-center shadow-xs"
              >
                <Ionicons name="download" size={16} color="#FFFFFF" />
                <Text className="text-white text-xs font-black ml-2">Download CSV</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
