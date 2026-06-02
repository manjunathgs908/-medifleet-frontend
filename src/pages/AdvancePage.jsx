import React, { useState, useEffect } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';

const AdvancePage = () => {
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadAdvances(); }, []);

  const loadAdvances = async () => {
    try {
      const { data } = await api.get('/advances');
      setAdvances(data.advances || []);
    } catch { toast.error('Failed to load advances'); }
  };

  const handleApprove = async (id) => {
    try {
      await api.put(`/advances/${id}/approve`);
      toast.success('Approved!');
      loadAdvances();
    } catch { toast.error('Failed'); }
  };

  const handleReject = async (id) => {
    const reason = window.prompt('Rejection reason:');
    if (!reason) return;
    try {
      await api.put(`/advances/${id}/reject`, { reason });
      toast.success('Rejected');
      loadAdvances();
    } catch { toast.error('Failed'); }
  };

  const pending = advances.filter(a => a.status === 'pending');
  const others  = advances.filter(a => a.status !== 'pending');

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Salary Advances</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>Driver advance requests manage ಮಾಡಿ</p>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--amber)' }}>
            ⏳ Pending ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map(a => (
              <div key={a._id} className="card-sm rounded-2xl p-4 flex items-center justify-between"
                style={{ border: '1px solid rgba(255,184,48,.3)', background: 'rgba(255,184,48,.05)' }}>
                <div>
                  <div className="font-semibold">{a.driver?.name}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text2)' }}>{a.driver?.phone}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text2)' }}>Reason: {a.reason}</div>
                  <div className="text-xs mt-1 font-mono" style={{ color: 'var(--text3)' }}>
                    {new Date(a.createdAt).toLocaleDateString('en-IN')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold font-mono mb-3" style={{ color: 'var(--amber)' }}>
                    ₹{a.amount?.toLocaleString('en-IN')}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApprove(a._id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
                      ✅ Approve
                    </button>
                    <button onClick={() => handleReject(a._id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: 'rgba(255,77,109,.1)', color: 'var(--red)' }}>
                      ❌ Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text3)' }}>
          History
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Driver', 'Amount', 'Reason', 'Status', 'Date'].map(h => (
                  <th key={h} className="text-left p-4 text-xs uppercase tracking-wide" style={{ color: 'var(--text3)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {others.map(a => (
                <tr key={a._id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="p-4 font-semibold">{a.driver?.name}</td>
                  <td className="p-4 font-mono">₹{a.amount?.toLocaleString('en-IN')}</td>
                  <td className="p-4 text-xs" style={{ color: 'var(--text2)' }}>{a.reason}</td>
                  <td className="p-4">
                    <span className={`badge text-xs ${a.status === 'approved' ? 'badge-green' : 'badge-red'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="p-4 text-xs font-mono" style={{ color: 'var(--text3)' }}>
                    {new Date(a.createdAt).toLocaleDateString('en-IN')}
                  </td>
                </tr>
              ))}
              {others.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-sm" style={{ color: 'var(--text3)' }}>No history</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdvancePage;