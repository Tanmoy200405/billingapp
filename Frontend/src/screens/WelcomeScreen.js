import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function WelcomeScreen({ onNavigate }) {
  return (
    <View style={{ flex: 1 }} className="flex-1 bg-white justify-between px-6 py-12">
      <View className="items-center mt-12">
        <View className="w-24 h-24 rounded-3xl bg-blue-600 items-center justify-center shadow-lg mb-8">
          <MaterialCommunityIcons name="receipt-text" size={48} color="#FFFFFF" />
        </View>

        <Text className="text-3xl font-extrabold text-blue-900 text-center">
          Discover Your
        </Text>
        <Text className="text-3xl font-extrabold text-blue-600 text-center mb-4">
          Stats here
        </Text>
        <Text className="text-sm text-gray-500 text-center max-w-xs leading-5">
          Explore all the existing tools and calculate your bills, stock, and regular customer discounts seamlessly.
        </Text>
      </View>

      <View className="flex-row gap-4 mb-4">
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
  );
}
