import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, setAuthToken } from "../config/api";
import { useResponsive } from "../utils/responsive";

export default function RegisterScreen({ onNavigate, onRegisterSuccess }) {
  const { isWide } = useResponsive();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpInfoMsg, setOtpInfoMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const showNotice = (title, message) => {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleRequestRegisterOtp = async () => {
    const cleanPhone = phone.replace(/[^0-9]/g, "").slice(-10);
    if (cleanPhone.length !== 10) {
      showNotice("Invalid WhatsApp Number", "Please enter a valid 10-digit WhatsApp number");
      return;
    }

    if (!password || password.length < 6) {
      showNotice("Weak Password", "Password must be at least 6 characters long");
      return;
    }

    if (password !== confirmPassword) {
      showNotice("Mismatch", "Password and Confirm Password do not match");
      return;
    }

    setLoading(true);
    const res = await api.auth.sendOtp(cleanPhone, "whatsapp", "", "register");
    setLoading(false);

    if (res?.success) {
      setOtpStep(true);
      setOtpInfoMsg(res.message || "Enter the 6-digit verification code sent to your WhatsApp.");
      if (!res.sentViaWhatsApp && !res.sentViaSms && !res.sentViaEmail && res.code) {
        setOtpCode(String(res.code));
      }
      showNotice(
        "Verification Code Sent",
        res.message || "OTP sent to your WhatsApp number."
      );
    } else {
      showNotice("Notice", res?.message || "Could not start registration verification");
    }
  };

  const handleRegister = async () => {
    if (!otpCode.trim()) {
      showNotice("OTP Required", "Please enter the 6-digit WhatsApp verification code");
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, "").slice(-10);
    setLoading(true);
    const res = await api.auth.register({
      phone: cleanPhone,
      whatsappNumber: cleanPhone,
      password,
      otpCode: otpCode.trim(),
    });
    setLoading(false);

    if (res.success && res.token) {
      setAuthToken(res.token, res.user);
      onRegisterSuccess(res.user);
    } else {
      showNotice("Registration Failed", res.message || "Failed to create account");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: isWide ? "#F8FAFC" : "#FFFFFF" }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: isWide ? "center" : "space-between",
          alignItems: "center",
          paddingHorizontal: 24,
          paddingTop: isWide ? 24 : 48,
          paddingBottom: 32,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View
          style={{
            width: "100%",
            maxWidth: 480,
            backgroundColor: "#FFFFFF",
            borderRadius: isWide ? 24 : 0,
            padding: isWide ? 32 : 0,
            borderWidth: isWide ? 1 : 0,
            borderColor: "#E2E8F0",
            shadowColor: isWide ? "#0F172A" : "transparent",
            shadowOpacity: isWide ? 0.08 : 0,
            shadowRadius: isWide ? 24 : 0,
            elevation: isWide ? 4 : 0,
          }}
        >
          <View className="flex-row items-center justify-between mb-2">
            <TouchableOpacity
              onPress={() => (otpStep ? setOtpStep(false) : onNavigate("welcome"))}
              className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
            >
              <Ionicons name="arrow-back" size={20} color="#374151" />
            </TouchableOpacity>
            <View className="w-10 h-10" />
          </View>

          <View className="items-center mb-4">
            <View className="w-14 h-14 rounded-2xl overflow-hidden bg-[#10353B] items-center justify-center shadow-md mb-2 border border-slate-200">
              <Image
                source={require("../../assets/bistromate_logo.png")}
                style={{ width: 50, height: 50 }}
                resizeMode="contain"
              />
            </View>
            <Text className="text-2xl font-black text-slate-900 text-center tracking-tight">
              {otpStep ? "Verify WhatsApp" : "Create Bistromate Account"}
            </Text>
            <Text className="text-xs text-gray-500 text-center mt-0.5 px-4">
              {otpStep
                ? otpInfoMsg || "Enter the 6-digit code sent to your WhatsApp number."
                : "Setup your restaurant, billing & kitchen workspace in seconds"}
            </Text>
          </View>

          {!otpStep ? (
            <>
              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-600 mb-1">WhatsApp Mobile Number</Text>
                <TextInput
                  className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  placeholder="10-digit WhatsApp number"
                  placeholderTextColor="#9CA3AF"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  maxLength={13}
                />
              </View>

              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-600 mb-1">Password (min 6 characters)</Text>
                <TextInput
                  className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-gray-900"
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
                  className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-gray-900"
                  placeholder="Confirm password"
                  placeholderTextColor="#9CA3AF"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                onPress={handleRequestRegisterOtp}
                disabled={loading}
                activeOpacity={0.8}
                className="w-full bg-blue-600 py-4 rounded-xl items-center shadow-md shadow-blue-500/30"
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-bold text-base">Get WhatsApp OTP</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View className="mb-4">
                <View className="flex-row justify-between items-center mb-1.5">
                  <Text className="text-xs font-bold text-gray-600">6-Digit Verification OTP</Text>
                  <TouchableOpacity onPress={handleRequestRegisterOtp} disabled={loading}>
                    <Text className="text-xs font-bold text-blue-600">Resend OTP</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-3 text-base text-gray-900 tracking-widest text-center font-extrabold"
                  placeholder="000000"
                  placeholderTextColor="#9CA3AF"
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>

              <TouchableOpacity
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.8}
                className="w-full bg-emerald-600 py-4 rounded-xl items-center shadow-md"
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-bold text-base">Confirm OTP & Create Account</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setOtpStep(false)}
                className="items-center mt-4"
              >
                <Text className="text-xs font-semibold text-blue-600">Edit WhatsApp number</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            onPress={() => onNavigate("login")}
            className="items-center mt-5"
          >
            <Text className="text-xs font-semibold text-gray-600">
              Already have an account
            </Text>
          </TouchableOpacity>

          <View className="items-center mt-5 pb-2">
            <Text className="text-[11px] text-gray-400 text-center">
              Each store can link its own WhatsApp in Settings; OTPs come from official Bistromate support.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
