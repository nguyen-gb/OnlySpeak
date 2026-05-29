import { create } from "zustand";
import { api } from "@/lib/api";

interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: string;
  provider: string;
  is_active: boolean;
  streak_count: number;
  total_xp: number;
  daily_goal_count: number;
  created_at: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  googleLogin: (token: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  setUser: (user: User) => void;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  googleLogin: async (token) => {
    const res = await api.post("/api/auth/google", { token });
    const data = res.data as TokenResponse;
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    set({ user: data.user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null, isAuthenticated: false });
    window.location.href = "/login";
  },

  loadUser: async () => {
    try {
      const token = localStorage.getItem("access_token");
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const res = await api.get("/api/auth/me");
      const user = res.data as User;
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user) => set({ user }),
}));
