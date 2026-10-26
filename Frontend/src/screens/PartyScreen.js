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
} from "react-native";
import { Ionicons, FontAwesome, MaterialIcons } from "@expo/vector-icons";
import { api } from "../config/api";

export default function PartyScreen({ onOpenDrawer, onBack }) {
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [bulkSending, setBulkSending] = useState(false);

  const [perksModalVisible, setPerksModalVisible] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);
  const [formIsRegular, setFormIsRegular] = useState(false);
  const [formDiscount, setFormDiscount] = useState("0");
  const [formFreebie, setFormFreebie] = useState("");

  const loadParties = useCallback(async () => {
    setLoading(true);
    let query = search ? `search=${encodeURIComponent(search)}` : "";
    if (filterType === "vip") {
      query += `${query ? "&" : ""}isRegular=true`;
    } else if (filterType === "customer" || filterType === "supplier") {
      query += `${query ? "&" : ""}type=${filterType}`;
    }
    const res = await api.parties.getAll(query);
    setLoading(false);
    if (res.success && res.parties) setParties(res.parties);
  }, [search, filterType]);

  useEffect(() => {
    loadParties();
  }, [filterType]);

  const handleSavePerks = async () => {
    if (!selectedParty) return;
    const res = await api.parties.updateRegularPerks(selectedParty._id, {
      isRegular: formIsRegular,
      customDiscountPercent: Number(formDiscount) || 0,
      assignedFreebie: formFreebie.trim(),
    });
    if (res.success) {
      setPerksModalVisible(false);
      loadParties();
      Alert.alert("Saved", "Customer perks updated");
    } else {
      Alert.alert("Error", res.message || "Failed to update perks");
    }
  };

  const openWhatsAppOffer = async (party) => {
    const res = await api.parties.getWhatsAppOffer(party._id);
    if (res.success && res.whatsappUrl) {
      Linking.openURL(res.whatsappUrl);
    } else {
      const phone = party.whatsappNumber || party.phone;
      Linking.openURL(`https://wa.me/91${phone}`);
    }
  };

  const handleBulkVipOffer = async () => {
    const vips = parties.filter((p) => p.isRegular);
    if (!vips.length) {
      Alert.alert("No VIPs", "No VIP customers found.");
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
            if (res.success && res.vips && res.vips.length > 0) {
              for (const vip of res.vips) {
                await Linking.openURL(vip.whatsappUrl);
                await new Promise((r) => setTimeout(r, 800));
              }
              Alert.alert("Done", `WhatsApp opened for ${res.vips.length} VIP(s).`);
            } else {
              Alert.alert("No Results", res.message || "No VIP offers to send.");
            }
          },
        },
      ]
    );
  };

  const openPerksDialog = (party) => {
    setSelectedParty(party);
    setFormIsRegular(party.isRegular);
    setFormDiscount((party.customDiscountPercent || 0).toString());
    setFormFreebie(party.assignedFreebie || "");
    setPerksModalVisible(true);
  };

  const vipCount = parties.filter((p) => p.isRegular).length;

  const visitLabel = (count) => {
    if (!count || count === 0) return "New Customer";
    if (count === 1) return "1 visit";
    return `${count} visits`;
  };

  return (
    <View style={{ flex: 1 }} className="flex-1 bg-gray-50">
      <View className="bg-blue-600 px-4 pt-10 pb-4">
        <View className="flex-row items-center justify-between mb-3">
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
            <View>
              <Text className="text-white text-xl font-bold">Customers</Text>
              <Text className="text-blue-200 text-[11px]">
                {parties.length} total · {vipCount} VIP
              </Text>
            </View>
          </View>
          {vipCount > 0 ? (
            <TouchableOpacity
              onPress={handleBulkVipOffer}
              disabled={bulkSending}
              className="bg-amber-400 px-3 py-1.5 rounded-lg flex-row items-center"
            >
              {bulkSending ? (
                <ActivityIndicator size="small" color="#78350f" />
              ) : (
                <>
                  <FontAwesome name="whatsapp" size={14} color="#78350f" />
                  <Text className="text-amber-900 font-bold text-xs ml-1">
                    Notify {vipCount} VIPs
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>

        <View className="flex-row bg-white rounded-xl px-3 py-2 items-center">
          <Ionicons name="search" size={18} color="#9CA3AF" />
          <TextInput
            className="flex-1 ml-2 text-sm text-gray-800"
            placeholder="Search by name or phone..."
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
      </View>

      <View className="flex-row bg-white border-b border-gray-200 px-2 py-2">
        {[
          { key: "all", label: "All" },
          { key: "vip", label: "VIP" },
          { key: "customer", label: "Customers" },
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

      <View className="bg-blue-50 border-b border-blue-100 px-4 py-2">
        <Text className="text-[11px] text-blue-700 font-medium">
          Customers are added automatically when you bill with their phone number.
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={parties}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <MaterialIcons name="people-outline" size={52} color="#9CA3AF" />
              <Text className="text-gray-500 font-semibold text-sm mt-3">
                No customers yet
              </Text>
              <Text className="text-gray-400 text-xs mt-1 text-center px-8">
                Create a bill with a customer phone number and they will appear here automatically.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View className="bg-white rounded-xl p-4 mb-3 border border-gray-200 shadow-sm">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <View className="flex-row items-center flex-wrap mb-1" style={{ gap: 6 }}>
                    <Text className="text-base font-extrabold text-gray-900">
                      {item.name}
                    </Text>
                    {item.isRegular ? (
                      <View className="bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                        <Text className="text-amber-800 text-[10px] font-bold">VIP</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text className="text-xs text-gray-500 mb-2">{item.phone}</Text>

                  <View className="flex-row flex-wrap mb-2" style={{ gap: 6 }}>
                    <View className="bg-gray-100 rounded-lg px-2.5 py-1">
                      <Text className="text-xs font-extrabold text-blue-700">
                        {visitLabel(item.visitCount)}
                      </Text>
                    </View>
                    {item.totalSpent > 0 ? (
                      <View className="bg-gray-100 rounded-lg px-2.5 py-1">
                        <Text className="text-xs font-extrabold text-emerald-700">
                          Rs. {item.totalSpent} spent
                        </Text>
                      </View>
                    ) : null}
                    {item.lastVisitDate ? (
                      <View className="bg-gray-100 rounded-lg px-2.5 py-1">
                        <Text className="text-[10px] font-bold text-gray-500">
                          Last: {new Date(item.lastVisitDate).toLocaleDateString()}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {item.isRegular && (item.customDiscountPercent > 0 || item.assignedFreebie) ? (
                    <View className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">
                      {item.customDiscountPercent > 0 ? (
                        <Text className="text-amber-900 text-xs font-bold">
                          {item.customDiscountPercent}% discount on every bill
                        </Text>
                      ) : null}
                      {item.assignedFreebie ? (
                        <Text className="text-amber-800 text-xs mt-0.5">
                          Free gift: {item.assignedFreebie}
                        </Text>
                      ) : null}
                    </View>
                  ) : null}

                  {!item.isRegular && item.visitCount >= 3 ? (
                    <View className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-2">
                      <Text className="text-blue-800 text-xs font-bold">
                        {item.visitCount >= 5
                          ? "Auto-promoted to VIP!"
                          : `${5 - item.visitCount} more visits to become VIP`}
                      </Text>
                    </View>
                  ) : null}

                  <TouchableOpacity onPress={() => openPerksDialog(item)}>
                    <Text className="text-xs font-bold text-blue-600">
                      {item.isRegular ? "Edit VIP Perks" : "Mark as VIP / Set Perks"}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={() => openWhatsAppOffer(item)}
                  activeOpacity={0.8}
                  className="w-12 h-12 rounded-full bg-emerald-500 items-center justify-center"
                >
                  <FontAwesome name="whatsapp" size={26} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={perksModalVisible} animationType="fade" transparent={true}>
        <View className="flex-1 bg-black/50 justify-center px-6">
          <View className="bg-white rounded-2xl p-6 shadow-xl">
            <Text className="text-base font-bold text-gray-900 mb-1">
              {selectedParty?.isRegular ? "VIP Customer Perks" : "Set VIP Status"}
            </Text>
            <Text className="text-xs text-gray-500 mb-1">{selectedParty?.name}</Text>
            <Text className="text-[11px] text-gray-400 mb-4">
              {visitLabel(selectedParty?.visitCount)} · Rs. {selectedParty?.totalSpent || 0} total spent
            </Text>

            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-sm font-bold text-gray-800">VIP Customer Status</Text>
              <Switch
                value={formIsRegular}
                onValueChange={setFormIsRegular}
                trackColor={{ false: "#D1D5DB", true: "#2563EB" }}
              />
            </View>

            {formIsRegular ? (
              <>
                <View className="mb-3">
                  <Text className="text-xs font-bold text-gray-700 mb-1">
                    Custom Discount % (auto-applied on bills)
                  </Text>
                  <TextInput
                    className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                    placeholder="e.g. 10"
                    keyboardType="numeric"
                    value={formDiscount}
                    onChangeText={setFormDiscount}
                  />
                </View>
                <View className="mb-5">
                  <Text className="text-xs font-bold text-gray-700 mb-1">
                    Free Gift Item (given on each visit)
                  </Text>
                  <TextInput
                    className="bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
                    placeholder="e.g. Cold Drink 250ml / Free Sample"
                    value={formFreebie}
                    onChangeText={setFormFreebie}
                  />
                </View>
              </>
            ) : (
              <View className="mb-5" />
            )}

            <View className="flex-row" style={{ gap: 12 }}>
              <TouchableOpacity
                onPress={() => setPerksModalVisible(false)}
                className="flex-1 bg-gray-100 py-3 rounded-xl items-center"
              >
                <Text className="text-gray-700 font-bold text-xs">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSavePerks}
                className="flex-1 bg-blue-600 py-3 rounded-xl items-center"
              >
                <Text className="text-white font-bold text-xs">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
