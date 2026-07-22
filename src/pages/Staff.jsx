import React, { useState, useEffect } from 'react';
import { authApi } from '../api/client';
import toast from 'react-hot-toast';

const Staff = () => {
  const [staff, setStaff] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', phone: '', password: '', role: 'driver',
    driverType: 'shift_driver', baseSalary: 15000, perTripBonus: 100
  });

  useEffect(() => { loadStaff(); }, []);

  const loadStaff = async () => {
    try {
      const { data } = await authApi.getUsers();
      setStaff(data.users?.filter(u => u.role !== 'owner') || []);
    } catch { toast.error('Failed to load staff'); }
  };

  const handleAdd = async () => {
    if (!form.name || !form.phone || !form.password) {
      toast.error('Name, Phone, Password ಹಾಕಿ'); return;
    }
    setLoading(true);
    try {
      await authApi.register(form);
      toast.success('Staff added!');
      setShowAdd(false);
      setForm({ name:'', phone:'', password:'', role:'driver', driverType:'shift_driver', baseSalary:15000, perTripBonus:100 });
      loadStaff();
    } catch(e) {
      toast.error(e.response?.data?.message || 'Error');
    } finally { setLoading(false); }
  };

  const handleUpdate = async (id, updates) => {
    try {
      await authApi.updateUser(id, updates);
      toast.success('Updated!');
      loadStaff();
    } catch { toast.error('Update failed'); }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this user?')) return;
    try {
      await authApi.updateUser(id, { isActive: false });
      toast.success('Deactivated');
      loadStaff();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Staff Management</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>Drivers manage ಮಾಡಿ</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-xl font-semibold text-sm"
          style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
          + Add Staff
        </button>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: 'var(--surface)' }}>
            <h2 className="text-lg font-bold mb-4">New Staff Member</h2>
            <div className="space-y-3">
              <input className="inp w-full" placeholder="Full Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              <input className="inp w-full" placeholder="Phone (10 digits)" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
              <input className="inp w-full" placeholder="Password" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
              <select className="inp w-full" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                <option value="driver">Driver</option>
              </select>
              {form.role === 'driver' && (
                <>
                  <select className="inp w-full" value={form.driverType} onChange={e => setForm({...form, driverType: e.target.value})}>
                    <option value="shift_driver">Shift Driver (12hr/24hr - ಒಂದೇ ಕಡೆ)</option>
                    <option value="trip_driver">Trip Driver (Patient Pickup/Drop)</option>
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <input className="inp" placeholder="Base Salary" type="number" value={form.baseSalary} onChange={e => setForm({...form, baseSalary: Number(e.target.value)})} />
                    <input className="inp" placeholder="Per Trip Bonus" type="number" value={form.perTripBonus} onChange={e => setForm({...form, perTripBonus: Number(e.target.value)})} />
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 rounded-xl text-sm" style={{ background: 'var(--surface2)' }}>Cancel</button>
              <button onClick={handleAdd} disabled={loading} className="flex-1 py-2 rounded-xl font-semibold text-sm" style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
                {loading ? 'Adding...' : 'Add Staff'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Staff Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="text-left p-4 text-xs uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Name</th>
              <th className="text-left p-4 text-xs uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Phone</th>
              <th className="text-left p-4 text-xs uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Role</th>
              <th className="text-left p-4 text-xs uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Driver Type</th>
              <th className="text-left p-4 text-xs uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Salary</th>
              <th className="text-left p-4 text-xs uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Status</th>
              <th className="text-left p-4 text-xs uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {staff.map(s => (
              <tr key={s._id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="p-4 font-semibold">{s.name}</td>
                <td className="p-4 font-mono text-xs">{s.phone}</td>
                <td className="p-4">
                  <span className={`badge ${s.role === 'driver' ? 'badge-green' : 'badge-blue'} text-xs capitalize`}>{s.role}</span>
                </td>
                <td className="p-4">
                  {s.role === 'driver' && (
                    <select className="inp text-xs py-1 px-2" value={s.driverType || 'shift_driver'}
                      onChange={e => handleUpdate(s._id, { driverType: e.target.value })}>
                      <option value="shift_driver">Shift Driver</option>
                      <option value="trip_driver">Trip Driver</option>
                    </select>
                  )}
                </td>
                <td className="p-4 font-mono">₹{s.baseSalary?.toLocaleString('en-IN') || 0}</td>
                <td className="p-4">
                  <span className={`badge text-xs ${s.isActive ? 'badge-green' : 'badge-red'}`}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="p-4">
                  {s.isActive && (
                    <button onClick={() => handleDeactivate(s._id)}
                      className="text-xs px-3 py-1 rounded-lg"
                      style={{ background: 'rgba(255,77,109,.1)', color: 'var(--red)' }}>
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {staff.length === 0 && (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--text3)' }}>No staff found</div>
        )}
      </div>
    </div>
  );
};

export default Staff;