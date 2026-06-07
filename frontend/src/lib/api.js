import axios from 'axios';
import storage from './storage';

const getApiBase = () => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // On live production servers (not localhost), always talk to the hosting origin
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return window.location.origin;
    }
  }
  // Fallback to environment variable for local development
  return (process.env.REACT_APP_BACKEND_URL && process.env.REACT_APP_BACKEND_URL !== 'undefined')
    ? process.env.REACT_APP_BACKEND_URL
    : '';
};

const API_BASE = getApiBase();

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: always attach stored access token as Authorization header
api.interceptors.request.use((config) => {
  const token = storage.getItem('access_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for token refresh (skip auth endpoints to avoid redirect loops)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/');
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      try {
        const { data } = await axios.post(`${API_BASE}/api/auth/refresh`, {}, { withCredentials: true });
        if (data?.access_token) {
          storage.setItem('access_token', data.access_token);
        }
        return api(originalRequest);
      } catch {
        storage.removeItem('access_token');
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export function formatApiError(detail) {
  if (detail == null) return 'Something went wrong. Please try again.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e))).filter(Boolean).join(' ');
  if (detail && typeof detail.msg === 'string') return detail.msg;
  return String(detail);
}

export default api;
