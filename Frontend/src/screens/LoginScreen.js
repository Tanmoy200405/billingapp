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
  Modal,
  Image,
} from "react-native";
import { Ionicons, FontAwesome, MaterialIcons } from "@expo/vector-icons";
import { api, setAuthToken } from "../config/api";
import { useResponsive } from "../utils/responsive";

export default function LoginScreen({ onNavigate, onLoginSuccess }) {
  const { isWide } = useResponsive();
  const [useOtp, setUseOtp] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotId, setForgotId] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");

  const showNotice = (title, message) => {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const cleanPhoneNumber = (val) => {
    const raw = (val || "").toString().replace(/[^0-9]/g, "");
    if (raw.length >= 10) {
      return raw.slice(-10);
    }
    return (val || "").trim();
  };

  const handleSendOtp = async (overrideTarget) => {
    const rawInput = (overrideTarget || identifier || "").trim();
    const isEmail = rawInput.includes("@");
    const target = isEmail ? rawInput : cleanPhoneNumber(rawInput);
    if (!target) {
      showNotice("Input Required", "Please enter your 10-digit mobile number or registered email");
      return;
    }
    setLoading(true);
    const res = await api.auth.sendOtp(target, "whatsapp", otpEmail.trim());
    setLoading(false);

    if (res.success) {
      setOtpSent(true);
      if (!res.sentViaWhatsApp && !res.sentViaSms && !res.sentViaEmail && res.code) {
        setOtpCode(String(res.code));
      }
      showNotice(
        res.sentViaWhatsApp || res.sentViaEmail ? "Verification Code Sent" : "Verification Code",
        res.message || "OTP code has been sent to your WhatsApp & Email"
      );
    } else {
      showNotice("Error", res.message || "Failed to send code");
    }
  };

  const handleLogin = async () => {
    if (!identifier.trim()) {
      showNotice("Input Required", "Please enter phone, WhatsApp or email");
      return;
    }

    if (!useOtp && !password) {
      showNotice("Password Required", "Please enter your password");
      return;
    }

    if (useOtp && !otpCode.trim()) {
      if (!otpSent) {
        handleSendOtp();
        return;
      }
      showNotice("OTP Required", "Please enter the 6-digit code received on WhatsApp or Email");
      return;
    }

    setLoading(true);
    const isEmail = identifier.includes("@");
    const cleanId = isEmail ? identifier.trim() : cleanPhoneNumber(identifier);
    const payload = useOtp
      ? { identifier: cleanId, otpCode: otpCode.trim() }
      : { identifier: identifier.trim(), password };

    const res = await api.auth.login(payload);
    setLoading(false);

    if (res.success && res.token) {
      setAuthToken(res.token, res.user);
      onLoginSuccess(res.user);
    } else {
      showNotice("Login Failed", res.message || "Invalid credentials");
    }
  };

  const handleWhatsAppShortcut = () => {
    setUseOtp(true);
    const clean = cleanPhoneNumber(identifier);
    if (clean && clean.length === 10) {
      handleSendOtp(clean);
    } else {
      showNotice("WhatsApp Login", "Please enter your 10-digit WhatsApp phone number to receive your OTP");
    }
  };

  const openForgotModal = () => {
    setForgotId(identifier.trim());
    setForgotStep(1);
    setForgotOtp("");
    setForgotNewPassword("");
    setForgotConfirmPassword("");
    setForgotMessage("");
    setShowForgotModal(true);
  };

  const handleForgotSendOtp = async () => {
    const raw = forgotId.trim();
    if (!raw) {
      showNotice("Input Required", "Enter your registered 10-digit mobile number or email");
      return;
    }
    const target = raw.includes("@") ? raw.toLowerCase() : cleanPhoneNumber(raw);
    setForgotLoading(true);
    const res = await api.auth.forgotPasswordSendOtp(target);
    setForgotLoading(false);
    if (res.success) {
      setForgotStep(2);
      setForgotMessage(res.message || "Reset OTP sent to your registered WhatsApp & Email");
    } else {
      showNotice("Reset Failed", res.message || "Could not send password reset OTP");
    }
  };

  const handleForgotReset = async () => {
    const raw = forgotId.trim();
    const target = raw.includes("@") ? raw.toLowerCase() : cleanPhoneNumber(raw);
    if (!forgotOtp.trim() || forgotOtp.trim().length < 6) {
      showNotice("OTP Required", "Enter the 6-digit reset OTP");
      return;
    }
    if (forgotNewPassword.length < 6) {
      showNotice("Weak Password", "New password must be at least 6 characters long");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      showNotice("Mismatch", "New password and confirm password do not match");
      return;
    }
    setForgotLoading(true);
    const res = await api.auth.forgotPasswordVerify({
      identifier: target,
      otpCode: forgotOtp.trim(),
      newPassword: forgotNewPassword,
    });
    setForgotLoading(false);
    if (res.success) {
      setShowForgotModal(false);
      if (res.token && res.user) {
        setAuthToken(res.token, res.user);
        showNotice("Password Reset", "Your password has been updated and you are signed in.");
        onLoginSuccess(res.user);
      } else {
        setPassword("");
        showNotice("Password Reset", "Password updated! Please sign in with your new password.");
      }
    } else {
      showNotice("Verification Failed", res.message || "Invalid or expired OTP");
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
          maxWidth: 460,
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
        <View className="flex-row items-center justify-between mb-4">
          <TouchableOpacity
            onPress={() => onNavigate("welcome")}
            className="w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
          >
            <Ionicons name="arrow-back" size={20} color="#374151" />
          </TouchableOpacity>
          <View className="w-10 h-10" />
        </View>

        <View className="items-center mb-6">
          <View className="w-16 h-16 rounded-2xl overflow-hidden bg-[#10353B] items-center justify-center shadow-md mb-2.5 border border-slate-200">
            <Image
              source={require("../../assets/bistromate_logo.png")}
              style={{ width: 60, height: 60 }}
              resizeMode="contain"
            />
          </View>
          <Text className="text-2xl font-black text-slate-900 text-center tracking-tight">
            Bistromate
          </Text>
          <Text className="text-xs font-semibold text-gray-500 text-center mt-0.5">
            Sign in to your restaurant & billing workspace
          </Text>
        </View>

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
            {useOtp ? "WhatsApp / Phone or Email" : "Email or Phone Number"}
          </Text>
          <TextInput
            className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-gray-900"
            placeholder="user@business.com or 9876543210"
            placeholderTextColor="#9CA3AF"
            value={identifier}
            onChangeText={setIdentifier}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {!useOtp ? (
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-xs font-bold text-gray-600">Password</Text>
              <TouchableOpacity onPress={openForgotModal}>
                <Text className="text-xs font-bold text-blue-600">Forgot Password?</Text>
              </TouchableOpacity>
            </View>
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
            {!identifier.includes("@") ? (
              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-600 mb-1">
                  Email for OTP (Optional if already saved)
                </Text>
                <TextInput
                  className="w-full bg-blue-50/50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-gray-900"
                  placeholder="your@email.com"
                  placeholderTextColor="#9CA3AF"
                  value={otpEmail}
                  onChangeText={setOtpEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            ) : null}
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-xs font-bold text-gray-600">Verification Code</Text>
              <TouchableOpacity onPress={() => handleSendOtp()}>
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

        <View className="items-center mt-8">
          <TouchableOpacity
            onPress={handleWhatsAppShortcut}
            activeOpacity={0.8}
            className="flex-row items-center bg-green-50 border border-green-300 px-5 py-3 rounded-xl shadow-xs"
          >
            <MaterialIcons name="whatsapp" size={20} color="#16A34A" />
            <Text className="text-green-800 font-bold text-xs ml-2">
              Quick Login with WhatsApp OTP
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      </ScrollView>

      <Modal visible={showForgotModal} transparent animationType="fade" onRequestClose={() => setShowForgotModal(false)}>
        <View className="flex-1 bg-black/50 justify-center items-center px-5">
          <View style={{ width: "100%", maxWidth: 420 }} className="bg-white rounded-2xl p-6 shadow-xl">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <View className="w-9 h-9 rounded-full bg-blue-50 items-center justify-center mr-2.5">
                  <Ionicons name="key-outline" size={18} color="#2563EB" />
                </View>
                <Text className="text-lg font-extrabold text-gray-900">Reset Password</Text>
              </View>
              <TouchableOpacity onPress={() => setShowForgotModal(false)} className="p-1">
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text className="text-xs text-gray-500 mb-4">
              {forgotStep === 1
                ? "Enter your registered mobile number or email. We will send a 6-digit OTP to your verified WhatsApp & Email."
                : forgotMessage}
            </Text>

            <Text className="text-xs font-bold text-gray-700 mb-1">Registered Phone or Email</Text>
            <TextInput
              className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 mb-3"
              placeholder="10-digit mobile or store@email.com"
              placeholderTextColor="#9CA3AF"
              value={forgotId}
              onChangeText={setForgotId}
              editable={forgotStep === 1}
              autoCapitalize="none"
            />

            {forgotStep === 2 ? (
              <>
                <Text className="text-xs font-bold text-gray-700 mb-1">6-Digit Reset OTP</Text>
                <TextInput
                  className="w-full bg-blue-50/60 border border-blue-200 rounded-xl px-4 py-3 text-sm text-center font-bold tracking-widest text-gray-900 mb-3"
                  placeholder="Enter 6-digit OTP"
                  placeholderTextColor="#9CA3AF"
                  value={forgotOtp}
                  onChangeText={setForgotOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                />

                <Text className="text-xs font-bold text-gray-700 mb-1">New Password (min 6 chars)</Text>
                <TextInput
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 mb-3"
                  placeholder="Enter new password"
                  placeholderTextColor="#9CA3AF"
                  value={forgotNewPassword}
                  onChangeText={setForgotNewPassword}
                  secureTextEntry
                />

                <Text className="text-xs font-bold text-gray-700 mb-1">Confirm New Password</Text>
                <TextInput
                  className="w-full bg-gray-50 border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 mb-4"
                  placeholder="Re-enter new password"
                  placeholderTextColor="#9CA3AF"
                  value={forgotConfirmPassword}
                  onChangeText={setForgotConfirmPassword}
                  secureTextEntry
                />

                <TouchableOpacity
                  onPress={handleForgotReset}
                  disabled={forgotLoading}
                  className="w-full bg-blue-600 py-3.5 rounded-xl items-center mb-2"
                >
                  {forgotLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text className="text-white font-bold text-sm">Verify & Reset Password</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleForgotSendOtp}
                  disabled={forgotLoading}
                  className="items-center py-2"
                >
                  <Text className="text-xs font-bold text-blue-600">Resend Reset OTP</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={handleForgotSendOtp}
                disabled={forgotLoading}
                className="w-full bg-blue-600 py-3.5 rounded-xl items-center mt-1"
              >
                {forgotLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-bold text-sm">Send Reset OTP</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
