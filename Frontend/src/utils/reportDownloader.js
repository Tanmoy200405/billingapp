import { Platform, Linking, Alert } from "react-native";
import { getAuthToken } from "../config/api";

/**
 * Downloads and opens/shares a report file (PDF or CSV).
 * Works on Web, Android, and iOS.
 */
export async function downloadReportFile(url, fileName = "Report.pdf", mimeType = "application/pdf") {
  const token = getAuthToken();

  if (Platform.OS === "web") {
    try {
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error(`Failed to download report (HTTP ${response.status})`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      return { success: true };
    } catch (err) {
      console.warn("Web report download error, trying direct link:", err.message);
      Linking.openURL(url);
      return { success: true };
    }
  }

  // Native (Android / iOS)
  try {
    const FileSystem = await import("expo-file-system");
    const Sharing = await import("expo-sharing");

    const targetUri = `${FileSystem.documentDirectory}${fileName}`;
    console.log(`[Reports] Downloading ${fileName} from ${url}...`);

    const downloadResult = await FileSystem.downloadAsync(url, targetUri, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (downloadResult.status !== 200) {
      throw new Error(`Server returned HTTP ${downloadResult.status}`);
    }

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(downloadResult.uri, {
        mimeType,
        dialogTitle: `Download / Share ${fileName}`,
        UTI: mimeType === "application/pdf" ? "com.adobe.pdf" : "public.comma-separated-values-text",
      });
    } else {
      Alert.alert("Downloaded", `Report saved to: ${downloadResult.uri}`);
    }

    return { success: true, uri: downloadResult.uri };
  } catch (err) {
    console.error("Native report download error:", err.message);
    // Fallback: try opening the URL directly
    try {
      await Linking.openURL(url);
      return { success: true };
    } catch (linkErr) {
      return { success: false, error: err.message };
    }
  }
}
