import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';

// ============================================
// BASE URL CONFIGURATION1
// ============================================

const PRODUCTION_URL = 'https://connect.flybook.com.bd';

// For local development - automatically detects platform
const LOCAL_URL = Platform.select({
  android: 'http://192.168.1.195:10000',
  ios: 'http://192.168.1.195:10000',
  default: 'http://192.168.1.195:10000',
});

// Automatically use Local during development and Production in released app
export const BASE_URL = __DEV__ ? LOCAL_URL : PRODUCTION_URL;

// Storage keys
const TOKEN_KEY = '@flyconnect_token';
const USER_KEY = '@flyconnect_user';

/**
 * Core axios instance with interceptors
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor - Adds JWT token to all requests
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    } catch (error) {
      return config;
    }
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  },
);

/**
 * Response interceptor - Handles errors globally
 */
apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    if (!error.response) {
      return Promise.reject({
        message: 'Network error. Please check your connection.',
        status: 0,
      });
    }

    const {status, data} = error.response;

    if (status === 401) {
      await clearAuth();
    }

    return Promise.reject({
      message: (data as any)?.message || 'An error occurred.',
      status,
      data,
    });
  },
);

/**
 * Auth Storage Helpers
 */
export const saveToken = async (token: string) =>
  AsyncStorage.setItem(TOKEN_KEY, token);
export const getToken = async () => AsyncStorage.getItem(TOKEN_KEY);
export const saveUserCache = async (user: any) =>
  AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
export const getUserCache = async () => {
  const data = await AsyncStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
};
export const clearAuth = async () =>
  AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);

// API Methods
export const getProfileAPI = async () => {
  return get('/api/v1/auth/profile');
};

export const searchUsers = async (query: string) => {
  return get(`/api/v1/users/search?q=${query}`);
};

export const getOrCreateConversation = async (receiverId: string) => {
  return post('/api/v1/chats/get-or-create', {receiverId});
};

export const getChatMessages = async (conversationId: string, page = 1) => {
  return get(`/api/v1/chats/messages/${conversationId}?page=${page}`);
};

export const getInbox = async () => {
  return get('/api/v1/chats/inbox');
};

export const getCallHistory = async (page = 1, limit = 20) => {
  return get(`/api/v1/calls/history?page=${page}&limit=${limit}`);
};

export const declineCallAPI = async (data: {
  callId: string;
  callerId: string;
}) => {
  return post('/api/v1/calls/decline', data);
};

export const get = async <T = any>(url: string, config?: any): Promise<T> => {
  const response = await apiClient.get<T>(url, config);
  return response.data;
};

export const post = async <T = any>(
  url: string,
  data?: any,
  config?: any,
): Promise<T> => {
  const response = await apiClient.post<T>(url, data, config);
  return response.data;
};

export default apiClient;
