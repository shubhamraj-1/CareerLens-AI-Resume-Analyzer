import { create } from "zustand";
import type { User } from "@/types";
import { TOKEN_KEY } from "@/utils/constants";
import { authApi, type LoginPayload, type RegisterPayload } from "@/api/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginPayload) => Promise<void>;
  register: (data: RegisterPayload) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem(TOKEN_KEY),
  isLoading: true,
  isAuthenticated: false,

  login: async (data: LoginPayload) => {
    const response = await authApi.login(data);
    localStorage.setItem(TOKEN_KEY, response.token);
    set({
      user: response.user,
      token: response.token,
      isAuthenticated: true,
    });
  },

  register: async (data: RegisterPayload) => {
    const response = await authApi.register(data);
    localStorage.setItem(TOKEN_KEY, response.token);
    set({
      user: response.user,
      token: response.token,
      isAuthenticated: true,
    });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ user: null, token: null, isAuthenticated: false });
  },

  loadUser: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }
    try {
      const user = await authApi.getProfile();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },
}));
