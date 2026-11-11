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
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, setAuthToken } from "../config/api";
import { useResponsive } from "../utils/responsive";

export default function RegisterScreen({ onNavigate, onRegisterSuccess }) {
  const { isWide } = useResponsive();
  const [businessName, setBusinessName] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [gstin, setGstin] = useState("");
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
    if (!businessName.trim() || !name.trim() || !phone.trim() || !password) {
      showNotice("Required Fields", "Please fill in Business Name, Owner Name, Phone, and Password");
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, "").slice(-10);
    if (cleanPhone.length !== 10) {
      showNotice("Invalid Phone", "Please enter a valid 10-digit WhatsApp / mobile number");
      return;
    }

    if (password !== confirmPassword) {
      showNotice("Mismatch", "Password and Confirm Password do not match");
      return;
    }

    setLoading(true);
    const res = await api.auth.sendOtp(cleanPhone, "whatsapp", email.trim(), "register");
    setLoading(false);

    if (res?.success) {
      setOtpStep(true);
      setOtpInfoMsg(res.message || "Enter the 6-digit verification code.");
      if (!res.sentViaWhatsApp && !res.sentViaSms && !res.sentViaEmail && res.code) {
        setOtpCode(String(res.code));
      }
      showNotice(
        "Verification Code Sent",
        res.message || "OTP sent to your WhatsApp & Email."
      );
    } else {
      showNotice("Notice", res?.message || "Could not start registration verification");
    }
  };

  const handleRegister = async () => {
    if (!otpCode.trim()) {
      showNotice("OTP Required", "Please enter the 6-digit verification code");
      return;
    }

    setLoading(true);
    const res = await api.auth.register({
      businessName: businessName.trim(),
      name: name.trim(),
      phone: phone.trim(),
      whatsappNumber: phone.trim(),
      email: email.trim() ? email.trim().toLowerCase() : undefined,
      password,
      otpCode: otpCode.trim(),
      gstin: gstin.trim() || undefined,
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
          <TouchableOpacity
            onPress={() => (otpStep ? setOtpStep(false) : onNavigate("welcome"))}
            className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center mb-4"
          >
            <Ionicons name="arrow-back" size={20} color="#374151" />
          </TouchableOpacity>

          <Text className="text-3xl font-extrabold text-blue-900 text-center">
            {otpStep ? "Verify Account" : "Create Account"}
          </Text>
          <Text className="text-xs text-gray-500 text-center mt-1 mb-6 px-4">
            {otpStep
              ? otpInfoMsg || "Enter the 6-digit code sent to your WhatsApp & Email."
              : "Create your store account to manage billing, inventory, and regular customers."}
          </Text>

          {!otpStep ? (
            <>
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
                <Text className="text-xs font-bold text-gray-600 mb-1">Email Address (for OTP & Login Alerts)</Text>
                <TextInput
                  className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-gray-900"
                  placeholder="store@business.com"
                  placeholderTextColor="#9CA3AF"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
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
                onPress={handleRequestRegisterOtp}
                disabled={loading}
                activeOpacity={0.8}
                className="w-full bg-blue-600 py-4 rounded-xl items-center shadow-md shadow-blue-500/30"
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-bold text-base">Verify & Continue</Text>
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
                <Text className="text-xs font-semibold text-blue-600">Edit phone or email</Text>
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
              Each store can link its own WhatsApp in Settings; OTPs come from official BillingApp support.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
