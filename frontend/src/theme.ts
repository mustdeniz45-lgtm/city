import { Platform } from "react-native";

export const colors = {
  surface: "#F9F8F6",
  onSurface: "#1A1816",
  surfaceSecondary: "#FFFFFF",
  surfaceTertiary: "#F0EFEB",
  onSurfaceTertiary: "#302D29",
  surfaceInverse: "#1C1A17",
  onSurfaceInverse: "#F9F8F6",

  brand: "#C85A40",       // terracotta
  brandSecondary: "#D9953A", // ochre
  brandTertiary: "#6B705C",  // olive

  success: "#4D7C5F",
  warning: "#D9953A",
  error: "#B33939",

  border: "#E5E2DC",
  borderStrong: "#CFCAC2",

  muted: "#6E6A63",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const fonts = {
  display: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }) as string,
  body: Platform.select({ ios: "System", android: "sans-serif", default: "System" }) as string,
};

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  pill: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
};

export const difficultyColor = (d: string) => {
  if (d === "easy") return colors.success;
  if (d === "medium") return colors.brandSecondary;
  return colors.brand;
};
