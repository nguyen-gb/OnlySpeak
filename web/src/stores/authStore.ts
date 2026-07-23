import { create } from "zustand";
import {
  api,
  getErrorMessage,
  isTransientApiError,
} from "@/lib/api";
import { getQueryClient } from "@/lib/queryClient";
import { broadcastAuthEvent } from "@/lib/authSync";

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
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
  isInitialized: boolean;
  isAuthenticated: boolean;
  sessionError: string | null;
  googleLogin: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearSession: (notifyOtherTabs?: boolean) => void;
  setUser: (user: User) => void;
}

interface LoginResponse {
  token_type: string;
  user: User;
}

let loadUserPromise: Promise<void> | null = null;
let loadUserAgain = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isInitialized: false,
  isAuthenticated: false,
  sessionError: null,

  googleLogin: async (token) => {
    set({ isLoading: true });
    try {
      const response = await api.post<LoginResponse>("/api/auth/google", {
        token,
      });
      getQueryClient().clear();
      set({
        user: response.data.user,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
        sessionError: null,
      });
      broadcastAuthEvent("identity-changed");
    } catch (error) {
      set({ isLoading: false, isInitialized: true });
      throw error;
    }
  },

  logout: async () => {
    await api.post("/api/auth/logout");
    getQueryClient().clear();
    set({
      user: null,
      isAuthenticated: false,
      isInitialized: true,
      isLoading: false,
      sessionError: null,
    });
    broadcastAuthEvent("logged-out");
    if (typeof window !== "undefined") {
      window.location.replace("/login");
    }
  },

  loadUser: () => {
    if (loadUserPromise) {
      loadUserAgain = true;
      return loadUserPromise;
    }
    loadUserPromise = (async () => {
      if (!get().isInitialized) {
        set({ isLoading: true, sessionError: null });
      } else {
        set({ sessionError: null });
      }
      try {
        const response = await api.get<User>("/api/auth/me");
        const previousUser = get().user;
        if (
          previousUser &&
          (previousUser.id !== response.data.id ||
            previousUser.role !== response.data.role)
        ) {
          getQueryClient().clear();
        }
        set({
          user: response.data,
          isAuthenticated: true,
          isInitialized: true,
          isLoading: false,
          sessionError: null,
        });
      } catch (error) {
        if (isTransientApiError(error)) {
          set({
            isInitialized: true,
            isLoading: false,
            sessionError: getErrorMessage(error),
          });
          return;
        }
        getQueryClient().clear();
        set({
          user: null,
          isAuthenticated: false,
          isInitialized: true,
          isLoading: false,
          sessionError: null,
        });
      } finally {
        loadUserPromise = null;
        if (loadUserAgain) {
          loadUserAgain = false;
          void get().loadUser();
        }
      }
    })();
    return loadUserPromise;
  },

  clearSession: (notifyOtherTabs = true) => {
    getQueryClient().clear();
    set({
      user: null,
      isAuthenticated: false,
      isInitialized: true,
      isLoading: false,
      sessionError: null,
    });
    if (notifyOtherTabs) {
      broadcastAuthEvent("session-expired");
    }
  },

  setUser: (user) => set({ user }),
}));
