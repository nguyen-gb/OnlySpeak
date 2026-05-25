import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../lib/api';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  avatar_url?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const res = await api.post('/api/auth/token', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { access_token } = res.data;
      await AsyncStorage.setItem('token', access_token);
      
      const userRes = await api.get('/api/auth/me');
      set({ user: userRes.data, isAuthenticated: true });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Login failed');
    }
  },

  register: async (email, password, fullName) => {
    try {
      const res = await api.post('/api/auth/register', {
        email,
        password,
        full_name: fullName,
      });

      const { access_token } = res.data;
      await AsyncStorage.setItem('token', access_token);
      
      const userRes = await api.get('/api/auth/me');
      set({ user: userRes.data, isAuthenticated: true });
    } catch (error: any) {
      throw new Error(error.response?.data?.detail || 'Registration failed');
    }
  },

  logout: async () => {
    await AsyncStorage.removeItem('token');
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
