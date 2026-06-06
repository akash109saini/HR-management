import React, { createContext, useContext, useState, useEffect } from 'react';
import api, { formatApiError } from '../lib/api';
import storage from '../lib/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = not auth
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    // Store token in storage for axios interceptor
    if (data.access_token) {
      storage.setItem('access_token', data.access_token);
    }
    setUser(data);
    return data;
  };

  const changePassword = async (currentPassword, newPassword) => {
    const { data } = await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    // Update stored token after password change
    if (data.access_token) {
      storage.setItem('access_token', data.access_token);
    }
    // Re-fetch user to get updated first_login status
    await checkAuth();
    return data;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    storage.removeItem('access_token');
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
