import React, { useState, useEffect } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { View, Text, TouchableOpacity, ActivityIndicator, BackHandler, Alert, Image, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import "./global.css";
import { api, setAuthToken, getStoredSession, getAuthToken, clearAuthToken, prefetchCoreData } from "./src/config/api";
import { THEME } from "./src/config/theme";
import { useResponsive } from "./src/utils/responsive";
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

const NAV_TABS = [
  { key: "dashboard", label: "Dashboard", icon: "home", iconOutline: "home-outline" },
  { key: "reports", label: "Reports", icon: "bar-chart", iconOutline: "bar-chart-outline" },
  { key: "party", label: "Party", icon: "people", iconOutline: "people-outline" },
  { key: "inventory", label: "Inventory", icon: "cube", iconOutline: "cube-outline" },
  { key: "marketing", label: "Marketing", icon: "megaphone", iconOutline: "megaphone-outline" },
  { key: "setting", label: "Settings", icon: "settings", iconOutline: "settings-outline" },
];

export default function App() {
  const { isWide, isDesktop } = useResponsive();
  const [currentScreen, setCurrentScreen] = useState("loading");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [visitedTabs, setVisitedTabs] = useState({ dashboard: true });
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [user, setUser] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const navigateTab = (tab) => {
    setActiveTab(tab);
    setIsCreatingInvoice(false);
    setVisitedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { token, user: cachedUser } = await getStoredSession();
        if (token) {
          if (cachedUser) {
            setUser(cachedUser);
            setCurrentScreen("main");
          }
          // Warm core endpoints in parallel right away
          prefetchCoreData().catch(() => {});
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
      if (drawerVisible) {
        setDrawerVisible(false);
        return true;
      }
      if (isCreatingInvoice) {
        setIsCreatingInvoice(false);
        setActiveTab("dashboard");
        return true;
      }
      if (currentScreen === "main" && activeTab !== "dashboard") {
        setActiveTab("dashboard");
        return true;
      }
      if (currentScreen === "login" || currentScreen === "register") {
        setCurrentScreen("welcome");
        return true;
      }
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
    setVisitedTabs({ dashboard: true });
    setActiveTab("dashboard");
    setCurrentScreen("main");
    prefetchCoreData().catch(() => {});
  };

  const handleLogout = async () => {
    await clearAuthToken();
    setUser(null);
    setVisitedTabs({ dashboard: true });
    setCurrentScreen("welcome");
    setIsCreatingInvoice(false);
    setDrawerVisible(false);
  };

  const handleInvoiceSaved = () => {
    setIsCreatingInvoice(false);
    setEditingInvoice(null);
    navigateTab("dashboard");
    prefetchCoreData().catch(() => {});
  };

  const phoneBottomTabs = NAV_TABS.filter((t) => t.key !== "marketing");

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <StatusBar style={currentScreen === "main" ? "light" : "dark"} />
      {currentScreen === "loading" && (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#FFFFFF" }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      )}
      {currentScreen === "welcome" && (
        <SafeAreaView style={{ flex: 1, backgroundColor: isWide ? THEME.surface : THEME.card }}>
          <WelcomeScreen onNavigate={(screen) => setCurrentScreen(screen)} />
        </SafeAreaView>
      )}
      {currentScreen === "login" && (
        <SafeAreaView style={{ flex: 1, backgroundColor: isWide ? THEME.surface : THEME.card }}>
          <LoginScreen
            onNavigate={(screen) => setCurrentScreen(screen)}
            onLoginSuccess={handleLoginSuccess}
          />
        </SafeAreaView>
      )}
      {currentScreen === "register" && (
        <SafeAreaView style={{ flex: 1, backgroundColor: isWide ? THEME.surface : THEME.card }}>
          <RegisterScreen
            onNavigate={(screen) => setCurrentScreen(screen)}
            onRegisterSuccess={handleLoginSuccess}
          />
        </SafeAreaView>
      )}
      {currentScreen === "main" && (
        <SafeAreaView style={{ flex: 1, backgroundColor: THEME.primary }}>
          <View style={{ flex: 1, flexDirection: isWide ? "row" : "column", backgroundColor: THEME.surface }}>
            {/* Persistent Sidebar for Tablet & Web */}
            {isWide && (
              <View
                style={{
                  width: isDesktop ? 244 : 206,
                  backgroundColor: THEME.card,
                  borderRightWidth: 1,
                  borderRightColor: THEME.border,
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1 }}>
                  <View
                    style={{ backgroundColor: THEME.primary }}
                    className="px-4 py-5 flex-row items-center"
                  >
                    {user?.logo ? (
                      <Image
                        source={{ uri: user.logo }}
                        style={{ width: 38, height: 38, borderRadius: 10, marginRight: 10, borderWidth: 1, borderColor: "#FFFFFF" }}
                      />
                    ) : (
                      <View className="w-9 h-9 rounded-xl bg-white/20 items-center justify-center mr-2.5 border border-white/30">
                        <Ionicons name="storefront" size={18} color="#FFFFFF" />
                      </View>
                    )}
                    <View className="flex-1">
                      <Text className="text-white text-sm font-extrabold uppercase tracking-wide" numberOfLines={1}>
                        {user?.businessName || "BillingApp"}
                      </Text>
                      <Text className="text-blue-100 text-[11px]" numberOfLines={1}>
                        {user?.phone || "POS Workspace"}
                      </Text>
                    </View>
                  </View>

                  <View className="px-3 pt-4 pb-2">
                    <TouchableOpacity
                      onPress={() => {
                        setEditingInvoice(null);
                        setIsCreatingInvoice(true);
                      }}
                      activeOpacity={0.85}
                      style={{
                        backgroundColor: isCreatingInvoice ? THEME.success : THEME.primary,
                      }}
                      className="py-3 px-3.5 rounded-xl flex-row items-center justify-center shadow-sm"
                    >
                      <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                      <Text className="text-white font-extrabold text-sm ml-2">New Bill / POS</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView className="flex-1 px-3 pt-2" showsVerticalScrollIndicator={false}>
                    {NAV_TABS.map((item) => {
                      const isActive = !isCreatingInvoice && activeTab === item.key;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          onPress={() => navigateTab(item.key)}
                          style={
                            isActive
                              ? {
                                  backgroundColor: THEME.primaryLight,
                                  borderWidth: 1,
                                  borderColor: THEME.primaryBorder,
                                }
                              : undefined
                          }
                          className="flex-row items-center px-3.5 py-3 rounded-xl mb-1"
                        >
                          <Ionicons
                            name={isActive ? item.icon : item.iconOutline}
                            size={19}
                            color={isActive ? THEME.primary : THEME.textMuted}
                          />
                          <Text
                            style={{ color: isActive ? THEME.primaryDark : THEME.textSecondary }}
                            className="text-sm font-bold ml-3"
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={{ borderTopWidth: 1, borderTopColor: THEME.border }} className="p-3">
                  <TouchableOpacity
                    onPress={handleLogout}
                    className="flex-row items-center px-3.5 py-2.5 rounded-xl bg-red-50/60"
                  >
                    <Ionicons name="log-out-outline" size={19} color={THEME.danger} />
                    <Text style={{ color: THEME.danger }} className="font-bold text-sm ml-3">Logout</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Main Content Workspace */}
            <View style={{ flex: 1 }}>
              {isCreatingInvoice ? (
                <InvoiceScreen
                  user={user}
                  editingInvoice={editingInvoice}
                  onBack={() => {
                    setIsCreatingInvoice(false);
                    setEditingInvoice(null);
                  }}
                  onInvoiceSaved={handleInvoiceSaved}
                />
              ) : (
                <View style={{ flex: 1 }}>
                  {visitedTabs.dashboard && (
                    <View style={{ flex: 1, display: activeTab === "dashboard" ? "flex" : "none" }}>
                      <DashboardScreen
                        user={user}
                        isActive={activeTab === "dashboard" && !isCreatingInvoice}
                        onOpenDrawer={() => setDrawerVisible(true)}
                        onNavigateTab={navigateTab}
                        onCreateInvoice={() => {
                          setEditingInvoice(null);
                          setIsCreatingInvoice(true);
                        }}
                        onEditInvoice={(inv) => {
                          setEditingInvoice(inv);
                          setIsCreatingInvoice(true);
                        }}
                      />
                    </View>
                  )}

                  {visitedTabs.party && (
                    <View style={{ flex: 1, display: activeTab === "party" ? "flex" : "none" }}>
                      <PartyScreen
                        user={user}
                        isActive={activeTab === "party" && !isCreatingInvoice}
                        onProfileUpdated={(updated) => {
                          setUser(updated);
                          setAuthToken(getAuthToken(), updated);
                        }}
                        onOpenDrawer={() => setDrawerVisible(true)}
                        onBack={() => navigateTab("dashboard")}
                      />
                    </View>
                  )}

                  {visitedTabs.inventory && (
                    <View style={{ flex: 1, display: activeTab === "inventory" ? "flex" : "none" }}>
                      <InventoryScreen
                        isActive={activeTab === "inventory" && !isCreatingInvoice}
                        onOpenDrawer={() => setDrawerVisible(true)}
                        onBack={() => navigateTab("dashboard")}
                      />
                    </View>
                  )}

                  {visitedTabs.reports && (
                    <View style={{ flex: 1, display: activeTab === "reports" ? "flex" : "none" }}>
                      <ReportsScreen
                        isActive={activeTab === "reports" && !isCreatingInvoice}
                        onOpenDrawer={() => setDrawerVisible(true)}
                        onBack={() => navigateTab("dashboard")}
                      />
                    </View>
                  )}

                  {visitedTabs.marketing && (
                    <View style={{ flex: 1, display: activeTab === "marketing" ? "flex" : "none" }}>
                      <MarketingScreen
                        user={user}
                        isActive={activeTab === "marketing" && !isCreatingInvoice}
                        onOpenDrawer={() => setDrawerVisible(true)}
                        onBack={() => navigateTab("dashboard")}
                      />
                    </View>
                  )}

                  {visitedTabs.setting && (
                    <View style={{ flex: 1, display: activeTab === "setting" ? "flex" : "none" }}>
                      <SettingsScreen
                        user={user}
                        initialTab="profile"
                        onOpenDrawer={() => setDrawerVisible(true)}
                        onBack={() => navigateTab("dashboard")}
                        onLogout={handleLogout}
                        onProfileUpdated={(updated) => {
                          setUser(updated);
                          setAuthToken(getAuthToken(), updated);
                        }}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Mobile Bottom Tab Bar (Phone Only) */}
              {!isWide && !isCreatingInvoice && (
                <View className="bg-white border-t border-gray-200 flex-row justify-around py-2 shadow-lg">
                  {phoneBottomTabs.map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                      <TouchableOpacity
                        key={tab.key}
                        onPress={() => navigateTab(tab.key)}
                        className="items-center py-1 flex-1"
                      >
                        <Ionicons
                          name={isActive ? tab.icon : tab.iconOutline}
                          size={22}
                          color={isActive ? "#2563EB" : "#6B7280"}
                        />
                        <Text
                          className={`text-[10px] font-bold mt-0.5 ${
                            isActive ? "text-blue-600" : "text-gray-500"
                          }`}
                        >
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </View>

          <SideDrawerModal
            visible={drawerVisible}
            onClose={() => setDrawerVisible(false)}
            user={user}
            onNavigateTab={navigateTab}
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
