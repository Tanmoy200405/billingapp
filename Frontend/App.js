import React, { useState, useEffect } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import "./global.css";

import { api, setAuthToken, getStoredSession, getAuthToken, clearAuthToken } from "./src/config/api";
import WelcomeScreen from "./src/screens/WelcomeScreen";
import LoginScreen from "./src/screens/LoginScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import PartyScreen from "./src/screens/PartyScreen";
import InventoryScreen from "./src/screens/InventoryScreen";
import InvoiceScreen from "./src/screens/InvoiceScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import SideDrawerModal from "./src/screens/SideDrawerModal";
import {
  checkForAppUpdates,
  applyOtaUpdate,
  openApkDownload,
} from "./src/services/updateService";
import UpdateModal from "./src/components/UpdateModal";

export default function App() {
  const [currentScreen, setCurrentScreen] = useState("loading");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { token, user: cachedUser } = await getStoredSession();
        if (token) {
          if (cachedUser) {
            setUser(cachedUser);
            setCurrentScreen("main");
          }
          const res = await api.auth.getMe();
          if (res.success && res.user) {
            setUser(res.user);
            setAuthToken(token, res.user);
            setCurrentScreen("main");
            return;
          }
          if (cachedUser) {
            return;
          }
        }
      } catch {}
      setCurrentScreen("welcome");
    };
    initAuth();

    // Silently check for in-app updates on launch
    const checkUpdates = async () => {
      try {
        const update = await checkForAppUpdates(false);
        if (update && update.hasUpdate) {
          setUpdateInfo(update);
          setShowUpdateModal(true);
        }
      } catch {}
    };
    checkUpdates();
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setAuthToken(getAuthToken(), userData);
    setCurrentScreen("main");
    setActiveTab("dashboard");
  };

  const handleLogout = async () => {
    await clearAuthToken();
    setUser(null);
    setCurrentScreen("welcome");
    setIsCreatingInvoice(false);
    setDrawerVisible(false);
  };

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <StatusBar style={currentScreen === "main" ? "light" : "dark"} />

      {currentScreen === "loading" && (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      )}

      {currentScreen === "welcome" && (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
          <WelcomeScreen onNavigate={(screen) => setCurrentScreen(screen)} />
        </SafeAreaView>
      )}

      {currentScreen === "login" && (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
          <LoginScreen
            onNavigate={(screen) => setCurrentScreen(screen)}
            onLoginSuccess={handleLoginSuccess}
          />
        </SafeAreaView>
      )}

      {currentScreen === "register" && (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
          <RegisterScreen
            onNavigate={(screen) => setCurrentScreen(screen)}
            onRegisterSuccess={handleLoginSuccess}
          />
        </SafeAreaView>
      )}

      {currentScreen === "main" && (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#2563EB" }}>
          {isCreatingInvoice ? (
            <InvoiceScreen
              user={user}
              onBack={() => setIsCreatingInvoice(false)}
              onInvoiceSaved={() => {
                setIsCreatingInvoice(false);
                setActiveTab("dashboard");
              }}
            />
          ) : activeTab === "dashboard" ? (
            <DashboardScreen
              user={user}
              onOpenDrawer={() => setDrawerVisible(true)}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onCreateInvoice={() => setIsCreatingInvoice(true)}
            />
          ) : activeTab === "party" ? (
            <PartyScreen onOpenDrawer={() => setDrawerVisible(true)} onBack={() => setActiveTab("dashboard")} />
          ) : activeTab === "inventory" ? (
            <InventoryScreen onOpenDrawer={() => setDrawerVisible(true)} onBack={() => setActiveTab("dashboard")} />
          ) : activeTab === "reports" ? (
            <ReportsScreen onOpenDrawer={() => setDrawerVisible(true)} onBack={() => setActiveTab("dashboard")} />
          ) : (
            <SettingsScreen
              user={user}
              onOpenDrawer={() => setDrawerVisible(true)}
              onBack={() => setActiveTab("dashboard")}
              onLogout={handleLogout}
              onProfileUpdated={(updated) => {
                setUser(updated);
                setAuthToken(getAuthToken(), updated);
              }}
            />
          )}

          {!isCreatingInvoice && (
            <View className="bg-white border-t border-gray-200 flex-row justify-around py-2 shadow-lg">
              <TouchableOpacity
                onPress={() => setActiveTab("dashboard")}
                className="items-center py-1 flex-1"
              >
                <Ionicons
                  name={activeTab === "dashboard" ? "home" : "home-outline"}
                  size={22}
                  color={activeTab === "dashboard" ? "#2563EB" : "#6B7280"}
                />
                <Text
                  className={`text-[10px] font-bold mt-0.5 ${
                    activeTab === "dashboard" ? "text-blue-600" : "text-gray-500"
                  }`}
                >
                  Dashboard
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setIsCreatingInvoice(true)}
                className="items-center py-1 flex-1"
              >
                <View className="w-10 h-10 -mt-5 bg-blue-600 rounded-full items-center justify-center shadow-lg border-2 border-white">
                  <Ionicons name="add" size={24} color="#FFFFFF" />
                </View>
                <Text className="text-[10px] font-bold mt-0.5 text-blue-600">
                  + Bill
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setActiveTab("party")}
                className="items-center py-1 flex-1"
              >
                <Ionicons
                  name={activeTab === "party" ? "people" : "people-outline"}
                  size={22}
                  color={activeTab === "party" ? "#2563EB" : "#6B7280"}
                />
                <Text
                  className={`text-[10px] font-bold mt-0.5 ${
                    activeTab === "party" ? "text-blue-600" : "text-gray-500"
                  }`}
                >
                  Party
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setActiveTab("inventory")}
                className="items-center py-1 flex-1"
              >
                <Ionicons
                  name={activeTab === "inventory" ? "cube" : "cube-outline"}
                  size={22}
                  color={activeTab === "inventory" ? "#2563EB" : "#6B7280"}
                />
                <Text
                  className={`text-[10px] font-bold mt-0.5 ${
                    activeTab === "inventory" ? "text-blue-600" : "text-gray-500"
                  }`}
                >
                  Inventory
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setActiveTab("setting")}
                className="items-center py-1 flex-1"
              >
                <Ionicons
                  name={activeTab === "setting" ? "settings" : "settings-outline"}
                  size={22}
                  color={activeTab === "setting" ? "#2563EB" : "#6B7280"}
                />
                <Text
                  className={`text-[10px] font-bold mt-0.5 ${
                    activeTab === "setting" ? "text-blue-600" : "text-gray-500"
                  }`}
                >
                  Settings
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <SideDrawerModal
            visible={drawerVisible}
            onClose={() => setDrawerVisible(false)}
            user={user}
            onNavigateTab={(tab) => {
              setActiveTab(tab);
              setIsCreatingInvoice(false);
            }}
            onLogout={handleLogout}
          />
        </SafeAreaView>
      )}

      <UpdateModal
        visible={showUpdateModal}
        updateInfo={updateInfo}
        onApplyOta={applyOtaUpdate}
        onDownloadApk={(url) => {
          setShowUpdateModal(false);
          openApkDownload(url);
        }}
        onDismiss={() => setShowUpdateModal(false)}
      />
    </SafeAreaProvider>
  );
}
