import React, { useState, useEffect } from "react";
import {
  View,
  Text,
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
export default function ReportsScreen({ onOpenDrawer, onBack }) {
  const [reportType, setReportType] = useState("sales");
  const [period, setPeriod] = useState("today");
  const [topDays, setTopDays] = useState(365);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [salesData, setSalesData] = useState(null);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [parties, setParties] = useState([]);
  const [topItemsData, setTopItemsData] = useState([]);
  const [overallTopData, setOverallTopData] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Category sales modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [loadingCategorySales, setLoadingCategorySales] = useState(false);
  const [categorySalesData, setCategorySalesData] = useState(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("All");

  const loadData = async () => {
    setLoading(true);
    try {
      if (reportType === "sales") {
        const res = await api.reports.getSales(`period=${period}`);
        if (res.success) {
          setSalesData(res);
        }
      } else if (reportType === "inventory") {
        const res = await api.items.getAll();
        if (res.success && Array.isArray(res.items)) {
          const sorted = [...res.items].sort((a, b) =>
            String(a?.name || "").localeCompare(String(b?.name || ""), undefined, {
              numeric: true,
              sensitivity: "base",
            })
          );
          setInventoryItems(sorted);
        }
      } else if (reportType === "parties") {
        const res = await api.parties.getAll();
        if (res.success && res.parties) {
          setParties(res.parties);
        }
      } else if (reportType === "topItems") {
        const res = await api.reports.getTopItems(topDays);
        if (res && res.success) {
          setTopItemsData(res.data || res.topItems || []);
          setOverallTopData(res.overallTop || []);
        }
      }
    } catch (err) {
      console.warn("Failed to load report data:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [reportType, period, topDays]);

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
  const handleDownload = async (format) => {
    setDownloading(true);
    let url = "";
    let fileName = "";
    let mimeType = format === "pdf" ? "application/pdf" : "text/csv";
    const timestamp = new Date().toISOString().slice(0, 10);
    if (reportType === "sales") {
      url = api.reports.getSalesPdfUrl(`period=${period}`);
      fileName = `SalesReport_${period}_${timestamp}.pdf`;
    } else if (reportType === "topItems") {
      url = api.reports.getSalesPdfUrl(`period=year`);
      fileName = `TopSales_Yearly_${timestamp}.pdf`;
    } else if (reportType === "inventory") {
      url = api.reports.getInventoryPdfUrl();
      fileName = `InventoryReport_${timestamp}.pdf`;
    } else if (reportType === "parties") {
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
  return (
    <View style={{ flex: 1 }} className="flex-1 bg-gray-50">
      <View className="bg-blue-600 px-4 pt-10 pb-4 flex-row items-center justify-between shadow-md">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={onOpenDrawer} className="mr-3 p-1">
            <Ionicons name="menu" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <View>
            <Text className="text-white text-lg font-black tracking-wide">
              Reports & Downloads
            </Text>
            <Text className="text-blue-100 text-[10px] font-medium">
              Sales, Stock & Customer Ledgers
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={loadData}
          disabled={loading}
          className="bg-blue-500/80 p-2 rounded-xl"
        >
          <Ionicons name="refresh" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View className="bg-white border-b border-gray-200 px-2 py-2 flex-row justify-around">
        <TouchableOpacity
          onPress={() => setReportType("sales")}
          className={`flex-1 py-2 rounded-xl items-center flex-row justify-center mx-1 ${
            reportType === "sales" ? "bg-blue-600 shadow-sm" : "bg-gray-100"
          }`}
        >
          <Ionicons
            name="bar-chart"
            size={14}
            color={reportType === "sales" ? "#FFFFFF" : "#4B5563"}
          />
          <Text
            className={`text-xs font-bold ml-1.5 ${
              reportType === "sales" ? "text-white" : "text-gray-700"
            }`}
          >
            Sales
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setReportType("inventory")}
          className={`flex-1 py-2 rounded-xl items-center flex-row justify-center mx-1 ${
            reportType === "inventory" ? "bg-emerald-600 shadow-sm" : "bg-gray-100"
          }`}
        >
          <Ionicons
            name="cube"
            size={14}
            color={reportType === "inventory" ? "#FFFFFF" : "#4B5563"}
          />
          <Text
            className={`text-xs font-bold ml-1.5 ${
              reportType === "inventory" ? "text-white" : "text-gray-700"
            }`}
          >
            Inventory
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setReportType("parties")}
          className={`flex-1 py-2 rounded-xl items-center flex-row justify-center mx-1 ${
            reportType === "parties" ? "bg-purple-600 shadow-sm" : "bg-gray-100"
          }`}
        >
          <Ionicons
            name="people"
            size={14}
            color={reportType === "parties" ? "#FFFFFF" : "#4B5563"}
          />
          <Text
            className={`text-xs font-bold ml-1.5 ${
              reportType === "parties" ? "text-white" : "text-gray-700"
            }`}
          >
            Customers
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setReportType("topItems")}
          className={`flex-1 py-2 rounded-xl items-center flex-row justify-center mx-1 ${
            reportType === "topItems" ? "bg-orange-500 shadow-sm" : "bg-gray-100"
          }`}
        >
          <Ionicons
            name="trophy"
            size={14}
            color={reportType === "topItems" ? "#FFFFFF" : "#4B5563"}
          />
          <Text
            className={`text-xs font-bold ml-1.5 ${
              reportType === "topItems" ? "text-white" : "text-gray-700"
            }`}
          >
            Top Sellers
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, paddingBottom: 120, flexGrow: 1 }}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} />}
      >
        {reportType === "sales" && (
          <View className="flex-row gap-2 mb-4">
            {[
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "week", label: "Last 7 Days" },
              { id: "month", label: "This Month" },
            ].map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => setPeriod(p.id)}
                className={`flex-1 py-1.5 rounded-lg items-center border ${
                  period === p.id
                    ? "bg-blue-50 border-blue-600"
                    : "bg-white border-gray-200"
                }`}
              >
                <Text
                  className={`text-[11px] font-bold ${
                    period === p.id ? "text-blue-700" : "text-gray-600"
                  }`}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <View className="bg-white rounded-2xl p-4 mb-4 border border-gray-200 shadow-sm">
          <Text className="text-xs font-extrabold text-gray-500 uppercase tracking-wider mb-2">
            Download Report File
          </Text>
          <Text className="text-xs text-gray-500 mb-3">
            Export official formatted PDF reports for your accountant, tax filings, or store records.
          </Text>
          <TouchableOpacity
            onPress={() => handleDownload("pdf")}
            disabled={downloading}
            className="w-full bg-red-600 py-3.5 rounded-xl flex-row items-center justify-center shadow-sm active:bg-red-700"
          >
            {downloading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="document-text" size={18} color="#FFFFFF" />
                <Text className="text-white font-extrabold text-sm ml-2">
                  Download Official PDF Report
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        {reportType === "sales" && salesData && (
          <View className="mb-4">
            <View className="flex-row gap-2.5 mb-2.5">
              <View className="flex-1 bg-white p-3.5 rounded-2xl border border-gray-200 shadow-sm">
                <Text className="text-[11px] font-bold text-gray-500">Total Sales</Text>
                <Text className="text-xl font-black text-gray-900 mt-1">
                  Rs. {Number(salesData.summary?.totalSales || 0).toLocaleString("en-IN")}
                </Text>
                <Text className="text-[10px] text-gray-400 mt-0.5">
                  {salesData.summary?.totalBills || 0} Bills Generated
                </Text>
              </View>
              <View className="flex-1 bg-white p-3.5 rounded-2xl border border-gray-200 shadow-sm">
                <Text className="text-[11px] font-bold text-gray-500">Discounts Given</Text>
                <Text className="text-xl font-black text-emerald-600 mt-1">
                  Rs. {Number(salesData.summary?.totalDiscount || 0).toLocaleString("en-IN")}
                </Text>
                <Text className="text-[10px] text-gray-400 mt-0.5">Customer Savings</Text>
              </View>
            </View>
            <View className="flex-row gap-2.5">
              <View className="flex-1 bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
                <Text className="text-[10px] font-bold text-emerald-800">Cash Collected</Text>
                <Text className="text-sm font-black text-emerald-900 mt-0.5">
                  Rs. {Number(salesData.summary?.totalCash || 0).toLocaleString("en-IN")}
                </Text>
              </View>
              <View className="flex-1 bg-purple-50/70 p-3 rounded-xl border border-purple-200">
                <Text className="text-[10px] font-bold text-purple-800">UPI Received</Text>
                <Text className="text-sm font-black text-purple-900 mt-0.5">
                  Rs. {Number(salesData.summary?.totalUpi || 0).toLocaleString("en-IN")}
                </Text>
              </View>
              <View className="flex-1 bg-blue-50/70 p-3 rounded-xl border border-blue-200">
                <Text className="text-[10px] font-bold text-blue-800">GST Collected</Text>
                <Text className="text-sm font-black text-blue-900 mt-0.5">
                  Rs. {Number(salesData.summary?.totalTax || 0).toLocaleString("en-IN")}
                </Text>
              </View>
            </View>
          </View>
        )}
        {reportType === "inventory" && (
          <View className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm mb-4">
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-xs text-gray-500 font-bold">Total Catalog Items</Text>
                <Text className="text-2xl font-black text-gray-900 mt-0.5">
                  {inventoryItems.length} Products
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-xs text-gray-500 font-bold">Stock Valuation</Text>
                <Text className="text-lg font-black text-emerald-600 mt-0.5">
                  Rs.{" "}
                  {inventoryItems
                    .reduce((acc, it) => acc + (it.stock || 0) * (it.sellingPrice || 0), 0)
                    .toLocaleString("en-IN")}
                </Text>
              </View>
            </View>
          </View>
        )}
        {reportType === "parties" && (
          <View className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm mb-4">
            <View className="flex-row justify-between items-center">
              <View>
                <Text className="text-xs text-gray-500 font-bold">Total Customers</Text>
                <Text className="text-2xl font-black text-gray-900 mt-0.5">
                  {parties.length} Customers
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-xs text-gray-500 font-bold">Total Receivables (Udhar)</Text>
                <Text className="text-lg font-black text-red-600 mt-0.5">
                  Rs.{" "}
                  {parties
                    .reduce((acc, p) => acc + (p.balance || 0), 0)
                    .toLocaleString("en-IN")}
                </Text>
              </View>
            </View>
          </View>
        )}
        {reportType === "topItems" && (
          <View className="mb-4">
            {/* Top Period Selector */}
            <View className="flex-row gap-2 mb-3">
              {[
                { days: 365, label: "Yearly (365d)" },
                { days: 30, label: "Monthly (30d)" },
                { days: 7, label: "Weekly (7d)" },
              ].map((p) => (
                <TouchableOpacity
                  key={p.days}
                  onPress={() => setTopDays(p.days)}
                  className={`flex-1 py-2 rounded-xl items-center border ${
                    topDays === p.days
                      ? "bg-orange-50 border-orange-500 shadow-xs"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <Text
                    className={`text-xs font-black ${
                      topDays === p.days ? "text-orange-700" : "text-gray-600"
                    }`}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Prominent Category-Wise Selling Per Day Trigger */}
            <TouchableOpacity
              onPress={handleOpenCategorySales}
              className="bg-indigo-600 rounded-2xl p-4 mb-3 flex-row items-center justify-between shadow-md active:bg-indigo-700"
            >
              <View className="flex-row items-center flex-1 mr-3">
                <View className="w-11 h-11 rounded-xl bg-white/20 items-center justify-center mr-3">
                  <Ionicons name="pie-chart" size={22} color="#FFFFFF" />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-sm font-black tracking-wide">
                    Category-Wise Selling Per Day
                  </Text>
                  <Text className="text-indigo-100 text-[11px] mt-0.5">
                    Tap to view day-by-day category breakdown for the whole year ➔
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward-circle" size={26} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Overall Top Ranked Items in this Period */}
            {overallTopData.length > 0 ? (
              <View className="bg-white rounded-2xl p-4 border border-orange-200 shadow-sm mb-3">
                <View className="flex-row items-center justify-between mb-2.5">
                  <View className="flex-row items-center">
                    <Ionicons name="ribbon" size={18} color="#EA580C" />
                    <Text className="text-xs font-black text-gray-900 ml-1.5 uppercase tracking-wider">
                      Overall Top Sellers ({topDays === 365 ? "Whole Year" : `${topDays} Days`})
                    </Text>
                  </View>
                  <TouchableOpacity onPress={handleOpenCategorySales}>
                    <Text className="text-[11px] font-bold text-indigo-600">Categories ➔</Text>
                  </TouchableOpacity>
                </View>
                {overallTopData.slice(0, 5).map((it, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={handleOpenCategorySales}
                    className="flex-row items-center justify-between py-2 border-b border-gray-100 last:border-b-0"
                  >
                    <View className="flex-row items-center flex-1 pr-2">
                      <View
                        style={{
                          backgroundColor: idx === 0 ? "#F59E0B" : idx === 1 ? "#94A3B8" : idx === 2 ? "#D97706" : "#F3F4F6",
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
                        <Text className="text-xs font-bold text-gray-900" numberOfLines={1}>
                          {it.name || "Item"}
                        </Text>
                        <Text className="text-[10px] text-gray-500">
                          {it.category ? `${it.category} • ` : ""}Total Qty: <Text className="font-extrabold text-blue-700">{it.totalQty}</Text>
                        </Text>
                      </View>
                    </View>
                    <View className="items-end">
                      <Text className="text-xs font-black text-emerald-700">
                        Rs. {Number(it.totalRevenue || 0).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View className="bg-white p-3.5 rounded-2xl border border-orange-200 shadow-sm">
              <View className="flex-row items-center">
                <Ionicons name="calendar-outline" size={16} color="#F97316" />
                <Text className="text-xs text-orange-700 font-extrabold ml-1.5">
                  Day-by-Day Top Selling Products ({topDays === 365 ? "Yearly" : `${topDays} Days`})
                </Text>
              </View>
              <Text className="text-[10px] text-gray-400 mt-0.5">
                Daily breakdown of items ranked by volume sold
              </Text>
            </View>
          </View>
        )}
        <View className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
          <View className="bg-gray-100 px-4 py-3 border-b border-gray-200 flex-row justify-between items-center">
            <Text className="text-xs font-bold text-gray-700 uppercase tracking-wide">
              {reportType === "sales"
                ? `Invoices (${salesData?.invoices?.length || 0})`
                : reportType === "inventory"
                ? `Stock Items (${inventoryItems.length})`
                : reportType === "topItems"
                ? `Daily Top Selling Breakdown`
                : `Customer Ledger (${parties.length})`}
            </Text>
            <Text className="text-[10px] text-gray-400 font-medium">Recent Records</Text>
          </View>
          {loading ? (
            <View className="py-12 items-center">
              <ActivityIndicator size="small" color="#2563EB" />
              <Text className="text-xs text-gray-400 mt-2">Loading report records...</Text>
            </View>
          ) : reportType === "topItems" ? (
            topItemsData.length === 0 ? (
              <View className="py-10 items-center">
                <Ionicons name="trophy-outline" size={40} color="#D1D5DB" />
                <Text className="text-xs text-gray-400 mt-3">No sales data in this period</Text>
                <Text className="text-[11px] text-gray-300 mt-1">Create some invoices to see top selling items here</Text>
              </View>
            ) : (
              topItemsData.map((dayData, dayIdx) => (
                <TouchableOpacity
                  key={dayIdx}
                  activeOpacity={0.85}
                  onPress={handleOpenCategorySales}
                >
                  <View className="flex-row items-center justify-between px-4 py-2 bg-orange-50 border-b border-orange-100">
                    <View className="flex-row items-center">
                      <Ionicons name="calendar-outline" size={13} color="#F97316" />
                      <Text className="text-xs font-extrabold text-orange-700 ml-2">
                        {new Date(dayData.date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                      </Text>
                    </View>
                    <Text className="text-[10px] font-bold text-orange-600">Category details ➔</Text>
                  </View>
                  {(dayData.topItems || []).map((it, idx) => (
                    <View key={idx} className="px-4 py-3 border-b border-gray-100 flex-row items-center">
                      <View
                        style={{ backgroundColor: idx === 0 ? "#FBBF24" : idx === 1 ? "#9CA3AF" : idx === 2 ? "#B45309" : "#F3F4F6", width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 10 }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "900", color: idx < 3 ? "#FFFFFF" : "#6B7280" }}>{idx + 1}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-xs font-bold text-gray-900" numberOfLines={1}>{it.name || "Unknown Item"}</Text>
                        <Text className="text-[10px] text-gray-500 mt-0.5">Qty sold: <Text className="font-bold text-blue-700">{it.totalQty}</Text></Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-xs font-black text-emerald-700">Rs. {Number(it.totalRevenue || 0).toLocaleString("en-IN")}</Text>
                        <Text className="text-[9px] text-gray-400">revenue</Text>
                      </View>
                    </View>
                  ))}
                </TouchableOpacity>
              ))
            )
          ) : reportType === "sales" ? (
            (salesData?.invoices || []).length === 0 ? (
              <View className="py-8 items-center">
                <Text className="text-xs text-gray-400">No invoices in this period</Text>
              </View>
            ) : (
              (salesData?.invoices || []).slice(0, 30).map((inv) => (
                <TouchableOpacity
                  key={inv._id}
                  activeOpacity={0.8}
                  onPress={() => setSelectedInvoice(inv)}
                  className="px-4 py-3 border-b border-gray-100 flex-row items-center justify-between active:bg-blue-50"
                >
                  <View className="flex-1 mr-2">
                    <View className="flex-row items-center">
                      <Text className="text-xs font-black text-gray-900">
                        Bill #{inv.invoiceNumber}
                      </Text>
                      <Text className="text-[10px] text-gray-500 ml-2">
                        {inv.createdAt || inv.invoiceDate
                          ? new Date(inv.createdAt || inv.invoiceDate).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </Text>
                      <View className="bg-gray-100 px-1.5 py-0.5 rounded ml-2">
                        <Text className="text-[9px] font-bold text-gray-600">
                          {inv.paymentMode}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-xs text-gray-700 mt-0.5 font-bold" numberOfLines={1}>
                      {inv.partyName || "Cash Customer"}
                    </Text>
                    {inv.items && inv.items.length > 0 ? (
                      <Text className="text-[11px] text-blue-900 font-semibold mt-1" numberOfLines={2}>
                        🛍️ {inv.items.map((it) => `${it.name || it.itemName} (x${it.quantity || it.qty || 1})`).join(", ")}
                      </Text>
                    ) : null}
                    <Text className="text-[10px] text-blue-500 font-bold mt-1">Tap to view full details →</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xs font-black text-gray-900">
                      Rs. {Number(inv.grandTotal || 0).toLocaleString("en-IN")}
                    </Text>
                    <Text className="text-[10px] text-emerald-600 font-bold">
                      {inv.paymentStatus || "PAID"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )
          ) : reportType === "inventory" ? (
            inventoryItems.slice(0, 15).map((it) => (
              <View
                key={it._id}
                className="px-4 py-3 border-b border-gray-100 flex-row items-center justify-between"
              >
                <View className="flex-1 mr-2">
                  <Text className="text-xs font-black text-gray-900">{it.name}</Text>
                  <Text className="text-[10px] text-gray-500 mt-0.5">
                    Category: {it.category || "General"} | Unit: {it.unit || "PCS"}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs font-black text-gray-900">
                    {it.stock || 0} in stock
                  </Text>
                  <Text
                    className={`text-[9px] font-bold ${
                      (it.stock || 0) <= (it.lowStockThreshold || 5)
                        ? "text-red-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {(it.stock || 0) <= (it.lowStockThreshold || 5) ? "LOW STOCK" : "IN STOCK"}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            parties.slice(0, 15).map((p) => (
              <View
                key={p._id}
                className="px-4 py-3 border-b border-gray-100 flex-row items-center justify-between"
              >
                <View className="flex-1 mr-2">
                  <Text className="text-xs font-black text-gray-900">{p.name}</Text>
                  <Text className="text-[10px] text-gray-500 mt-0.5">
                    Phone: {p.phone || p.whatsappNumber || "--"} | Visits: {p.visitCount || 1}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs font-black text-gray-900">
                    Spent: Rs. {Number(p.totalSpent || 0).toLocaleString("en-IN")}
                  </Text>
                  <Text
                    className={`text-[10px] font-bold ${
                      (p.balance || 0) > 0 ? "text-red-600" : "text-emerald-600"
                    }`}
                  >
                    Udhar: Rs. {Number(p.balance || 0).toLocaleString("en-IN")}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Bill Detail Modal in Reports */}
      <Modal visible={!!selectedInvoice} animationType="slide" transparent={true} onRequestClose={() => setSelectedInvoice(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "88%" }}>
            {/* Header */}
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
              {/* Customer Info */}
              {selectedInvoice?.partyName ? (
                <View style={{ backgroundColor: "#EFF6FF", borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="person-circle-outline" size={20} color="#2563EB" />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={{ fontWeight: "800", color: "#1E40AF", fontSize: 13 }}>{selectedInvoice.partyName}</Text>
                    {selectedInvoice.partyPhone ? <Text style={{ color: "#3B82F6", fontSize: 11 }}>{selectedInvoice.partyPhone}</Text> : null}
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
                {(selectedInvoice?.items || []).length === 0 ? (
                  <View style={{ padding: 14, alignItems: "center" }}>
                    <Text style={{ color: "#9CA3AF", fontSize: 12 }}>No items recorded for this bill.</Text>
                  </View>
                ) : (
                  (selectedInvoice?.items || []).map((it, idx) => {
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
                {selectedInvoice?.subtotal ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ color: "#6B7280", fontSize: 12 }}>Subtotal</Text>
                    <Text style={{ color: "#374151", fontWeight: "600", fontSize: 12 }}>Rs. {Number(selectedInvoice.subtotal || 0).toLocaleString("en-IN")}</Text>
                  </View>
                ) : null}
                {selectedInvoice?.discountTotal > 0 ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ color: "#059669", fontSize: 12 }}>Discount</Text>
                    <Text style={{ color: "#059669", fontWeight: "600", fontSize: 12 }}>- Rs. {Number(selectedInvoice.discountTotal || 0).toLocaleString("en-IN")}</Text>
                  </View>
                ) : null}
                {selectedInvoice?.freebieItemGiven ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ color: "#2563EB", fontSize: 12 }}>Gift / Freebie</Text>
                    <Text style={{ color: "#2563EB", fontWeight: "600", fontSize: 12 }}>{selectedInvoice.freebieItemGiven}</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 10, marginTop: 4 }}>
                  <Text style={{ color: "#111827", fontSize: 15, fontWeight: "900" }}>Total</Text>
                  <Text style={{ color: "#2563EB", fontSize: 15, fontWeight: "900" }}>Rs. {Number(selectedInvoice?.grandTotal || 0).toLocaleString("en-IN")}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                  <Text style={{ color: "#6B7280", fontSize: 11 }}>Payment Mode</Text>
                  <Text style={{ color: "#374151", fontSize: 11, fontWeight: "700" }}>{selectedInvoice?.paymentMode || "CASH"}</Text>
                </View>
              </View>

              {/* Share Button */}
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

      {/* Category-Wise Selling Per Day (Whole Year) Modal */}
      <Modal
        visible={showCategoryModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", flex: 1 }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18, borderBottomWidth: 1, borderBottomColor: "#F3F4F6", backgroundColor: "#4F46E5", borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="pie-chart" size={20} color="#FFFFFF" />
                  <Text style={{ fontSize: 16, fontWeight: "900", color: "#FFFFFF", marginLeft: 8 }}>
                    Category-Wise Sales Per Day
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: "#E0E7FF", marginTop: 2, fontWeight: "600" }}>
                  Full Yearly Breakdown (Past 365 Days)
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)} style={{ padding: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 12 }}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {loadingCategorySales ? (
              <View style={{ padding: 40, alignItems: "center", justifyContent: "center", flex: 1 }}>
                <ActivityIndicator size="large" color="#4F46E5" />
                <Text style={{ fontSize: 13, fontWeight: "bold", color: "#4F46E5", marginTop: 14 }}>
                  Analyzing category sales for the whole year...
                </Text>
                <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                  Grouping transactions by date & category
                </Text>
              </View>
            ) : !categorySalesData || ((categorySalesData.dailyCategorySales || categorySalesData.data || categorySalesData.daily || []).length === 0) ? (
              <View style={{ padding: 40, alignItems: "center", justifyContent: "center", flex: 1 }}>
                <Ionicons name="alert-circle-outline" size={48} color="#D1D5DB" />
                <Text style={{ fontSize: 14, fontWeight: "bold", color: "#6B7280", marginTop: 12 }}>
                  No Category Sales Recorded
                </Text>
                <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4, textAlign: "center" }}>
                  Invoices created with category items will appear here organized day-by-day.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                {/* Yearly Summary Cards */}
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                  <View style={{ flex: 1, backgroundColor: "#EEF2FF", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#C7D2FE" }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: "#4338CA", textTransform: "uppercase" }}>Categories</Text>
                    <Text style={{ fontSize: 20, fontWeight: "900", color: "#312E81", marginTop: 2 }}>
                      {(categorySalesData.yearlyCategorySummary || categorySalesData.yearly || []).length}
                    </Text>
                    <Text style={{ fontSize: 10, color: "#6366F1", marginTop: 2 }}>Tracked across year</Text>
                  </View>
                  <View style={{ flex: 1.3, backgroundColor: "#ECFDF5", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#A7F3D0" }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: "#065F46", textTransform: "uppercase" }}>Yearly Category Sales</Text>
                    <Text style={{ fontSize: 20, fontWeight: "900", color: "#064E3B", marginTop: 2 }}>
                      Rs. {(categorySalesData.yearlyCategorySummary || categorySalesData.yearly || []).reduce((acc, c) => acc + (c.totalRevenue || 0), 0).toLocaleString("en-IN")}
                    </Text>
                    <Text style={{ fontSize: 10, color: "#059669", marginTop: 2 }}>
                      {(categorySalesData.yearlyCategorySummary || categorySalesData.yearly || []).reduce((acc, c) => acc + (c.totalQty || 0), 0)} items sold
                    </Text>
                  </View>
                </View>

                {/* Category Pills Filter */}
                <Text style={{ fontSize: 11, fontWeight: "800", color: "#6B7280", textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.5 }}>
                  Filter by Category:
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                  {["All", ...((categorySalesData.yearlyCategorySummary || categorySalesData.yearly || []).map((c) => c.category))].map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      onPress={() => setSelectedCategoryFilter(cat)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 20,
                        marginRight: 8,
                        backgroundColor: selectedCategoryFilter === cat ? "#4F46E5" : "#F3F4F6",
                        borderWidth: 1,
                        borderColor: selectedCategoryFilter === cat ? "#4F46E5" : "#E5E7EB",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "800",
                          color: selectedCategoryFilter === cat ? "#FFFFFF" : "#374151",
                        }}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Day-by-Day Timeline List */}
                <Text style={{ fontSize: 11, fontWeight: "800", color: "#6B7280", textTransform: "uppercase", marginBottom: 10, letterSpacing: 0.5 }}>
                  Daily Timeline (Whole Year):
                </Text>

                {(categorySalesData.dailyCategorySales || categorySalesData.data || categorySalesData.daily || [])
                  .filter((day) => {
                    if (selectedCategoryFilter === "All") return true;
                    return (day.categories || []).some((c) => c.category === selectedCategoryFilter);
                  })
                  .map((day, dIdx) => {
                    const dayCategories = selectedCategoryFilter === "All"
                      ? day.categories || []
                      : (day.categories || []).filter((c) => c.category === selectedCategoryFilter);
                    const dayRev = dayCategories.reduce((acc, c) => acc + (c.totalRevenue || 0), 0);
                    const dayQty = dayCategories.reduce((acc, c) => acc + (c.totalQty || 0), 0);

                    return (
                      <View
                        key={dIdx}
                        style={{
                          backgroundColor: "#FFFFFF",
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          marginBottom: 14,
                          overflow: "hidden",
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: 0.05,
                          shadowRadius: 2,
                          elevation: 1,
                        }}
                      >
                        {/* Day Header Banner */}
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            backgroundColor: "#F8FAFC",
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            borderBottomWidth: 1,
                            borderBottomColor: "#E2E8F0",
                          }}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <Ionicons name="calendar" size={15} color="#4F46E5" />
                            <Text style={{ fontSize: 13, fontWeight: "900", color: "#1E293B", marginLeft: 6 }}>
                              {new Date(day.date).toLocaleDateString("en-IN", {
                                weekday: "short",
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </Text>
                          </View>
                          <View style={{ alignItems: "flex-end" }}>
                            <Text style={{ fontSize: 13, fontWeight: "900", color: "#059669" }}>
                              Rs. {dayRev.toLocaleString("en-IN")}
                            </Text>
                            <Text style={{ fontSize: 10, color: "#64748B" }}>
                              {dayQty} item{dayQty > 1 ? "s" : ""} sold
                            </Text>
                          </View>
                        </View>

                        {/* Categories Sold On This Day */}
                        <View style={{ padding: 12 }}>
                          {dayCategories.map((cat, cIdx) => (
                            <View
                              key={cIdx}
                              style={{
                                backgroundColor: "#F9FAFB",
                                borderRadius: 12,
                                padding: 10,
                                marginBottom: cIdx === dayCategories.length - 1 ? 0 : 8,
                                borderWidth: 1,
                                borderColor: "#F3F4F6",
                              }}
                            >
                              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                <View style={{ flexDirection: "row", alignItems: "center" }}>
                                  <View style={{ backgroundColor: "#EEF2FF", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginRight: 6 }}>
                                    <Text style={{ fontSize: 11, fontWeight: "800", color: "#4338CA" }}>
                                      🏷️ {cat.category}
                                    </Text>
                                  </View>
                                </View>
                                <Text style={{ fontSize: 12, fontWeight: "900", color: "#111827" }}>
                                  Rs. {Number(cat.totalRevenue || 0).toLocaleString("en-IN")}
                                </Text>
                              </View>

                              {/* Items under this category */}
                              {(cat.items || []).map((it, itIdx) => (
                                <View
                                  key={itIdx}
                                  style={{
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    paddingVertical: 2,
                                    paddingLeft: 6,
                                  }}
                                >
                                  <Text style={{ fontSize: 11, color: "#4B5563", flex: 1 }} numberOfLines={1}>
                                    • {it.name || "Item"} <Text style={{ color: "#6B7280" }}>(x{it.quantity || it.qty || 1})</Text>
                                  </Text>
                                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#374151" }}>
                                    Rs. {Number(it.revenue || it.total || 0).toLocaleString("en-IN")}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}