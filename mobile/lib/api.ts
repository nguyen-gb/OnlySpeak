import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// In Expo development with a local backend:
// Use 10.0.2.2 for Android emulator to access the host's localhost
// Use localhost for iOS simulator
const DEFAULT_API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000';
const API_URL = process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL;
const DEBUG_API = process.env.EXPO_PUBLIC_DEBUG_API === 'true';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const endpoints = {
  getTopics: (level?: string) => api.get(`/api/topics${level ? `?level=${level}` : ''}`),
  getTopic: (id: string | string[]) => api.get(`/api/topics/${id}`),
  getConversation: (id: string | string[]) => api.get(`/api/conversations/${id}`),
  getProgress: () => api.get('/api/progress'),
  getStats: () => api.get('/api/progress/stats'),
  getMasteryMap: () => api.get('/api/progress/mastery'),
  getReviewList: () => api.get('/api/progress/review'),
  saveProgress: (data: {
    conversation_id: string;
    role_played: string;
    completed_lines: number;
    total_lines: number;
    is_completed: boolean;
    pronunciation_score?: number;
    practice_mode?: number;
    response_times?: number[];
  }) => api.post('/api/progress', data),
  sendFreeTalk: (data: {
    conversation_id: string;
    user_input: string;
    history: { role: string; content: string }[];
    role_played: string;
  }) => api.post('/api/chat/free-talk', data),
};

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (DEBUG_API) {
    (config as any).metadata = { startTime: Date.now() };
    const method = (config.method || 'GET').toUpperCase();
    const url = `${config.baseURL || ''}${config.url || ''}`;
    console.log(`[API] -> ${method} ${url}`);
  }

  const token = await AsyncStorage.getItem('token');
  if (token) {
    if (!config.headers) config.headers = {} as any;
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (DEBUG_API) {
      const startTime = (response.config as any).metadata?.startTime;
      const duration = startTime ? `${Date.now() - startTime}ms` : '-';
      const method = (response.config.method || 'GET').toUpperCase();
      const url = `${response.config.baseURL || ''}${response.config.url || ''}`;
      console.log(`[API] <- ${response.status} ${method} ${url} (${duration})`);
    }
    return response;
  },
  async (error: AxiosError) => {
    if (DEBUG_API) {
      const startTime = (error.config as any)?.metadata?.startTime;
      const duration = startTime ? `${Date.now() - startTime}ms` : '-';
      const method = (error.config?.method || 'GET').toUpperCase();
      const url = `${error.config?.baseURL || ''}${error.config?.url || ''}`;
      const status = error.response?.status || 'NETWORK';
      console.log(`[API] xx ${status} ${method} ${url} (${duration})`, error.response?.data || error.message);
    }
    return Promise.reject(error);
  }
);

export default api;
export { API_URL, DEBUG_API };
