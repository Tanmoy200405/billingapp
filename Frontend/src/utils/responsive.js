import React from "react";
import { View, Platform, useWindowDimensions } from "react-native";

/**
 * Responsive breakpoint hook for Phone (<768), Tablet (768-1023), and Desktop/Web (>=1024).
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isPhone = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;
  const isWide = width >= 768;
  const isWeb = Platform.OS === "web";

  const gridColumns = width >= 1200 ? 3 : width >= 768 ? 2 : 1;
  const posColumns = width >= 1150 ? 3 : width >= 768 ? 2 : 1;
  const headerTopPadding = isWeb ? 16 : 40;

  return {
    width,
    height,
    isPhone,
    isTablet,
    isDesktop,
    isWide,
    isWeb,
    gridColumns,
    posColumns,
    headerTopPadding,
  };
}

/**
 * Centers page content with a responsive max width on Tablet/Web while staying full-bleed on Phone.
 */
export function ResponsiveContainer({ children, maxWidth = 1200, style }) {
  return (
    <View
      style={[
        {
          width: "100%",
          maxWidth,
          alignSelf: "center",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

