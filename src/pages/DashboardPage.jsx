// src/pages/DashboardPage.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { billingApi, tripsApi, vehiclesApi } from '../api/client';
import { StatCard, PageHeader, rupee, Spinner } from '../components/ui';
import { Truck, Clock, CheckCircle, TrendingUp, Radio } from 'lucide-react';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [dash,    setDash]    = useState(null);
  const [live,    setLive]    = useState(null);
  const [loading, setLoading] = useState(true);

  // Mock chart data — replace with real aggregation endpoint
  const chartData = [
    { day: 'Mon', trips: 8, revenue: 18400 },
    { day: 'Tue', trips: 12, revenue: 27600 },
    { day: 'Wed', trips: 7, revenue: 16100 },
    { day: 'Thu', trips: 15, revenue: 34500 },
    { day: 'Fri', trips: 11, revenue: 25300 },
    { day: 'Sat', trips: 18, revenue: 41400 },
    { day: 'Sun', trips: 9, revenue: 20700 },
  ];

  useEffect(() => {
    const load = async () => {
      try {
        const [d, l] = await Promise.all([
          billingApi.dashboard(),
          tripsApi.getLive(),
        ]);
        setDash(d.data.dashboard);
        setLive(l.data);
      } catch { /* use placeholders */ }
      setLoading(false);
    };
    load();
    const t = setInterval(load, 30000); // Refresh every 30s
    return () => clearInterval(t);
  }, []);

  if (loading) return <Spinner />;

  const dm = dash?.thisMonth || {};

  return (
    <div className="page-enter">
      <PageHeader
        title="Command Center"
        subtitle="Live fleet overview · Financial summary"
        action={
          <button onClick={() => navigate('/dispatch')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm animate-pulse-dot"
            style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
            <Radio size={14} /> New Dispatch
          </button>
        }
      />

      {/* Live counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active Trips"      value={live?.counts?.active || 0}        color="amber" icon={<Clock size={16}/>} />
        <StatCard label="Available Units"   value={live?.counts?.available || 0}     color="green" icon={<Truck size={16}/>} />
        <StatCard label="Month Revenue"     value={rupee(dm.collectedRevenue || 0)}  color="green" icon={<TrendingUp size={16}/>} />
        <StatCard label="Trips This Month"  value={dm.completedTrips || 0}           color="blue"  icon={<CheckCircle size={16}/>} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
        {/* Weekly trips chart */}
        <div className="card md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold font-display text-sm">Weekly Trips & Revenue</h3>
            <span className="text-xs font-mono" style={{ color: 'var(--accent)' }}>This week</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--ink2)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 12 }}
                formatter={(v, n) => [n === 'revenue' ? rupee(v) : v, n === 'revenue' ? 'Revenue' : 'Trips']}
              />
              <Area type="monotone" dataKey="revenue" stroke="var(--accent)" fill="url(#grad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Live board */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full pulse-dot" style={{ background: 'var(--red)' }} />
            <h3 className="font-bold font-display text-sm">Live Trips</h3>
          </div>
          <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 200 }}>
            {(live?.liveTrips || []).length === 0
              ? <div className="text-center py-6 text-xs" style={{ color: 'var(--text3)' }}>No active trips</div>
              : live.liveTrips.map(t => (
                  <div key={t._id} className="rounded-lg p-3"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div className="flex justify-between items-start">
                      <div className="font-medium text-xs">{t.patientName}</div>
                      <span className="badge badge-amber text-[10px]">{t.status}</span>
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: 'var(--text3)' }}>
                      🚑 {t.vehicle?.registrationNumber} · {t.driver?.name}
                    </div>
                  </div>
                ))
            }
          </div>
          <button onClick={() => navigate('/dispatch')}
            className="w-full mt-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{ background: 'rgba(0,212,170,.08)', color: 'var(--accent)', border: '1px solid rgba(0,212,170,.2)' }}>
            View Dispatch Board →
          </button>
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Avg Fare"         value={rupee(dm.avgFare || 0)}           color="blue"  />
        <StatCard label="Pending Revenue"  value={rupee(dm.pendingRevenue || 0)}    color="amber" />
        <StatCard label="Pending Invoices" value={dash?.pendingInvoices || 0}        color="red"   />
        <StatCard label="Fleet Health"     value="View →" color="green" />
      </div>
    </div>
  );
}
