import React from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function UpdateModal({
  visible,
  updateInfo,
  onApplyOta,
  onDownloadApk,
  onDismiss,
}) {
  if (!visible || !updateInfo) return null;

  const isOta = updateInfo.type === "ota";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View className="flex-1 bg-black/60 items-center justify-center p-6">
        <View className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl items-center border border-gray-100">
          {/* Icon Header */}
          <View
            className={`w-16 h-16 rounded-2xl items-center justify-center mb-4 ${
              isOta ? "bg-blue-100" : "bg-emerald-100"
            }`}
          >
            <Ionicons
              name={isOta ? "cloud-done" : "arrow-down-circle"}
              size={36}
              color={isOta ? "#2563EB" : "#059669"}
            />
          </View>

          {/* Title */}
          <Text className="text-xl font-extrabold text-gray-900 text-center">
            {isOta
              ? "Update Ready to Apply"
              : `New Version ${updateInfo.version || ""} Available`}
          </Text>

          {/* Description */}
          <Text className="text-gray-600 text-xs text-center mt-2 leading-5">
            {updateInfo.notes ||
              (isOta
                ? "A new update has been downloaded in the background. Restart the app now to enjoy latest features!"
                : "A new version of the APK is available with latest bug fixes and improvements.")}
          </Text>

          {/* Version badge if APK */}
          {!isOta && updateInfo.version && (
            <View className="bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full mt-3">
              <Text className="text-emerald-700 text-xs font-bold">
                Version {updateInfo.version}
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View className="w-full mt-6 space-y-2">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (isOta) {
                  onApplyOta?.();
                } else {
                  onDownloadApk?.(updateInfo.apkUrl);
                }
              }}
              className={`w-full py-3.5 rounded-xl items-center shadow-md ${
                isOta ? "bg-blue-600" : "bg-emerald-600"
              }`}
            >
              <Text className="text-white font-extrabold text-sm tracking-wide">
                {isOta ? "Restart & Apply Now" : "Download & Install Update"}
              </Text>
            </TouchableOpacity>

            {!updateInfo.forceUpdate && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={onDismiss}
                className="w-full py-2.5 rounded-xl items-center mt-2"
              >
                <Text className="text-gray-500 font-bold text-xs">
                  Remind Me Later
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
