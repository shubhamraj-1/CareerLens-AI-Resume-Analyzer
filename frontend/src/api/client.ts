import axios from "axios";
import { toast } from "sonner";
import { API_URL, TOKEN_KEY } from "@/utils/constants";

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    // ── 401 Unauthorized → redirect to landing page (skip for auth endpoints) ──
    if (status === 401) {
      const url = error.config?.url || "";
      const isAuthRoute = url.includes("/auth/login") || url.includes("/auth/register") || url.includes("/auth/google");
      if (!isAuthRoute) {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = "/";
      }
      return Promise.reject(error);
    }

    // ── 403 Insufficient Credits → toast + redirect to /purchase ──
    if (status === 403) {
      const msg = error.response?.data?.message || "";
      if (msg.toLowerCase().includes("credit") || msg.toLowerCase().includes("upgrade")) {
        toast.error("You're out of AI credits! 🪙", {
          id: "no-credits",
          description: "Redirecting you to buy more credits...",
          duration: 4000,
        });
        setTimeout(() => { window.location.href = "/purchase"; }, 1500);
        return Promise.reject(error);
      }
    }

    // ── 429 Rate Limited → friendly toast (single global handler) ──
    if (status === 429) {
      const msg =
        error.response?.data?.message ||
        "Our AI is handling high traffic. Please wait 30-60 seconds and try again.";
      toast.error("Traffic is high! Please wait a moment and try again 🚦", {
        id: "rate-limit",           // deduplicate: only one toast at a time
        description: msg,
        duration: 8000,
      });
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
