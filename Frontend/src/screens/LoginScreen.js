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

export default function LoginScreen({ onNavigate, onLoginSuccess }) {
  const [useOtp, setUseOtp] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!identifier.trim()) {
      Alert.alert("Input Required", "Please enter your phone or WhatsApp number");
      return;
    }
    setLoading(true);
    const res = await api.auth.sendOtp(identifier.trim(), "whatsapp");
    setLoading(false);

    if (res.success) {
      setOtpSent(true);
      if (res.code) {
        setOtpCode(res.code);
      }
      Alert.alert("Code Sent", res.message || "OTP code has been generated");
    } else {
      Alert.alert("Error", res.message || "Failed to send code");
    }
  };

  const handleLogin = async () => {
    if (!identifier.trim()) {
      Alert.alert("Input Required", "Please enter phone, WhatsApp or email");
      return;
    }

    if (!useOtp && !password) {
      Alert.alert("Password Required", "Please enter your password");
      return;
    }

    if (useOtp && !otpCode.trim()) {
      Alert.alert("OTP Required", "Please enter the verification code");
      return;
    }

    setLoading(true);
    const payload = useOtp
      ? { identifier: identifier.trim(), otpCode: otpCode.trim() }
      : { identifier: identifier.trim(), password };

    const res = await api.auth.login(payload);
    setLoading(false);

    if (res.success && res.token) {
      setAuthToken(res.token, res.user);
      onLoginSuccess(res.user);
    } else {
      Alert.alert("Login Failed", res.message || "Invalid credentials");
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
          className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mb-6"
        >
          <Ionicons name="arrow-back" size={20} color="#374151" />
        </TouchableOpacity>

        <Text className="text-3xl font-extrabold text-blue-900 text-center">
          Login here
        </Text>
        <Text className="text-sm font-semibold text-gray-700 text-center mt-2 mb-6">
          Welcome back you've been missed!
        </Text>

        <View className="flex-row bg-gray-100 p-1 rounded-xl mb-6">
          <TouchableOpacity
            onPress={() => setUseOtp(false)}
            className={`flex-1 py-2.5 rounded-lg items-center ${!useOtp ? "bg-white shadow-sm" : ""}`}
          >
            <Text className={`text-xs font-bold ${!useOtp ? "text-blue-600" : "text-gray-500"}`}>
              Password Login
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setUseOtp(true)}
            className={`flex-1 py-2.5 rounded-lg items-center ${useOtp ? "bg-white shadow-sm" : ""}`}
          >
            <Text className={`text-xs font-bold ${useOtp ? "text-blue-600" : "text-gray-500"}`}>
              WhatsApp / OTP Code
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mb-4">
          <Text className="text-xs font-bold text-gray-600 mb-1">
            {useOtp ? "Phone or WhatsApp Number" : "Email or Phone Number"}
          </Text>
          <TextInput
            className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-gray-900"
            placeholder={useOtp ? "9876543210" : "user@business.com or 9876543210"}
            placeholderTextColor="#9CA3AF"
            value={identifier}
            onChangeText={setIdentifier}
            keyboardType={useOtp ? "phone-pad" : "email-address"}
            autoCapitalize="none"
          />
        </View>

        {!useOtp ? (
          <View className="mb-6">
            <Text className="text-xs font-bold text-gray-600 mb-1">Password</Text>
            <TextInput
              className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              placeholder="Enter password"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
        ) : (
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-xs font-bold text-gray-600">Verification Code</Text>
              <TouchableOpacity onPress={handleSendOtp}>
                <Text className="text-xs font-bold text-blue-600">
                  {otpSent ? "Resend Code" : "Get Code"}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-gray-900 tracking-widest text-center font-bold"
              placeholder="6-digit code"
              placeholderTextColor="#9CA3AF"
              value={otpCode}
              onChangeText={setOtpCode}
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>
        )}

        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
          className="w-full bg-blue-600 py-4 rounded-xl items-center shadow-md shadow-blue-500/30"
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-white font-bold text-base">Sign in</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onNavigate("register")}
          className="items-center mt-6"
        >
          <Text className="text-xs font-semibold text-gray-600">
            Create new account
          </Text>
        </TouchableOpacity>
      </View>

      <View className="items-center mt-8">
        <Text className="text-xs text-blue-600 font-bold mb-4">Or continue with</Text>
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
