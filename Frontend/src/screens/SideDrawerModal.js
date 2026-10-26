import React from "react";
import { View, Text, TouchableOpacity, Modal, ScrollView, Image } from "react-native";
import { MaterialIcons, Ionicons, FontAwesome5 } from "@expo/vector-icons";

export default function SideDrawerModal({
  visible,
  onClose,
  user,
  onNavigateTab,
  onLogout,
}) {
  const menuItems = [
    { id: "dashboard", label: "1. Dashboard", icon: "home" },
    { id: "reports", label: "2. Reports", icon: "assessment" },
    { id: "sales", label: "3. Sale List", icon: "receipt" },
    { id: "party", label: "4. Party", icon: "people" },
    { id: "inventory", label: "5. Inventory", icon: "inventory" },
    { id: "setting", label: "6. Settings", icon: "settings" },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/50 flex-row">
        <View className="w-3/4 max-w-xs bg-white h-full shadow-2xl">
          <View className="bg-blue-600 px-6 pt-12 pb-8 items-center">
            <View className="w-20 h-20 rounded-full bg-gray-200 border-2 border-white items-center justify-center mb-3 shadow overflow-hidden">
              {user?.logo ? (
                <Image
                  source={{ uri: user.logo }}
                  style={{ width: 80, height: 80, borderRadius: 40 }}
                />
              ) : (
                <FontAwesome5 name="store" size={32} color="#2563EB" />
              )}
            </View>
            <Text className="text-white text-lg font-extrabold text-center uppercase tracking-wider">
              {user?.businessName || "COMPANY NAME"}
            </Text>
            <Text className="text-blue-100 text-xs font-semibold mt-1">
              {user?.phone || "Phone Number"}
            </Text>
            {user?.gstin ? (
              <Text className="text-blue-200 text-xs mt-0.5">
                GSTIN: {user.gstin}
              </Text>
            ) : null}
          </View>

          <ScrollView className="flex-1 py-4 px-3">
            {menuItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  onClose();
                  if (item.id === "reports" || item.id === "sales") {
                    onNavigateTab("dashboard");
                  } else {
                    onNavigateTab(item.id);
                  }
                }}
                className="flex-row items-center px-4 py-3.5 rounded-xl hover:bg-gray-100 active:bg-blue-50 mb-1"
              >
                <MaterialIcons name={item.icon} size={22} color="#1E40AF" />
                <Text className="text-gray-800 font-bold text-sm ml-4">
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}

            <View className="h-px bg-gray-200 my-4 mx-2" />

            <TouchableOpacity
              onPress={() => {
                onClose();
                onLogout();
              }}
              className="flex-row items-center px-4 py-3 rounded-xl active:bg-red-50"
            >
              <Ionicons name="log-out-outline" size={22} color="#DC2626" />
              <Text className="text-red-600 font-bold text-sm ml-4">
                Logout
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        <TouchableOpacity
          className="flex-1"
          activeOpacity={1}
          onPress={onClose}
        />
      </View>
    </Modal>
  );
}
