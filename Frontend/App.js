import React, { useState, useEffect } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { View, Text, TouchableOpacity, ActivityIndicator, BackHandler, Alert } from "react-native";
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
import MarketingScreen from "./src/screens/MarketingScreen";
import SideDrawerModal from "./src/screens/SideDrawerModal";
import {
  checkForAppUpdates,
  applyOtaUpdate,
  openApkDownload,
  markUpdateSeen,
} from "./src/services/updateService";
import UpdateModal from "./src/components/UpdateModal";
import Toast from "react-native-toast-message";
export default function App() {
  const [currentScreen, setCurrentScreen] = useState("loading");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
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
    const checkUpdates = async () => {
      try {
        const update = await checkForAppUpdates(false);
        if (update && update.hasUpdate) {
          setUpdateInfo(update);
          setShowUpdateModal(true);
          if (update.version) {
            markUpdateSeen(update.version);
          }
        }
      } catch {}
    };
    checkUpdates();
  }, []);
  useEffect(() => {
    const backAction = () => {
      // If drawer is open, close it
      if (drawerVisible) {
        setDrawerVisible(false);
        return true;
      }
      // If creating invoice, go back to dashboard
      if (isCreatingInvoice) {
        setIsCreatingInvoice(false);
        setActiveTab("dashboard");
        return true;
      }
      // If on a non-dashboard tab, go back to dashboard
      if (currentScreen === "main" && activeTab !== "dashboard") {
        setActiveTab("dashboard");
        return true;
      }
      // If on login/register screen, go to welcome
      if (currentScreen === "login" || currentScreen === "register") {
        setCurrentScreen("welcome");
        return true;
      }
      // On dashboard (home) — ask to exit
      if (currentScreen === "main" && activeTab === "dashboard") {
        Alert.alert(
          "Exit App",
          "Do you want to exit the billing app?",
          [
            { text: "Cancel", style: "cancel", onPress: () => null },
            { text: "Exit", style: "destructive", onPress: () => BackHandler.exitApp() },
          ]
        );
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => backHandler.remove();
  }, [drawerVisible, isCreatingInvoice, currentScreen, activeTab]);

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
              editingInvoice={editingInvoice}
              onBack={() => {
                setIsCreatingInvoice(false);
                setEditingInvoice(null);
              }}
              onInvoiceSaved={() => {
                setIsCreatingInvoice(false);
                setEditingInvoice(null);
                setActiveTab("dashboard");
              }}
            />
          ) : activeTab === "dashboard" ? (
            <DashboardScreen
              user={user}
              onOpenDrawer={() => setDrawerVisible(true)}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onCreateInvoice={() => {
                setEditingInvoice(null);
                setIsCreatingInvoice(true);
              }}
              onEditInvoice={(inv) => {
                setEditingInvoice(inv);
                setIsCreatingInvoice(true);
              }}
            />
          ) : activeTab === "party" ? (
            <PartyScreen
              user={user}
              onProfileUpdated={(updated) => {
                setUser(updated);
                setAuthToken(getAuthToken(), updated);
              }}
              onOpenDrawer={() => setDrawerVisible(true)}
              onBack={() => setActiveTab("dashboard")}
            />
          ) : activeTab === "inventory" ? (
            <InventoryScreen onOpenDrawer={() => setDrawerVisible(true)} onBack={() => setActiveTab("dashboard")} />
          ) : activeTab === "reports" ? (
            <ReportsScreen onOpenDrawer={() => setDrawerVisible(true)} onBack={() => setActiveTab("dashboard")} />
          ) : activeTab === "marketing" ? (
            <MarketingScreen
              user={user}
              onOpenDrawer={() => setDrawerVisible(true)}
              onBack={() => setActiveTab("dashboard")}
            />
          ) : (
            <SettingsScreen
              user={user}
              initialTab="profile"
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
                onPress={() => setActiveTab("reports")}
                className="items-center py-1 flex-1"
              >
                <Ionicons
                  name={activeTab === "reports" ? "bar-chart" : "bar-chart-outline"}
                  size={22}
                  color={activeTab === "reports" ? "#2563EB" : "#6B7280"}
                />
                <Text
                  className={`text-[10px] font-bold mt-0.5 ${
                    activeTab === "reports" ? "text-blue-600" : "text-gray-500"
                  }`}
                >
                  Reports
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
          if (updateInfo?.version) markUpdateSeen(updateInfo.version);
          openApkDownload(url);
        }}
        onDismiss={() => {
          setShowUpdateModal(false);
          if (updateInfo?.version) markUpdateSeen(updateInfo.version);
        }}
      />
      <Toast />
    </SafeAreaProvider>
  );
}