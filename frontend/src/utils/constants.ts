export const APP_NAME = import.meta.env.VITE_APP_NAME || "AI Resume Analyzer";

/** Base URL for `/api/...` routes. Accepts `https://host` or `https://host/api` from env. */
function normalizeApiBaseUrl(raw: string | undefined): string {
  const fallback = "http://localhost:5000/api";
  if (raw == null || String(raw).trim() === "") return fallback;
  let u = String(raw).trim().replace(/\/+$/, "");
  if (!u.endsWith("/api")) u = `${u}/api`;
  return u;
}

export const API_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL);

/** Web client ID (Google Cloud OAuth). Env VITE_GOOGLE_CLIENT_ID overrides when set. */
export const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  "635746911291-7tqkp4v5vab4k0hf5es0agafn67ug7ep.apps.googleusercontent.com";
export const TOKEN_KEY = "ara_token";
export const THEME_KEY = "ara_theme";

export const SCORE_COLORS = {
  excellent: "#22c55e",
  good: "#84cc16",
  average: "#eab308",
  poor: "#ef4444",
} as const;

export function getScoreColor(score: number): string {
  if (score >= 80) return SCORE_COLORS.excellent;
  if (score >= 60) return SCORE_COLORS.good;
  if (score >= 40) return SCORE_COLORS.average;
  return SCORE_COLORS.poor;
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Average";
  return "Needs Improvement";
}

/** Progress bar color for dashboard resume list (distinct from headline `getScoreColor` bands). */
export function getDashboardListBarColor(score: number): string {
  const s = Math.min(100, Math.max(0, Math.round(Number(score)) || 0));
  if (s <= 40) return "#ef4444"; // red — needs improvement
  if (s <= 70) return "#f59e0b"; // amber/orange — average
  return "#22c55e"; // green — good / excellent
}
