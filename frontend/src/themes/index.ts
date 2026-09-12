export const themes = {
  light: {
    background: "#ffffff",
    foreground: "#0f172a",
    primary: "#6366f1",
    secondary: "#f1f5f9",
  },
  dark: {
    background: "#030712",
    foreground: "#f8fafc",
    primary: "#818cf8",
    secondary: "#1e293b",
  },
} as const;

export type ThemeName = keyof typeof themes;
