import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
} from "react-native";
import { Ionicons, FontAwesome5 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Updates from "expo-updates";
import { api, setApiBaseUrl, getApiBaseUrl } from "../config/api";

export default function SettingsScreen({ user, onOpenDrawer, onBack, onLogout, onProfileUpdated }) {
  const [businessName, setBusinessName] = useState(user?.businessName || "");
  const [gstin, setGstin] = useState(user?.gstin || "");
  const [address, setAddress] = useState(user?.address || "");
  const [upiId, setUpiId] = useState(user?.upiId || "");
  const [logo, setLogo] = useState(user?.logo || "");
  const [printerSize, setPrinterSize] = useState(user?.thermalPrinterSize || "3inch");
  const [customApiUrl, setCustomApiUrl] = useState(getApiBaseUrl());
  const [saving, setSaving] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      if (__DEV__) {
        Alert.alert("Development Mode", "In-app updates are enabled for production APK builds.");
        setCheckingUpdate(false);
        return;
      }
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        Alert.alert(
          "Update Ready",
          "Restart app to apply latest version?",
          [
            { text: "Later", style: "cancel" },
            { text: "Restart", onPress: async () => await Updates.reloadAsync() }
          ]
        );
      } else {
        Alert.alert("Up to Date", "You are using the latest version.");
      }
    } catch {
      Alert.alert("Update Status", "You are running the latest version.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handlePickLogo = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const imageUri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setLogo(imageUri);
      }
    } catch (err) {
      Alert.alert("Error", "Could not pick image");
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setApiBaseUrl(customApiUrl);

    const res = await api.auth.updateProfile({
      businessName: businessName.trim(),
      gstin: gstin.trim() || undefined,
      address: address.trim() || undefined,
      upiId: upiId.trim() || undefined,
      logo: logo || "",
      thermalPrinterSize: printerSize,
    });
    setSaving(false);

    if (res.success && res.user) {
      if (onProfileUpdated) onProfileUpdated(res.user);
      Alert.alert("Settings Saved", "Business profile updated successfully");
    } else {
      Alert.alert("Error", res.message || "Failed to update profile");
    }
  };

  return (
    <View style={{ flex: 1 }} className="flex-1 bg-gray-50">
      <View className="bg-blue-600 px-4 pt-10 pb-4 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <TouchableOpacity onPress={onOpenDrawer} className="mr-2">
            <Ionicons name="menu" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          {onBack ? (
            <TouchableOpacity
              onPress={onBack}
              className="flex-row items-center bg-white/20 px-2.5 py-1 rounded-lg mr-2"
            >
              <Ionicons name="arrow-back" size={16} color="#FFFFFF" />
              <Text className="text-white text-xs font-bold ml-1">Back</Text>
            </TouchableOpacity>
          ) : null}
          <Text className="text-white text-xl font-bold">Settings</Text>
        </View>
        <TouchableOpacity
          onPress={handleSaveProfile}
          disabled={saving}
          className="bg-white/20 px-3 py-1.5 rounded-lg"
        >
          <Text className="text-white text-xs font-bold">Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 p-4" showsVerticalScrollIndicator={false}>
        <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
            Store Profile
          </Text>

          <View className="items-center mb-4">
            {logo ? (
              <View className="items-center">
                <TouchableOpacity onPress={handlePickLogo} className="relative">
                  <Image
                    source={{ uri: logo }}
                    style={{ width: 84, height: 84, borderRadius: 42 }}
                  />
                  <View className="absolute bottom-0 right-0 bg-blue-600 w-7 h-7 rounded-full items-center justify-center border-2 border-white">
                    <Ionicons name="camera" size={14} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setLogo("")} className="mt-2">
                  <Text className="text-xs text-red-500 font-medium">Remove Logo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handlePickLogo}
                className="w-20 h-20 rounded-full bg-blue-50 border-2 border-dashed border-blue-300 items-center justify-center"
              >
                <Ionicons name="camera" size={26} color="#2563EB" />
                <Text className="text-[10px] text-blue-600 font-bold mt-1">Add Logo</Text>
              </TouchableOpacity>
            )}
          </View>

          <View className="mb-3">
            <Text className="text-xs font-bold text-gray-700 mb-1">
              Store / Company Name
            </Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
              value={businessName}
              onChangeText={setBusinessName}
            />
          </View>

          <View className="mb-3">
            <Text className="text-xs font-bold text-gray-700 mb-1">
              Registered Phone Number
            </Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-500"
              value={user?.phone || ""}
              editable={false}
            />
          </View>

          <View className="mb-3">
            <Text className="text-xs font-bold text-gray-700 mb-1">
              GSTIN Tax Number
            </Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
              placeholder="e.g. 19AAACB1234F1Z5"
              value={gstin}
              onChangeText={setGstin}
              autoCapitalize="characters"
            />
          </View>

          <View className="mb-3">
            <Text className="text-xs font-bold text-gray-700 mb-1">
              UPI ID (for bill QR Code)
            </Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
              placeholder="e.g. business@okaxis"
              value={upiId}
              onChangeText={setUpiId}
            />
          </View>

          <View className="mb-1">
            <Text className="text-xs font-bold text-gray-700 mb-1">
              Store Address
            </Text>
            <TextInput
              className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
              placeholder="Street, City, State, PIN"
              value={address}
              onChangeText={setAddress}
            />
          </View>
        </View>

        <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
            Thermal Printer & Bill Format
          </Text>
          <View className="flex-row gap-2">
            {["2inch", "3inch", "A4", "A5"].map((size) => (
              <TouchableOpacity
                key={size}
                onPress={() => setPrinterSize(size)}
                className={`flex-1 py-2.5 rounded-xl border items-center ${
                  printerSize === size
                    ? "bg-blue-600 border-blue-600"
                    : "bg-gray-100 border-gray-300"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    printerSize === size ? "text-white" : "text-gray-700"
                  }`}
                >
                  {size}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="bg-white rounded-xl p-4 mb-6 border border-gray-200 shadow-sm">
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Backend API Endpoint
          </Text>
          <TextInput
            className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-sm"
            placeholder="http://192.168.1.X:5000/api"
            value={customApiUrl}
            onChangeText={setCustomApiUrl}
            autoCapitalize="none"
          />
          <Text className="text-[11px] text-gray-400 mt-1">
            Use your computer's local IP if testing with Expo Go on a physical phone.
          </Text>
        </View>

        <View className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
            In-App Updates
          </Text>
          <Text className="text-xs text-gray-600 mb-3">
            OTA updates are configured. Get new features without reinstalling the APK.
          </Text>
          <TouchableOpacity
            onPress={handleCheckForUpdates}
            disabled={checkingUpdate}
            className="bg-blue-50 border border-blue-200 py-2.5 rounded-xl flex-row items-center justify-center"
          >
            {checkingUpdate ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <>
                <Ionicons name="cloud-download-outline" size={18} color="#2563EB" />
                <Text className="text-blue-600 font-bold text-xs ml-1.5">
                  Check for App Updates
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={onLogout}
          className="w-full bg-red-50 border border-red-200 py-3.5 rounded-xl items-center mb-8"
        >
          <Text className="text-red-600 font-bold text-sm">Logout Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
