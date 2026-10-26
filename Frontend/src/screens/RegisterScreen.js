import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons, FontAwesome, MaterialIcons } from "@expo/vector-icons";
import { api, setAuthToken } from "../config/api";

export default function RegisterScreen({ onNavigate, onRegisterSuccess }) {
  const [businessName, setBusinessName] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [gstin, setGstin] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!businessName.trim() || !name.trim() || !phone.trim() || !password) {
      Alert.alert("Required Fields", "Please fill in Business Name, Owner Name, Phone, and Password");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Mismatch", "Password and Confirm Password do not match");
      return;
    }

    setLoading(true);
    const res = await api.auth.register({
      businessName: businessName.trim(),
      name: name.trim(),
      phone: phone.trim(),
      whatsappNumber: phone.trim(),
      password,
      gstin: gstin.trim() || undefined,
    });
    setLoading(false);

    if (res.success && res.token) {
      setAuthToken(res.token, res.user);
      onRegisterSuccess(res.user);
    } else {
      Alert.alert("Registration Failed", res.message || "Failed to create account");
    }
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      className="flex-1 bg-white px-6 pt-12"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "space-between", paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View>
        <TouchableOpacity
          onPress={() => onNavigate("welcome")}
          className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mb-4"
        >
          <Ionicons name="arrow-back" size={20} color="#374151" />
        </TouchableOpacity>

        <Text className="text-3xl font-extrabold text-blue-900 text-center">
          Create Account
        </Text>
        <Text className="text-xs text-gray-500 text-center mt-1 mb-6 px-4">
          Create an account so you can manage your billing, inventory, and regular customers.
        </Text>

        <View className="mb-3">
          <Text className="text-xs font-bold text-gray-600 mb-1">Business / Store Name</Text>
          <TextInput
            className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-gray-900"
            placeholder="e.g. Sri Krishna Super Mart"
            placeholderTextColor="#9CA3AF"
            value={businessName}
            onChangeText={setBusinessName}
          />
        </View>

        <View className="mb-3">
          <Text className="text-xs font-bold text-gray-600 mb-1">Owner Name</Text>
          <TextInput
            className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-gray-900"
            placeholder="e.g. Ramesh Kumar"
            placeholderTextColor="#9CA3AF"
            value={name}
            onChangeText={setName}
          />
        </View>

        <View className="mb-3">
          <Text className="text-xs font-bold text-gray-600 mb-1">Phone / WhatsApp Number</Text>
          <TextInput
            className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-gray-900"
            placeholder="10-digit mobile number"
            placeholderTextColor="#9CA3AF"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <View className="mb-3">
          <Text className="text-xs font-bold text-gray-600 mb-1">GSTIN (Optional)</Text>
          <TextInput
            className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-gray-900"
            placeholder="e.g. 19AAACB1234F1Z5"
            placeholderTextColor="#9CA3AF"
            value={gstin}
            onChangeText={setGstin}
            autoCapitalize="characters"
          />
        </View>

        <View className="mb-3">
          <Text className="text-xs font-bold text-gray-600 mb-1">Password</Text>
          <TextInput
            className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-gray-900"
            placeholder="Enter password"
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <View className="mb-6">
          <Text className="text-xs font-bold text-gray-600 mb-1">Confirm Password</Text>
          <TextInput
            className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-gray-900"
            placeholder="Confirm password"
            placeholderTextColor="#9CA3AF"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          onPress={handleRegister}
          disabled={loading}
          activeOpacity={0.8}
          className="w-full bg-blue-600 py-4 rounded-xl items-center shadow-md shadow-blue-500/30"
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-white font-bold text-base">Sign up</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onNavigate("login")}
          className="items-center mt-5"
        >
          <Text className="text-xs font-semibold text-gray-600">
            Already have an account
          </Text>
        </TouchableOpacity>
      </View>

      <View className="items-center mt-6">
        <Text className="text-xs text-blue-600 font-bold mb-3">Or continue with</Text>
        <View className="flex-row gap-4">
          <View className="w-11 h-11 rounded-xl bg-gray-100 items-center justify-center border border-gray-200">
            <FontAwesome name="google" size={18} color="#EA4335" />
          </View>
          <View className="w-11 h-11 rounded-xl bg-gray-100 items-center justify-center border border-gray-200">
            <FontAwesome name="apple" size={20} color="#111827" />
          </View>
          <View className="w-11 h-11 rounded-xl bg-gray-100 items-center justify-center border border-gray-200">
            <MaterialIcons name="whatsapp" size={22} color="#16A34A" />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
