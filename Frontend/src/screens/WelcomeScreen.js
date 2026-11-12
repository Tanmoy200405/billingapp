import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { useResponsive } from "../utils/responsive";

export default function WelcomeScreen({ onNavigate }) {
  const { isWide } = useResponsive();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: isWide ? "#F8FAFC" : "#FFFFFF",
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
        <View className="items-center mt-6 mb-8">
          <View className="w-28 h-28 rounded-3xl overflow-hidden shadow-xl mb-6 border-2 border-slate-100 bg-[#10353B] items-center justify-center">
            <Image
              source={require("../../assets/bistromate_logo.png")}
              style={{ width: 110, height: 110 }}
              resizeMode="contain"
            />
          </View>

          <Text className="text-3xl font-black text-slate-900 text-center tracking-tight">
            Bistromate
          </Text>
          <Text className="text-xs font-extrabold text-blue-600 text-center uppercase tracking-widest mt-1 mb-4">
            Your Kitchen's Smart Partner
          </Text>
          <Text className="text-sm text-gray-500 text-center max-w-xs leading-5">
            Fast thermal billing, table & KOT management, WhatsApp PDF receipts, inventory control, and live sync built for your business.
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
