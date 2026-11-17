import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
} from "react-native";
import {
  Ionicons,
  MaterialIcons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";
import { api } from "../config/api";
import { useResponsive } from "../utils/responsive";
import DynamicUpiQrModal from "../components/DynamicUpiQrModal";

const STATUS_CONFIG = {
  AVAILABLE: {
    label: "Available",
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-700",
    iconColor: "#059669",
    color: "#059669",
  },
  OCCUPIED: {
    label: "Occupied",
    bg: "bg-rose-50",
    border: "border-rose-300",
    badgeBg: "bg-rose-100",
    badgeText: "text-rose-700",
    iconColor: "#DC2626",
    color: "#DC2626",
  },
  BILLED: {
    label: "Billed",
    bg: "bg-blue-50",
    border: "border-blue-300",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    iconColor: "#2563EB",
    color: "#2563EB",
  },
  RESERVED: {
    label: "Reserved",
    bg: "bg-amber-50",
    border: "border-amber-300",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-800",
    iconColor: "#D97706",
    color: "#D97706",
  },
};

export default function TableScreen({
  user,
  isActive = true,
  onOpenDrawer,
  onStartTableOrder,
  onStartOrder,
}) {
  const { isWide, headerTopPadding } = useResponsive();

  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedAreaId, setSelectedAreaId] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  // Selected Table Action Modal
  const [activeTable, setActiveTable] = useState(null);

  // Transfer Table Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [targetTableId, setTargetTableId] = useState("");
  const [transferring, setTransferring] = useState(false);

  // Reservation Modal
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestTime, setGuestTime] = useState("");

  // Create/Edit Table Modal
  const [showTableModal, setShowTableModal] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [tableFormNo, setTableFormNo] = useState("");
  const [tableFormAreaId, setTableFormAreaId] = useState("");
  const [tableFormCapacity, setTableFormCapacity] = useState("4");
  const [tableFormShape, setTableFormShape] = useState("square");
  const [savingTable, setSavingTable] = useState(false);

  // Create/Edit Area Modal
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [editingArea, setEditingArea] = useState(null);
  const [areaFormName, setAreaFormName] = useState("");
  const [areaFormRate, setAreaFormRate] = useState("0");
  const [areaFormCode, setAreaFormCode] = useState("");
  const [areaFormColor, setAreaFormColor] = useState("#2563EB");
  const [savingArea, setSavingArea] = useState(false);

  // Dynamic UPI QR Modal
  const [showQrModal, setShowQrModal] = useState(false);

  const fetchAreasAndTables = useCallback(async () => {
    try {
      setLoading(true);
      const [areaRes, tableRes] = await Promise.all([
        api.tables.getAreas(),
        api.tables.getAll(),
      ]);
      if (areaRes.success && Array.isArray(areaRes.areas)) {
        setAreas(areaRes.areas);
      }
      if (tableRes.success && Array.isArray(tableRes.tables)) {
        setTables(tableRes.tables);
      }
    } catch (err) {
      console.warn("Failed to fetch tables:", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) {
      fetchAreasAndTables();
    }
  }, [isActive, fetchAreasAndTables]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAreasAndTables();
  };

  // Filter tables by Area & Status
  const filteredTables = tables.filter((t) => {
    const matchesArea =
      selectedAreaId === "ALL" ||
      (t.areaId && (t.areaId._id === selectedAreaId || t.areaId === selectedAreaId));
    const matchesStatus =
      selectedStatus === "ALL" || t.status === selectedStatus;
    return matchesArea && matchesStatus;
  });

  // Status counts
  const availableCount = tables.filter((t) => t.status === "AVAILABLE").length;
  const occupiedCount = tables.filter((t) => t.status === "OCCUPIED").length;
  const billedCount = tables.filter((t) => t.status === "BILLED").length;
  const reservedCount = tables.filter((t) => t.status === "RESERVED").length;

  const handleTablePress = (table) => {
    setActiveTable(table);
  };

  const handleStartOrderFromTable = (table) => {
    setActiveTable(null);
    const startFn = onStartTableOrder || onStartOrder;
    if (startFn) {
      startFn(table);
    }
  };

  const handleSettleTable = async (table) => {
    Alert.alert(
      "Settle & Vacate Table",
      `Are you sure you want to settle Table ${table.tableNo} and mark it available?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Settle Table",
          style: "destructive",
          onPress: async () => {
            const res = await api.tables.settle(table._id);
            if (res.success) {
              setActiveTable(null);
              fetchAreasAndTables();
            } else {
              Alert.alert("Error", res.message || "Failed to settle table");
            }
          },
        },
      ]
    );
  };

  const handleExecuteTransfer = async () => {
    if (!activeTable || !targetTableId) {
      Alert.alert("Required", "Please choose a destination table");
      return;
    }
    setTransferring(true);
    const res = await api.tables.transfer(activeTable._id, targetTableId);
    setTransferring(false);
    if (res.success) {
      setShowTransferModal(false);
      setActiveTable(null);
      fetchAreasAndTables();
      Alert.alert("Success", res.message || "Order transferred successfully");
    } else {
      Alert.alert("Transfer Error", res.message || "Failed to transfer order");
    }
  };

  const handleSaveReservation = async () => {
    if (!activeTable) return;
    const res = await api.tables.reserve(activeTable._id, {
      guestName,
      phone: guestPhone,
      time: guestTime,
    });
    if (res.success) {
      setShowReserveModal(false);
      setActiveTable(null);
      setGuestName("");
      setGuestPhone("");
      setGuestTime("");
      fetchAreasAndTables();
    } else {
      Alert.alert("Error", res.message || "Failed to reserve table");
    }
  };

  const handleCancelReservation = async (table) => {
    const res = await api.tables.reserve(table._id, { cancel: true });
    if (res.success) {
      setActiveTable(null);
      fetchAreasAndTables();
    }
  };

  const openAddTable = () => {
    setEditingTable(null);
    setTableFormNo("");
    setTableFormAreaId(areas[0]?._id || "");
    setTableFormCapacity("4");
    setTableFormShape("square");
    setShowTableModal(true);
  };

  const handleSaveTable = async () => {
    if (!tableFormNo.trim()) {
      Alert.alert("Required", "Please enter a table number or name");
      return;
    }
    if (!tableFormAreaId) {
      Alert.alert("Required", "Please select an area");
      return;
    }
    setSavingTable(true);
    try {
      if (editingTable) {
        const res = await api.tables.update(editingTable._id, {
          tableNo: tableFormNo.trim(),
          areaId: tableFormAreaId,
          capacity: Number(tableFormCapacity) || 4,
          shape: tableFormShape,
        });
        if (res.success) {
          setShowTableModal(false);
          fetchAreasAndTables();
        } else {
          Alert.alert("Error", res.message || "Failed to update table");
        }
      } else {
        const res = await api.tables.create({
          tableNo: tableFormNo.trim(),
          areaId: tableFormAreaId,
          capacity: Number(tableFormCapacity) || 4,
          shape: tableFormShape,
        });
        if (res.success) {
          setShowTableModal(false);
          fetchAreasAndTables();
        } else {
          Alert.alert("Error", res.message || "Failed to create table");
        }
      }
    } finally {
      setSavingTable(false);
    }
  };

  const openAddArea = () => {
    setEditingArea(null);
    setAreaFormName("");
    setAreaFormRate("0");
    setAreaFormCode("");
    setAreaFormColor("#2563EB");
    setShowAreaModal(true);
  };

  const handleSaveArea = async () => {
    if (!areaFormName.trim()) {
      Alert.alert("Required", "Please enter area name");
      return;
    }
    setSavingArea(true);
    try {
      if (editingArea) {
        const res = await api.tables.updateArea(editingArea._id, {
          name: areaFormName.trim(),
          serviceChargeRate: Number(areaFormRate) || 0,
          code: areaFormCode.trim(),
          color: areaFormColor,
        });
        if (res.success) {
          setShowAreaModal(false);
          fetchAreasAndTables();
        } else {
          Alert.alert("Error", res.message || "Failed to update area");
        }
      } else {
        const res = await api.tables.createArea({
          name: areaFormName.trim(),
          serviceChargeRate: Number(areaFormRate) || 0,
          code: areaFormCode.trim(),
          color: areaFormColor,
        });
        if (res.success) {
          setShowAreaModal(false);
          fetchAreasAndTables();
        } else {
          Alert.alert("Error", res.message || "Failed to create area");
        }
      }
    } finally {
      setSavingArea(false);
    }
  };

  const formatElapsedMinutes = (seatedAt) => {
    if (!seatedAt) return "";
    const diffMs = Date.now() - new Date(seatedAt).getTime();
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  };

  return (
    <View style={{ flex: 1 }} className="flex-1 bg-slate-50">
      {/* ────────────────── HEADER ────────────────── */}
      <View
        style={{ paddingTop: headerTopPadding, backgroundColor: "#2563EB" }}
        className="px-4 pb-3 flex-row items-center justify-between shadow-md"
      >
        <View className="flex-row items-center">
          {!isWide && (
            <TouchableOpacity onPress={onOpenDrawer} className="p-1 mr-2">
              <Ionicons name="menu" size={26} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          <View>
            <Text className="text-white text-lg font-black tracking-tight">
              Table & Area Management
            </Text>
            <Text className="text-blue-100 text-xs font-semibold">
              Live Floor Plan • Dine-in & KOT
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-1.5">
          <TouchableOpacity
            onPress={openAddTable}
            className="bg-emerald-600 px-3 py-1.5 rounded-xl flex-row items-center shadow-sm"
          >
            <Ionicons name="add" size={16} color="#FFFFFF" />
            <Text className="text-white font-bold text-xs ml-1">+ Table</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onRefresh}
            className="p-1.5 bg-blue-700/60 rounded-xl border border-blue-400/40"
          >
            <Ionicons name="sync" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ────────────────── DINE-IN AREA TABS ────────────────── */}
      <View className="bg-white border-b border-slate-200 py-2.5 px-4">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          <TouchableOpacity
            onPress={() => setSelectedAreaId("ALL")}
            className={`px-3.5 py-1.5 rounded-full mr-2 border ${
              selectedAreaId === "ALL"
                ? "bg-blue-600 border-blue-600"
                : "bg-slate-100 border-slate-200"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                selectedAreaId === "ALL" ? "text-white" : "text-slate-700"
              }`}
            >
              All Areas ({tables.length})
            </Text>
          </TouchableOpacity>

          {areas.map((area) => {
            const isSelected = selectedAreaId === area._id;
            const countInArea = tables.filter(
              (t) => (t.areaId?._id || t.areaId) === area._id
            ).length;
            const rateStr = area.serviceChargeRate > 0 ? ` • ${area.serviceChargeRate}% Tax` : "";
            return (
              <TouchableOpacity
                key={area._id}
                onPress={() => setSelectedAreaId(area._id)}
                className={`px-3.5 py-1.5 rounded-full mr-2 border flex-row items-center ${
                  isSelected
                    ? "bg-blue-600 border-blue-600"
                    : "bg-slate-100 border-slate-200"
                }`}
              >
                <View
                  style={{ backgroundColor: area.color || "#2563EB" }}
                  className="w-2 h-2 rounded-full mr-1.5"
                />
                <Text
                  className={`text-xs font-bold ${
                    isSelected ? "text-white" : "text-slate-700"
                  }`}
                >
                  {area.name} ({countInArea}){rateStr}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            onPress={openAddArea}
            className="px-3 py-1.5 rounded-full border border-dashed border-blue-400 bg-blue-50/50 flex-row items-center"
          >
            <Ionicons name="add" size={14} color="#2563EB" />
            <Text className="text-xs font-bold text-blue-600 ml-1">+ Area</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ────────────────── STATUS FILTER BAR ────────────────── */}
      <View className="flex-row bg-slate-100/80 px-4 py-2 border-b border-slate-200">
        {[
          { key: "ALL", label: "All", count: tables.length, color: "#1E293B" },
          { key: "AVAILABLE", label: "Available", count: availableCount, color: "#059669" },
          { key: "OCCUPIED", label: "Occupied", count: occupiedCount, color: "#DC2626" },
          { key: "BILLED", label: "Billed", count: billedCount, color: "#2563EB" },
          { key: "RESERVED", label: "Reserved", count: reservedCount, color: "#D97706" },
        ].map((tab) => {
          const isSelected = selectedStatus === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setSelectedStatus(tab.key)}
              className={`flex-1 py-1.5 rounded-xl items-center mr-1 ${
                isSelected ? "bg-white shadow-sm" : ""
              }`}
            >
              <Text
                style={{ color: isSelected ? tab.color : "#64748B" }}
                className={`text-[11px] font-extrabold ${isSelected ? "text-slate-900" : ""}`}
              >
                {tab.label} ({tab.count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ────────────────── TABLE FLOOR GRID ────────────────── */}
      {loading && tables.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
          <Text className="text-xs text-slate-500 font-semibold mt-3">
            Loading restaurant tables...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredTables}
          keyExtractor={(item) => item._id}
          numColumns={isWide ? 4 : 2}
          contentContainerStyle={{ padding: 12, paddingBottom: 60 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#2563EB"]} />
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <MaterialCommunityIcons name="table-chair" size={48} color="#94A3B8" />
              <Text className="text-base font-extrabold text-slate-700 mt-3">
                No Tables in this Area
              </Text>
              <Text className="text-xs text-slate-400 text-center mt-1 max-w-xs">
                Configure your dine-in seating arrangement by clicking "+ Table" above.
              </Text>
              <TouchableOpacity
                onPress={openAddTable}
                className="mt-4 bg-blue-600 px-5 py-2.5 rounded-xl flex-row items-center shadow-sm"
              >
                <Ionicons name="add-circle" size={16} color="#FFFFFF" />
                <Text className="text-white font-bold text-xs ml-1.5">Add First Table</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: table }) => {
            const statusStyle = STATUS_CONFIG[table.status] || STATUS_CONFIG.AVAILABLE;
            const areaName = table.areaId?.name || table.areaName || "Dining";
            const serviceRate = table.areaId?.serviceChargeRate || 0;
            const elapsed = formatElapsedMinutes(table.seatedAt);

            return (
              <TouchableOpacity
                onPress={() => handleTablePress(table)}
                activeOpacity={0.85}
                style={{ margin: 6 }}
                className={`flex-1 rounded-2xl p-3.5 border-2 ${statusStyle.border} ${statusStyle.bg} shadow-sm justify-between min-h-[140px]`}
              >
                {/* Top: Table No & Capacity */}
                <View className="flex-row justify-between items-start">
                  <View>
                    <Text className="text-xl font-black text-slate-900 tracking-tight">
                      {table.tableNo}
                    </Text>
                    <Text className="text-[10px] font-semibold text-slate-500 mt-0.5" numberOfLines={1}>
                      {areaName}
                      {serviceRate > 0 ? ` (${serviceRate}%)` : ""}
                    </Text>
                  </View>

                  <View className="flex-row items-center bg-white/80 px-2 py-0.5 rounded-md border border-slate-200/60">
                    <Ionicons name="people" size={11} color="#64748B" />
                    <Text className="text-[10px] font-bold text-slate-600 ml-1">
                      {table.capacity}
                    </Text>
                  </View>
                </View>

                {/* Middle: Live Order Details or Vacant Marker */}
                {table.status === "OCCUPIED" || table.status === "BILLED" ? (
                  <View className="my-2 bg-white/90 p-2 rounded-xl border border-slate-200/80">
                    <View className="flex-row justify-between items-center mb-0.5">
                      <Text className="text-xs font-black text-slate-900">
                        ₹{Number(table.runningTotal || 0).toFixed(0)}
                      </Text>
                      {elapsed ? (
                        <View className="flex-row items-center">
                          <Ionicons name="time-outline" size={10} color="#DC2626" />
                          <Text className="text-[10px] font-bold text-rose-600 ml-0.5">
                            {elapsed}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text className="text-[10px] font-medium text-slate-500" numberOfLines={1}>
                      {table.itemsCount || 0} items • {table.pax || 1} PAX
                    </Text>
                    {table.customerName ? (
                      <Text className="text-[9px] font-semibold text-blue-700 mt-0.5" numberOfLines={1}>
                        👤 {table.customerName}
                      </Text>
                    ) : null}
                  </View>
                ) : table.status === "RESERVED" ? (
                  <View className="my-2 bg-white/90 p-2 rounded-xl border border-amber-200">
                    <Text className="text-[11px] font-bold text-amber-900" numberOfLines={1}>
                      👤 {table.reservationName || "Reserved"}
                    </Text>
                    {table.reservationTime ? (
                      <Text className="text-[10px] font-medium text-amber-700">
                        🕒 {table.reservationTime}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <View className="my-3 items-center justify-center">
                    <Text className="text-[11px] font-bold text-emerald-700">
                      Tap to Start Bill
                    </Text>
                  </View>
                )}

                {/* Bottom Status Pill */}
                <View className="flex-row items-center justify-between pt-1">
                  <View className={`px-2 py-0.5 rounded-full ${statusStyle.badgeBg} flex-row items-center`}>
                    <View
                      style={{ backgroundColor: statusStyle.color }}
                      className="w-1.5 h-1.5 rounded-full mr-1.5"
                    />
                    <Text className={`text-[10px] font-extrabold ${statusStyle.badgeText}`}>
                      {statusStyle.label}
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={14} color="#94A3B8" />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ────────────────── TABLE ACTION MODAL ────────────────── */}
      {activeTable && (
        <Modal
          visible={Boolean(activeTable)}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setActiveTable(null)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.55)", justifyContent: "flex-end" }}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setActiveTable(null)}
              style={{ flex: 1 }}
            />
            <View
              style={{ width: "100%", maxWidth: 520, alignSelf: "center" }}
              className="bg-white rounded-t-3xl p-6 shadow-2xl"
            >
              {/* Modal Header */}
              <View className="flex-row items-center justify-between pb-3 border-b border-slate-100">
                <View className="flex-row items-center">
                  <View className="w-10 h-10 rounded-2xl bg-blue-100 items-center justify-center mr-3">
                    <FontAwesome5 name="chair" size={18} color="#2563EB" />
                  </View>
                  <View>
                    <Text className="text-xl font-black text-slate-900">
                      Table {activeTable.tableNo}
                    </Text>
                    <Text className="text-xs font-semibold text-slate-500">
                      {activeTable.areaId?.name || activeTable.areaName || "General Area"} • {activeTable.capacity || 4} Seats
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setActiveTable(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
                >
                  <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Status & Live Info */}
              {activeTable.status === "OCCUPIED" || activeTable.status === "BILLED" ? (
                <View className="bg-slate-50 p-4 rounded-2xl my-4 border border-slate-200/80">
                  <View className="flex-row justify-between items-center mb-1">
                    <Text className="text-xs font-bold text-slate-500">Running Bill Total</Text>
                    <Text className="text-2xl font-black text-slate-900">
                      ₹{Number(activeTable.runningTotal || 0).toFixed(2)}
                    </Text>
                  </View>
                  <Text className="text-xs text-slate-600">
                    Bill #{activeTable.currentInvoiceNumber || "Running"} • {activeTable.itemsCount || 0} Items • {activeTable.pax || 1} Guests
                  </Text>
                  {activeTable.customerName ? (
                    <Text className="text-xs font-bold text-blue-700 mt-1">
                      Customer: {activeTable.customerName} {activeTable.customerPhone ? `(${activeTable.customerPhone})` : ""}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Actions Grid */}
              <View className="gap-2.5 my-2">
                {activeTable.status === "AVAILABLE" ? (
                  <>
                    <TouchableOpacity
                      onPress={() => handleStartOrderFromTable(activeTable)}
                      className="w-full py-3.5 bg-blue-600 rounded-xl items-center flex-row justify-center shadow-sm active:bg-blue-700"
                    >
                      <Ionicons name="receipt-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text className="text-white font-extrabold text-sm">
                        Start New Order / Bill
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setShowReserveModal(true)}
                      className="w-full py-3 bg-blue-50 border border-blue-200 rounded-xl items-center flex-row justify-center"
                    >
                      <Ionicons name="calendar-outline" size={18} color="#2563EB" style={{ marginRight: 6 }} />
                      <Text className="text-blue-700 font-bold text-sm">
                        Reserve Table
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : activeTable.status === "RESERVED" ? (
                  <>
                    <TouchableOpacity
                      onPress={() => handleStartOrderFromTable(activeTable)}
                      className="w-full py-3.5 bg-blue-600 rounded-xl items-center flex-row justify-center shadow-sm"
                    >
                      <Ionicons name="restaurant-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text className="text-white font-extrabold text-sm">
                        Seat Guests & Start Bill
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleCancelReservation(activeTable)}
                      className="w-full py-3 bg-red-50 border border-red-200 rounded-xl items-center flex-row justify-center"
                    >
                      <Ionicons name="close-circle-outline" size={18} color="#DC2626" style={{ marginRight: 6 }} />
                      <Text className="text-red-700 font-bold text-sm">
                        Cancel Reservation
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {/* Occupied / Billed Actions */}
                    <TouchableOpacity
                      onPress={() => handleStartOrderFromTable(activeTable)}
                      className="w-full py-3.5 bg-blue-600 rounded-xl items-center flex-row justify-center shadow-sm"
                    >
                      <Ionicons name="create-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text className="text-white font-extrabold text-sm">
                        Open & Edit Running Bill / KOT
                      </Text>
                    </TouchableOpacity>

                    <View className="flex-row gap-2">
                      <TouchableOpacity
                        onPress={() => setShowQrModal(true)}
                        className="flex-1 py-3 bg-blue-50 border border-blue-200 rounded-xl items-center flex-row justify-center"
                      >
                        <Ionicons name="qr-code-outline" size={17} color="#2563EB" style={{ marginRight: 5 }} />
                        <Text className="text-blue-700 font-bold text-xs">
                          Dynamic UPI QR
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          setShowTransferModal(true);
                          setTargetTableId("");
                        }}
                        className="flex-1 py-3 bg-amber-50 border border-amber-200 rounded-xl items-center flex-row justify-center"
                      >
                        <Ionicons name="swap-horizontal" size={17} color="#D97706" style={{ marginRight: 5 }} />
                        <Text className="text-amber-800 font-bold text-xs">
                          Transfer Table
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleSettleTable(activeTable)}
                      className="w-full py-3.5 bg-emerald-600 rounded-xl items-center flex-row justify-center shadow-sm"
                    >
                      <Ionicons name="checkmark-done" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text className="text-white font-extrabold text-sm">
                        Settle & Vacate Table
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Edit Table Configuration */}
                <TouchableOpacity
                  onPress={() => {
                    setEditingTable(activeTable);
                    setTableFormNo(activeTable.tableNo);
                    setTableFormAreaId(activeTable.areaId?._id || activeTable.areaId || "");
                    setTableFormCapacity(String(activeTable.capacity || 4));
                    setTableFormShape(activeTable.shape || "square");
                    setShowTableModal(true);
                    setActiveTable(null);
                  }}
                  className="w-full py-2.5 items-center mt-1"
                >
                  <Text className="text-xs font-bold text-slate-500">
                    Edit Table Settings
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ────────────────── TRANSFER TABLE MODAL ────────────────── */}
      {showTransferModal && activeTable && (
        <Modal
          visible={showTransferModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowTransferModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 16 }}>
            <View style={{ width: "100%", maxWidth: 384, alignSelf: "center" }} className="bg-white rounded-3xl p-6 shadow-2xl">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-black text-slate-900">
                  Transfer Order
                </Text>
                <TouchableOpacity
                  onPress={() => setShowTransferModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
                >
                  <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <Text className="text-xs font-semibold text-slate-500 mb-3">
                Move active order from <Text className="font-black text-slate-900">Table {activeTable.tableNo}</Text> to:
              </Text>

              <ScrollView className="max-h-60 mb-4">
                {tables
                  .filter((t) => t._id !== activeTable._id && t.status === "AVAILABLE")
                  .map((t) => {
                    const isSelected = targetTableId === t._id;
                    return (
                      <TouchableOpacity
                        key={t._id}
                        onPress={() => setTargetTableId(t._id)}
                        className={`p-3 rounded-xl border mb-2 flex-row justify-between items-center ${
                          isSelected
                            ? "bg-blue-50 border-blue-600"
                            : "bg-white border-slate-200"
                        }`}
                      >
                        <View>
                          <Text className="font-extrabold text-sm text-slate-900">
                            Table {t.tableNo}
                          </Text>
                          <Text className="text-[11px] text-slate-500">
                            {t.areaId?.name || t.areaName} • {t.capacity} Seats
                          </Text>
                        </View>
                        {isSelected ? (
                          <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                {tables.filter((t) => t._id !== activeTable._id && t.status === "AVAILABLE").length === 0 ? (
                  <Text className="text-xs text-red-500 text-center py-4">
                    No available tables to transfer to.
                  </Text>
                ) : null}
              </ScrollView>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setShowTransferModal(false)}
                  className="flex-1 py-3 bg-slate-100 rounded-xl items-center"
                >
                  <Text className="font-bold text-slate-700 text-sm">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleExecuteTransfer}
                  disabled={transferring || !targetTableId}
                  className={`flex-1 py-3 rounded-xl items-center flex-row justify-center ${
                    targetTableId ? "bg-amber-600 active:bg-amber-700" : "bg-slate-300"
                  }`}
                >
                  {transferring ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="font-bold text-white text-sm">Confirm Transfer</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ────────────────── TABLE RESERVATION MODAL ────────────────── */}
      {showReserveModal && activeTable && (
        <Modal
          visible={showReserveModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowReserveModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 16 }}>
            <View style={{ width: "100%", maxWidth: 384, alignSelf: "center" }} className="bg-white rounded-3xl p-6 shadow-2xl">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-black text-slate-900">
                  Reserve Table {activeTable.tableNo}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowReserveModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
                >
                  <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View className="mb-3">
                <Text className="text-xs font-bold text-slate-600 mb-1">Guest Name</Text>
                <TextInput
                  value={guestName}
                  onChangeText={setGuestName}
                  placeholder="e.g. John Doe"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
                />
              </View>

              <View className="mb-3">
                <Text className="text-xs font-bold text-slate-600 mb-1">Phone Number</Text>
                <TextInput
                  value={guestPhone}
                  onChangeText={setGuestPhone}
                  placeholder="10-digit mobile"
                  keyboardType="phone-pad"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
                />
              </View>

              <View className="mb-4">
                <Text className="text-xs font-bold text-slate-600 mb-1">Reservation Time</Text>
                <TextInput
                  value={guestTime}
                  onChangeText={setGuestTime}
                  placeholder="e.g. 8:00 PM Tonight"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
                />
              </View>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setShowReserveModal(false)}
                  className="flex-1 py-3 bg-slate-100 rounded-xl items-center"
                >
                  <Text className="font-bold text-slate-700 text-sm">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveReservation}
                  className="flex-1 py-3 bg-blue-600 rounded-xl items-center active:bg-blue-700"
                >
                  <Text className="font-bold text-white text-sm">Confirm Reserve</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ────────────────── CREATE / EDIT TABLE MODAL ────────────────── */}
      {showTableModal && (
        <Modal
          visible={showTableModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowTableModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 16 }}>
            <View style={{ width: "100%", maxWidth: 384, alignSelf: "center" }} className="bg-white rounded-3xl p-6 shadow-2xl">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-black text-slate-900">
                  {editingTable ? "Edit Table" : "Add New Table"}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowTableModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
                >
                  <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View className="mb-3">
                <Text className="text-xs font-bold text-slate-600 mb-1">Table Number / Name</Text>
                <TextInput
                  value={tableFormNo}
                  onChangeText={setTableFormNo}
                  placeholder="e.g. T-05, AC-02, R-01"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
                />
              </View>

              <View className="mb-3">
                <Text className="text-xs font-bold text-slate-600 mb-1">Dine-in Area</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                  {areas.map((a) => {
                    const isSelected = tableFormAreaId === a._id;
                    return (
                      <TouchableOpacity
                        key={a._id}
                        onPress={() => setTableFormAreaId(a._id)}
                        className={`px-3 py-1.5 rounded-full mr-2 border ${
                          isSelected ? "bg-blue-600 border-blue-600" : "bg-slate-100 border-slate-200"
                        }`}
                      >
                        <Text className={`text-xs font-bold ${isSelected ? "text-white" : "text-slate-700"}`}>
                          {a.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View className="mb-4">
                <Text className="text-xs font-bold text-slate-600 mb-1">Seating Capacity</Text>
                <View className="flex-row gap-2">
                  {[2, 4, 6, 8, 12].map((cap) => {
                    const isSelected = Number(tableFormCapacity) === cap;
                    return (
                      <TouchableOpacity
                        key={cap}
                        onPress={() => setTableFormCapacity(String(cap))}
                        className={`flex-1 py-2 rounded-xl border items-center ${
                          isSelected ? "bg-blue-600 border-blue-600" : "bg-slate-100 border-slate-200"
                        }`}
                      >
                        <Text className={`text-xs font-black ${isSelected ? "text-white" : "text-slate-700"}`}>
                          {cap}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setShowTableModal(false)}
                  className="flex-1 py-3 bg-slate-100 rounded-xl items-center"
                >
                  <Text className="font-bold text-slate-700 text-sm">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveTable}
                  disabled={savingTable}
                  className="flex-1 py-3 bg-blue-600 rounded-xl items-center active:bg-blue-700"
                >
                  {savingTable ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="font-bold text-white text-sm">Save Table</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ────────────────── CREATE / EDIT AREA MODAL ────────────────── */}
      {showAreaModal && (
        <Modal
          visible={showAreaModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowAreaModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 16 }}>
            <View style={{ width: "100%", maxWidth: 384, alignSelf: "center" }} className="bg-white rounded-3xl p-6 shadow-2xl">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-black text-slate-900">
                  {editingArea ? "Edit Dine-in Area" : "Add Dine-in Area"}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowAreaModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
                >
                  <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View className="mb-3">
                <Text className="text-xs font-bold text-slate-600 mb-1">Area Name</Text>
                <TextInput
                  value={areaFormName}
                  onChangeText={setAreaFormName}
                  placeholder="e.g. AC Dining Hall, Rooftop"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
                />
              </View>

              <View className="mb-4">
                <Text className="text-xs font-bold text-slate-600 mb-1">
                  Service Tax / Service Charge (%)
                </Text>
                <TextInput
                  value={areaFormRate}
                  onChangeText={setAreaFormRate}
                  placeholder="e.g. 5 for 5%"
                  keyboardType="numeric"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900"
                />
                <Text className="text-[11px] text-slate-400 mt-1">
                  Auto-applied to bills in this section (e.g. 5% AC charge).
                </Text>
              </View>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setShowAreaModal(false)}
                  className="flex-1 py-3 bg-slate-100 rounded-xl items-center"
                >
                  <Text className="font-bold text-slate-700 text-sm">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveArea}
                  disabled={savingArea}
                  className="flex-1 py-3 bg-blue-600 rounded-xl items-center active:bg-blue-700"
                >
                  {savingArea ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text className="font-bold text-white text-sm">Save Area</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ────────────────── DYNAMIC UPI QR MODAL ────────────────── */}
      {showQrModal && activeTable && (
        <DynamicUpiQrModal
          visible={showQrModal}
          onClose={() => setShowQrModal(false)}
          upiId={user?.upiId || ""}
          storeName={user?.businessName || "Bistromate"}
          amount={activeTable.runningTotal || 0}
          invoiceNumber={activeTable.currentInvoiceNumber || ""}
          tableName={activeTable.tableNo}
          onMarkPaid={() => handleSettleTable(activeTable)}
        />
      )}
    </View>
  );
}

