// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, RefreshCw } from 'lucide-react';

// Admin-only login — drivers use the mobile app (medifleet-app), never
// this CRM, so there's no OTP tab here anymore. Single phone+password
// form, no tab switcher (there's nothing left to switch between).
export default function LoginPage() {
  const { loginPassword } = useAuth();
  const navigate = useNavigate();

  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginPassword(phone, password);
      toast.success('Welcome back!');
      navigate('/');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--ink)' }}>

      {/* Background grid pattern */}
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(rgba(0,212,170,.06) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }} />

      {/* Glow */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(0,212,170,.08) 0%, transparent 70%)' }} />

      <div className="relative w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl text-3xl mb-4"
            style={{ background: 'linear-gradient(135deg, var(--accent), #3b9eff)', boxShadow: '0 0 40px rgba(0,212,170,.3)' }}>
            🚑
          </div>
          <h1 className="text-3xl font-bold font-display">MediFleet</h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--text3)' }}>
            Ambulance CRM & Fleet Management
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6" style={{ background: 'var(--ink2)', border: '1px solid var(--border2)' }}>
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
                style={{ color: 'var(--text2)' }}>Phone Number</label>
              <input value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="10-digit mobile number" maxLength={10}
                className="inp" required />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
                style={{ color: 'var(--text2)' }}>Password</label>
              <input value={password} onChange={e => setPassword(e.target.value)}
                type="password" placeholder="Your password"
                className="inp" required />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
              style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
              {loading
                ? <RefreshCw size={15} className="animate-spin" />
                : <><span>Sign In</span><ArrowRight size={15} /></>
              }
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--text3)' }}>
          MediFleet CRM v1.0 · Secure Access
        </p>
      </div>
    </div>
  );
}
