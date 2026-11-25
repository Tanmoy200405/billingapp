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
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { api, setAuthToken } from "../config/api";
import { useResponsive } from "../utils/responsive";

export default function LoginScreen({ onNavigate, onLoginSuccess }) {
  const { isWide } = useResponsive();
  const [useOtp, setUseOtp] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotId, setForgotId] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState("");

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
    setErrorMessage("");
    const rawInput = (overrideTarget || identifier || "").trim();
    const isEmail = rawInput.includes("@");
    const target = isEmail ? rawInput : cleanPhoneNumber(rawInput);
    if (!target) {
      setErrorMessage("Please enter your 10-digit mobile number or email.");
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
      setErrorMessage(res.message || "Failed to send verification code. Please check your connection.");
    }
  };

  const handleLogin = async () => {
    setErrorMessage("");
    if (!identifier.trim()) {
      setErrorMessage("Please enter your phone number or email address.");
      return;
    }

    if (!useOtp && !password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    if (useOtp && !otpCode.trim()) {
      if (!otpSent) {
        handleSendOtp();
        return;
      }
      setErrorMessage("Please enter the 6-digit OTP code received on WhatsApp or Email.");
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
      setErrorMessage(res.message || "Invalid credentials. Please verify and try again.");
    }
  };

  const handleWhatsAppShortcut = () => {
    setErrorMessage("");
    setUseOtp(true);
    const clean = cleanPhoneNumber(identifier);
    if (clean && clean.length === 10) {
      handleSendOtp(clean);
    } else {
      setErrorMessage("Please enter your 10-digit WhatsApp number to receive your OTP.");
    }
  };

  const openForgotModal = () => {
    setForgotId(identifier.trim());
    setForgotStep(1);
    setForgotOtp("");
    setForgotNewPassword("");
    setForgotConfirmPassword("");
    setForgotMessage("");
    setForgotError("");
    setShowForgotModal(true);
  };

  const handleForgotSendOtp = async () => {
    setForgotError("");
    const raw = forgotId.trim();
    if (!raw) {
      setForgotError("Enter your registered 10-digit mobile number or email.");
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
      setForgotError(res.message || "Could not send password reset OTP. Please check your connection.");
    }
  };

  const handleForgotReset = async () => {
    setForgotError("");
    const raw = forgotId.trim();
    const target = raw.includes("@") ? raw.toLowerCase() : cleanPhoneNumber(raw);
    if (!forgotOtp.trim() || forgotOtp.trim().length < 6) {
      setForgotError("Enter the 6-digit reset OTP.");
      return;
    }
    if (forgotNewPassword.length < 6) {
      setForgotError("New password must be at least 6 characters long.");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError("New password and confirm password do not match.");
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
      setForgotError(res.message || "Invalid or expired OTP code.");
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
          paddingHorizontal: 20,
          paddingTop: isWide ? 32 : 44,
          paddingBottom: 28,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View
          style={{
            width: "100%",
            maxWidth: 440,
            backgroundColor: "#FFFFFF",
            borderRadius: isWide ? 20 : 0,
            padding: isWide ? 32 : 0,
            borderWidth: isWide ? 1 : 0,
            borderColor: "#E2E8F0",
            shadowColor: isWide ? "#0F172A" : "transparent",
            shadowOpacity: isWide ? 0.06 : 0,
            shadowRadius: 20,
            elevation: isWide ? 3 : 0,
          }}
        >
          {/* Header Bar */}
          <View className="flex-row items-center justify-between mb-4">
            <TouchableOpacity
              onPress={() => onNavigate("welcome")}
              className="w-10 h-10 rounded-full bg-slate-100 items-center justify-center active:bg-slate-200"
            >
              <Ionicons name="arrow-back" size={20} color="#334155" />
            </TouchableOpacity>
            <View className="w-10 h-10" />
          </View>

          {/* Logo & Headline */}
          <View className="items-center mb-6">
            <View className="w-16 h-16 rounded-2xl overflow-hidden bg-[#10353B] items-center justify-center shadow-sm mb-3 border border-slate-200">
              <Image
                source={require("../../assets/bistromate_logo.png")}
                style={{ width: 56, height: 56 }}
                resizeMode="contain"
              />
            </View>
            <Text className="text-2xl font-black text-slate-900 text-center tracking-tight">
              Bistromate
            </Text>
            <Text className="text-xs font-medium text-slate-500 text-center mt-1">
              Sign in to your restaurant & billing workspace
            </Text>
          </View>

          {/* Inline Error Banner */}
          {errorMessage ? (
            <View className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex-row items-start">
              <Ionicons name="alert-circle" size={18} color="#DC2626" style={{ marginTop: 1, marginRight: 8 }} />
              <Text className="flex-1 text-xs text-red-700 font-medium leading-4">{errorMessage}</Text>
              <TouchableOpacity onPress={() => setErrorMessage("")} className="ml-2 p-0.5">
                <Ionicons name="close" size={16} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Tab Selection */}
          <View className="flex-row bg-slate-100 p-1 rounded-xl mb-5">
            <TouchableOpacity
              onPress={() => {
                setUseOtp(false);
                setErrorMessage("");
              }}
              activeOpacity={0.7}
              className={`flex-1 py-2.5 rounded-lg items-center ${!useOtp ? "bg-white shadow-xs" : ""}`}
            >
              <Text className={`text-xs font-bold ${!useOtp ? "text-blue-600" : "text-slate-500"}`}>
                Password Login
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setUseOtp(true);
                setErrorMessage("");
              }}
              activeOpacity={0.7}
              className={`flex-1 py-2.5 rounded-lg items-center ${useOtp ? "bg-white shadow-xs" : ""}`}
            >
              <Text className={`text-xs font-bold ${useOtp ? "text-blue-600" : "text-slate-500"}`}>
                WhatsApp / OTP Code
              </Text>
            </TouchableOpacity>
          </View>

          {/* Identifier Input */}
          <View className="mb-3.5">
            <Text className="text-xs font-bold text-slate-700 mb-1.5">
              {useOtp ? "WhatsApp / Phone or Email" : "Email or Phone Number"}
            </Text>
            <TextInput
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900"
              placeholder="user@business.com or 9876543210"
              placeholderTextColor="#94A3B8"
              value={identifier}
              onChangeText={(text) => {
                setIdentifier(text);
                if (errorMessage) setErrorMessage("");
              }}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Password or OTP Inputs */}
          {!useOtp ? (
            <View className="mb-5">
              <View className="flex-row justify-between items-center mb-1.5">
                <Text className="text-xs font-bold text-slate-700">Password</Text>
                <TouchableOpacity onPress={openForgotModal}>
                  <Text className="text-xs font-bold text-blue-600">Forgot Password?</Text>
                </TouchableOpacity>
              </View>
              <View className="flex-row items-center w-full bg-slate-50 border border-slate-200 rounded-xl px-4">
                <TextInput
                  className="flex-1 py-3 text-sm text-slate-900"
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errorMessage) setErrorMessage("");
                  }}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  className="p-1.5 ml-1"
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View className="mb-5">
              {!identifier.includes("@") ? (
                <View className="mb-3">
                  <Text className="text-xs font-bold text-slate-700 mb-1.5">
                    Email for OTP (Optional fallback)
                  </Text>
                  <TextInput
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900"
                    placeholder="your@email.com"
                    placeholderTextColor="#94A3B8"
                    value={otpEmail}
                    onChangeText={setOtpEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              ) : null}
              <View className="flex-row justify-between items-center mb-1.5">
                <Text className="text-xs font-bold text-slate-700">Verification Code</Text>
                <TouchableOpacity onPress={() => handleSendOtp()}>
                  <Text className="text-xs font-bold text-blue-600">
                    {otpSent ? "Resend Code" : "Get Code"}
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 tracking-widest text-center font-bold"
                placeholder="6-digit code"
                placeholderTextColor="#94A3B8"
                value={otpCode}
                onChangeText={(text) => {
                  setOtpCode(text);
                  if (errorMessage) setErrorMessage("");
                }}
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>
          )}

          {/* Submit Sign In Button */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
            className="w-full bg-blue-600 py-3.5 rounded-xl items-center shadow-sm shadow-blue-500/20 active:bg-blue-700"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="text-white font-bold text-sm">Sign in</Text>
            )}
          </TouchableOpacity>

          {/* Register Link */}
          <TouchableOpacity
            onPress={() => onNavigate("register")}
            className="items-center mt-5"
          >
            <Text className="text-xs font-semibold text-slate-600">
              Don't have an account? <Text className="text-blue-600 font-bold">Create account</Text>
            </Text>
          </TouchableOpacity>

          {/* Quick WhatsApp Shortcut */}
          <View className="items-center mt-6">
            <TouchableOpacity
              onPress={handleWhatsAppShortcut}
              activeOpacity={0.8}
              className="flex-row items-center bg-emerald-50 border border-emerald-300 px-5 py-2.5 rounded-xl shadow-xs"
            >
              <MaterialIcons name="whatsapp" size={18} color="#059669" />
              <Text className="text-emerald-800 font-bold text-xs ml-2">
                Quick Login with WhatsApp OTP
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Forgot Password Modal */}
      <Modal visible={showForgotModal} transparent animationType="fade" onRequestClose={() => setShowForgotModal(false)}>
        <View className="flex-1 bg-black/50 justify-center items-center px-5">
          <View style={{ width: "100%", maxWidth: 420 }} className="bg-white rounded-2xl p-6 shadow-xl">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-row items-center">
                <View className="w-9 h-9 rounded-full bg-blue-50 items-center justify-center mr-2.5">
                  <Ionicons name="key-outline" size={18} color="#2563EB" />
                </View>
                <Text className="text-lg font-extrabold text-slate-900">Reset Password</Text>
              </View>
              <TouchableOpacity onPress={() => setShowForgotModal(false)} className="p-1">
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {forgotError ? (
              <View className="mb-3 bg-red-50 border border-red-200 rounded-lg p-2.5 flex-row items-center">
                <Ionicons name="alert-circle" size={16} color="#DC2626" style={{ marginRight: 6 }} />
                <Text className="flex-1 text-xs text-red-700 font-medium">{forgotError}</Text>
              </View>
            ) : (
              <Text className="text-xs text-slate-500 mb-4">
                {forgotStep === 1
                  ? "Enter your registered mobile number or email. We will send a 6-digit OTP to your verified WhatsApp & Email."
                  : forgotMessage}
              </Text>
            )}

            <Text className="text-xs font-bold text-slate-700 mb-1">Registered Phone or Email</Text>
            <TextInput
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 mb-3"
              placeholder="10-digit mobile or store@email.com"
              placeholderTextColor="#94A3B8"
              value={forgotId}
              onChangeText={(text) => {
                setForgotId(text);
                if (forgotError) setForgotError("");
              }}
              editable={forgotStep === 1}
              autoCapitalize="none"
            />

            {forgotStep === 2 ? (
              <>
                <Text className="text-xs font-bold text-slate-700 mb-1">6-Digit Reset OTP</Text>
                <TextInput
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-center font-bold tracking-widest text-slate-900 mb-3"
                  placeholder="Enter 6-digit OTP"
                  placeholderTextColor="#94A3B8"
                  value={forgotOtp}
                  onChangeText={(text) => {
                    setForgotOtp(text);
                    if (forgotError) setForgotError("");
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                />

                <Text className="text-xs font-bold text-slate-700 mb-1">New Password (min 6 chars)</Text>
                <TextInput
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 mb-3"
                  placeholder="Enter new password"
                  placeholderTextColor="#94A3B8"
                  value={forgotNewPassword}
                  onChangeText={setForgotNewPassword}
                  secureTextEntry
                />

                <Text className="text-xs font-bold text-slate-700 mb-1">Confirm New Password</Text>
                <TextInput
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 mb-4"
                  placeholder="Re-enter new password"
                  placeholderTextColor="#94A3B8"
                  value={forgotConfirmPassword}
                  onChangeText={setForgotConfirmPassword}
                  secureTextEntry
                />

                <TouchableOpacity
                  onPress={handleForgotReset}
                  disabled={forgotLoading}
                  className="w-full bg-blue-600 py-3 rounded-xl items-center mb-2"
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
                className="w-full bg-blue-600 py-3 rounded-xl items-center mt-1"
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
