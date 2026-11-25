import React from "react";
import { View, Text, TouchableOpacity, ScrollView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[Global ErrorBoundary Caught]", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onRestart) {
      this.props.onRestart();
    } else if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: "#0F172A",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: "#1E293B",
              borderRadius: 20,
              padding: 24,
              borderWidth: 1,
              borderColor: "#334155",
              shadowColor: "#000",
              shadowOpacity: 0.3,
              shadowRadius: 16,
              elevation: 8,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: "rgba(239, 68, 68, 0.15)",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
                alignSelf: "center",
              }}
            >
              <Ionicons name="warning-outline" size={30} color="#EF4444" />
            </View>

            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: "#F8FAFC",
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              Something went wrong
            </Text>

            <Text
              style={{
                fontSize: 13,
                color: "#94A3B8",
                textAlign: "center",
                lineHeight: 20,
                marginBottom: 20,
              }}
            >
              The app encountered an unexpected error, but your data is safe. Tap below to reload safely.
            </Text>

            {this.state.error && (
              <ScrollView
                style={{
                  maxHeight: 90,
                  backgroundColor: "#0F172A",
                  borderRadius: 10,
                  padding: 10,
                  marginBottom: 20,
                  borderWidth: 1,
                  borderColor: "#334155",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: "#F87171",
                    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
                  }}
                  numberOfLines={4}
                >
                  {String(this.state.error?.message || this.state.error)}
                </Text>
              </ScrollView>
            )}

            <TouchableOpacity
              onPress={this.handleRestart}
              activeOpacity={0.8}
              style={{
                backgroundColor: "#2563EB",
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
              }}
            >
              <Ionicons name="refresh" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 14 }}>
                Reload Application
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}
