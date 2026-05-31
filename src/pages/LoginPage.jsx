// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, Smartphone, Lock, RefreshCw } from 'lucide-react';

export default function LoginPage() {
  const { loginPassword, sendOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();

  const [mode,     setMode]     = useState('password'); // 'password' | 'otp'
  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [otp,      setOtp]      = useState('');
  const [otpSent,  setOtpSent]  = useState(false);
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

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!phone || phone.length !== 10) { toast.error('Enter a valid 10-digit number'); return; }
    setLoading(true);
    try {
      const res = await sendOtp(phone);
      setOtpSent(true);
      toast.success('OTP sent to ' + phone);
      if (res.otp) toast(`Dev mode — OTP: ${res.otp}`, { icon: '🔐', duration: 8000 });
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await verifyOtp(phone, otp);
      toast.success('Logged in!');
      navigate('/driver');
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

          {/* Mode toggle */}
          <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: 'var(--ink3)' }}>
            <button onClick={() => { setMode('password'); setOtpSent(false); }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5
                ${mode === 'password' ? 'bg-[var(--surface2)] text-[var(--text)]' : 'text-[var(--text3)]'}`}>
              <Lock size={12} /> Admin Login
            </button>
            <button onClick={() => setMode('otp')}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5
                ${mode === 'otp' ? 'bg-[var(--surface2)] text-[var(--text)]' : 'text-[var(--text3)]'}`}>
              <Smartphone size={12} /> Driver OTP
            </button>
          </div>

          {/* Password form */}
          {mode === 'password' && (
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
          )}

          {/* OTP form */}
          {mode === 'otp' && (
            <div>
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
                      style={{ color: 'var(--text2)' }}>Driver Phone</label>
                    <input value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="10-digit mobile number" maxLength={10}
                      className="inp" required />
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all"
                    style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
                    {loading ? <RefreshCw size={15} className="animate-spin" /> : <><span>Send OTP</span><ArrowRight size={15} /></>}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <p className="text-sm" style={{ color: 'var(--text2)' }}>
                    OTP sent to <span style={{ color: 'var(--accent)' }}>+91 {phone}</span>
                  </p>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
                      style={{ color: 'var(--text2)' }}>Enter 6-digit OTP</label>
                    <input value={otp} onChange={e => setOtp(e.target.value)}
                      placeholder="_ _ _ _ _ _" maxLength={6}
                      className="inp text-center text-xl tracking-widest font-mono" required />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setOtpSent(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                      style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
                      Back
                    </button>
                    <button type="submit" disabled={loading}
                      className="flex-1 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
                      style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
                      {loading ? <RefreshCw size={15} className="animate-spin" /> : 'Verify & Login'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--text3)' }}>
          MediFleet CRM v1.0 · Secure Access
        </p>
      </div>
    </div>
  );
}
