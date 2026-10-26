import { Platform, Linking, Alert } from "react-native";
import * as Updates from "expo-updates";
import { getApiBaseUrl } from "../config/api";

export const CURRENT_APP_VERSION = "1.0.0";
export const GITHUB_RELEASES_URL = "https://github.com/Tanmoy200405/billingapp/releases/latest";

/**
 * Compare two semver strings: returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;
  const p1 = v1.replace(/^v/, "").split(".").map(Number);
  const p2 = v2.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Check for updates across both Expo OTA and remote APK releases.
 * @param {boolean} manual - if user clicked "Check for Updates" manually
 * @returns {Promise<{
 *   hasUpdate: boolean,
 *   type: 'ota' | 'apk' | null,
 *   version?: string,
 *   notes?: string,
 *   apkUrl?: string,
 *   forceUpdate?: boolean
 * }>}
 */
export async function checkForAppUpdates(manual = false) {
  // 1. First, check Expo OTA (Over-The-Air) update
  if (!__DEV__ && Platform.OS !== "web" && Updates.isEnabled) {
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        return {
          hasUpdate: true,
          type: "ota",
          notes: "A new in-app update is downloaded and ready to apply.",
        };
      }
    } catch (e) {
      console.log("[Updates] OTA check error:", e?.message);
    }
  }

  // 2. Check Backend Version endpoint for APK updates
  try {
    const baseUrl = getApiBaseUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${baseUrl}/app-version`, {
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeoutId);

    if (res && res.ok) {
      const data = await res.json();
      if (data && data.latestVersion) {
        const isNewer = compareVersions(data.latestVersion, CURRENT_APP_VERSION) > 0;
        if (isNewer) {
          return {
            hasUpdate: true,
            type: "apk",
            version: data.latestVersion,
            apkUrl: data.apkUrl || GITHUB_RELEASES_URL,
            notes: data.releaseNotes || "Bug fixes, performance boosts, and latest features.",
            forceUpdate: !!data.forceUpdate,
          };
        }
      }
    }
  } catch (err) {
    console.log("[Updates] Version check error:", err?.message);
  }

  return { hasUpdate: false, type: null };
}

/**
 * Apply downloaded OTA update (restarts app)
 */
export async function applyOtaUpdate() {
  try {
    await Updates.reloadAsync();
  } catch (e) {
    Alert.alert("Notice", "Please close and reopen the app to apply changes.");
  }
}

/**
 * Open APK download link in browser/installer
 */
export async function openApkDownload(url) {
  const targetUrl = url || GITHUB_RELEASES_URL;
  try {
    const supported = await Linking.canOpenURL(targetUrl);
    if (supported) {
      await Linking.openURL(targetUrl);
    } else {
      Alert.alert("Download Error", "Cannot open download link: " + targetUrl);
    }
  } catch (e) {
    Alert.alert("Download Error", e?.message || "Failed to open link");
  }
}
