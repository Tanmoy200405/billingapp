import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useResponsive } from "../utils/responsive";

export default function WelcomeScreen({ onNavigate }) {
  const { isWide } = useResponsive();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: isWide ? "#F1F5F9" : "#FFFFFF",
        justifyContent: isWide ? "center" : "space-between",
        alignItems: "center",
        paddingHorizontal: 24,
        paddingVertical: 40,
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 460,
          flex: isWide ? 0 : 1,
          justifyContent: "space-between",
          backgroundColor: "#FFFFFF",
          borderRadius: isWide ? 24 : 0,
          padding: isWide ? 36 : 0,
          borderWidth: isWide ? 1 : 0,
          borderColor: "#E2E8F0",
          shadowColor: isWide ? "#0F172A" : "transparent",
          shadowOpacity: isWide ? 0.08 : 0,
          shadowRadius: isWide ? 24 : 0,
          elevation: isWide ? 4 : 0,
        }}
      >
        <View className="items-center mt-8 mb-8">
          <View className="w-24 h-24 rounded-3xl bg-blue-600 items-center justify-center shadow-lg mb-8">
            <MaterialCommunityIcons name="receipt-text" size={48} color="#FFFFFF" />
          </View>

          <Text className="text-3xl font-extrabold text-blue-900 text-center">
            Smart POS &
          </Text>
          <Text className="text-3xl font-extrabold text-blue-600 text-center mb-4">
            Billing Suite
          </Text>
          <Text className="text-sm text-gray-500 text-center max-w-xs leading-5">
            Fast thermal billing, inventory control, WhatsApp PDF receipts, and VIP customer loyalty built for your store.
          </Text>
        </View>

        <View className="flex-row gap-4 mb-2">
          <TouchableOpacity
            onPress={() => onNavigate("login")}
            activeOpacity={0.8}
            className="flex-1 bg-blue-600 py-4 rounded-xl items-center shadow-sm"
          >
            <Text className="text-white font-bold text-base">Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onNavigate("register")}
            activeOpacity={0.8}
            className="flex-1 bg-gray-100 border border-gray-200 py-4 rounded-xl items-center"
          >
            <Text className="text-gray-800 font-bold text-base">Register</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
