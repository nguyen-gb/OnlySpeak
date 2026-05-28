import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../lib/api';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  avatar_url?: string;
  streak_count?: number;
  total_xp?: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  googleLogin: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  googleLogin: async (token) => {
    try {
      const res = await api.post('/api/auth/google', { token });
      const { access_token, refresh_token, user } = res.data;
      await AsyncStorage.setItem('token', access_token);
      if (refresh_token) {
        await AsyncStorage.setItem('refresh_token', refresh_token);
      }

      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Google login failed');
    }
  },

  logout: async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('refresh_token');
    set({ user: null, isAuthenticated: false });
  },

  loadUser: async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      const userRes = await api.get('/api/auth/me');
      set({ user: userRes.data, isAuthenticated: true, isLoading: false });
    } catch (error) {
      await AsyncStorage.removeItem('token');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
