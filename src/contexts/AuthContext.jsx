// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';
import { disableBookingPush } from '../lib/bookingPush';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Restore session from localStorage on mount ────────────
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const saved = localStorage.getItem('user');
    if (token && saved) {
      try {
        setUser(JSON.parse(saved));
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } catch { /* malformed — ignore */ }
    }
    setLoading(false);
  }, []);

  // ── Phone + Password login (Owner) ────────────────────────
  const loginPassword = useCallback(async (phone, password) => {
    const { data } = await api.post('/auth/login', { phone, password });
    _persistSession(data);
    return data;
  }, []);

  // ── Logout ─────────────────────────────────────────────────
  const logout = useCallback(async () => {
    // This browser stops getting booking notifications (they carry patient
    // names) while nobody is logged in; the choice is kept, so the next
    // login turns them back on. Needs the token, so before the logout call;
    // capped so a slow network never holds up logging out.
    await Promise.race([disableBookingPush({ remember: false }), new Promise((r) => setTimeout(r, 3000))]);
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    toast.success('Logged out');
  }, []);

  // ── Internal: persist tokens & user to localStorage ───────
  const _persistSession = (data) => {
    localStorage.setItem('accessToken',  data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user',         JSON.stringify(data.user));
    api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
    setUser(data.user);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginPassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
