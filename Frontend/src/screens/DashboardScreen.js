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
} from "react-native";
import {
  Ionicons,
  MaterialIcons,
  FontAwesome5,
} from "@expo/vector-icons";
import { api } from "../config/api";

export default function DashboardScreen({
  user,
  onOpenDrawer,
  onNavigateTab,
  onCreateInvoice,
}) {
  const [stats, setStats] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    const res = await api.dashboard.getStats();
    setLoading(false);
    setRefreshing(false);

    if (res.success) {
      setStats(res.stats);
      setRecentTransactions(res.recentTransactions || []);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  return (
    <View style={{ flex: 1 }} className="flex-1 bg-gray-100">
      <View className="bg-blue-600 px-4 pt-10 pb-4 flex-row items-center justify-between shadow-md">
        <TouchableOpacity onPress={onOpenDrawer} className="p-1">
          <Ionicons name="menu" size={26} color="#FFFFFF" />
        </TouchableOpacity>

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

        <TouchableOpacity onPress={onRefresh} className="p-1">
          <Ionicons name="sync" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Reports Banner matching Screen-1 */}
        <TouchableOpacity
          onPress={() => (onNavigateTab ? onNavigateTab("reports") : onRefresh())}
          activeOpacity={0.85}
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

        {/* Recent Sale Transactions matching Screen-1 */}
        <View className="flex-row items-center justify-between mb-2 px-1">
          <Text className="text-xs font-extrabold text-gray-700 uppercase tracking-widest">
            Recent Sale Transactions
          </Text>
          <Text className="text-[11px] text-gray-400">
            {recentTransactions.length} recorded
          </Text>
        </View>

        {loading && !refreshing ? (
          <View className="py-12 items-center">
            <ActivityIndicator size="small" color="#2563EB" />
          </View>
        ) : recentTransactions.length === 0 ? (
          <View className="bg-white rounded-2xl p-8 items-center justify-center border border-gray-200">
            <FontAwesome5 name="file-invoice-dollar" size={36} color="#9CA3AF" />
            <Text className="text-gray-500 font-bold text-xs mt-3">
              No sales yet. Tap + Sale Invoice to create your first bill!
            </Text>
          </View>
        ) : (
          recentTransactions.map((tx) => (
            <View
              key={tx._id}
              className="bg-white rounded-xl p-3.5 mb-2.5 border border-gray-200 shadow-sm flex-row items-center justify-between"
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
                <Text className="text-[11px] text-gray-400 mt-0.5">
                  {tx.invoiceNumber} • {new Date(tx.invoiceDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>

                <View className="flex-row items-center gap-1.5 mt-2">
                  <View
                    className={`px-2 py-0.5 rounded border ${
                      tx.paymentMode === "CASH"
                        ? "bg-emerald-50 border-emerald-300"
                        : tx.paymentMode === "UPI"
                        ? "bg-purple-50 border-purple-300"
                        : tx.paymentMode === "UPI/CASH"
                        ? "bg-amber-50 border-amber-300"
                        : "bg-blue-50 border-blue-300"
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-bold ${
                        tx.paymentMode === "CASH"
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
                </View>
              </View>

              <Text className="text-base font-extrabold text-gray-900">
                Rs. {tx.grandTotal}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* Floating Action Button: + Sale Invoice */}
      <View className="absolute bottom-4 left-0 right-0 items-center">
        <TouchableOpacity
          onPress={onCreateInvoice}
          activeOpacity={0.85}
          className="bg-blue-600 px-8 py-3.5 rounded-full shadow-lg shadow-blue-600/40 flex-row items-center"
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text className="text-white font-extrabold text-sm ml-1 uppercase tracking-wider">
            Sale Invoice
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
