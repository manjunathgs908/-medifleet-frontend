import React, { useState, useEffect } from 'react';
import { authApi, ownersApi } from '../api/client';
import toast from 'react-hot-toast';

const Staff = () => {
  const [staff, setStaff] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingPosting, setEditingPosting] = useState(null); // staff row being edited, or null
  const [postingForm, setPostingForm] = useState({ postingName: '', postingLat: '', postingLng: '' });
  const [owners, setOwners] = useState([]);              // partners, loaded lazily for the move picker
  const [moveTarget, setMoveTarget] = useState(null);     // driver being moved, or null
  const [moveOwnerId, setMoveOwnerId] = useState('');
  const [moving, setMoving] = useState(false);
  const [form, setForm] = useState({
    name: '', phone: '', password: '', role: 'driver',
    driverType: 'shift_driver', baseSalary: 15000, perTripBonus: 100,
    shiftHours: '', postingName: '', postingLat: '', postingLng: ''
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
      const { data } = await authApi.register(form);

      // register() only persists a fixed field list (see
      // authController.js) -- shiftHours/postingName/postingLat/postingLng
      // aren't in it and would be silently dropped here, so the edit path
      // is used as an immediate follow-up. Every field below is on
      // EDITABLE_USER_FIELDS in routes/auth.js; anything not on that list
      // is now rejected with a 400 naming it rather than ignored.
      const postingFields = {};
      if (form.shiftHours) postingFields.shiftHours = Number(form.shiftHours);
      if (form.postingName) postingFields.postingName = form.postingName;
      if (form.postingLat) postingFields.postingLat = Number(form.postingLat);
      if (form.postingLng) postingFields.postingLng = Number(form.postingLng);
      if (form.role === 'driver' && data.user?.id && Object.keys(postingFields).length) {
        await authApi.updateUser(data.user.id, postingFields);
      }

      toast.success('Staff added!');
      setShowAdd(false);
      setForm({
        name:'', phone:'', password:'', role:'driver', driverType:'shift_driver',
        baseSalary:15000, perTripBonus:100,
        shiftHours:'', postingName:'', postingLat:'', postingLng:'',
      });
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

  const openPostingEdit = (s) => {
    setPostingForm({
      postingName: s.postingName || '',
      postingLat : s.postingLat != null ? String(s.postingLat) : '',
      postingLng : s.postingLng != null ? String(s.postingLng) : '',
    });
    setEditingPosting(s);
  };

  // Same updateUser call Driver Type's inline select already uses --
  // sends postingLat/postingLng as null (not omitted) when the input is
  // empty, so clearing a field in the modal actually clears it, not just
  // leaves the old value untouched.
  const savePosting = async () => {
    await handleUpdate(editingPosting._id, {
      postingName: postingForm.postingName,
      postingLat : postingForm.postingLat === '' ? null : Number(postingForm.postingLat),
      postingLng : postingForm.postingLng === '' ? null : Number(postingForm.postingLng),
    });
    setEditingPosting(null);
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this user?')) return;
    try {
      // The dedicated route, not updateUser: isActive is not on
      // EDITABLE_USER_FIELDS, so the generic edit now rejects it.
      await authApi.deactivateUser(id);
      toast.success('Deactivated');
      loadStaff();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  // ── Move a driver to another partner's fleet ──────────────────
  const openMove = async (s) => {
    setMoveTarget(s);
    setMoveOwnerId(s.owner || '');
    if (!owners.length) {
      try {
        const { data } = await ownersApi.getAll();
        setOwners(data.owners || []);
      } catch { toast.error('Could not load partners'); }
    }
  };

  const confirmMove = async () => {
    setMoving(true);
    try {
      await authApi.moveUserToOwner(moveTarget._id, moveOwnerId || null);
      toast.success('Driver moved');
      setMoveTarget(null);
      loadStaff();
    } catch (e) {
      // DRIVER_ON_DUTY is the one an operator will actually hit. Shown as
      // it comes back — it names the driver and says to end their duty
      // first, which is the whole instruction.
      toast.error(e.response?.data?.message || 'Could not move this driver');
    } finally { setMoving(false); }
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
                  {/* Fixed corporate posting -- SaveLife's own drivers only
                      (see User.owner). Static per-driver property, not a
                      schedule. No pre-selected shiftHours default -- an
                      owner must explicitly choose it, same "don't guess"
                      intent as the backend field having no schema default. */}
                  <select className="inp w-full" value={form.shiftHours} onChange={e => setForm({...form, shiftHours: e.target.value})}>
                    <option value="">Shift Hours -- not set</option>
                    <option value="8">8 hours</option>
                    <option value="12">12 hours</option>
                    <option value="24">24 hours</option>
                  </select>
                  <input className="inp w-full" placeholder="Posting Name (e.g. City Hospital ER)" value={form.postingName} onChange={e => setForm({...form, postingName: e.target.value})} />
                  <div className="grid grid-cols-2 gap-3">
                    <input className="inp" placeholder="Posting Latitude" type="number" value={form.postingLat} onChange={e => setForm({...form, postingLat: e.target.value})} />
                    <input className="inp" placeholder="Posting Longitude" type="number" value={form.postingLng} onChange={e => setForm({...form, postingLng: e.target.value})} />
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

      {/* Posting Edit Modal -- same hand-rolled style as the Add Staff
          modal above, for consistency within this file. */}
      {editingPosting && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: 'var(--surface)' }}>
            <h2 className="text-lg font-bold mb-4">Edit Posting -- {editingPosting.name}</h2>
            <div className="space-y-3">
              <input className="inp w-full" placeholder="Posting Name (e.g. City Hospital ER)" value={postingForm.postingName} onChange={e => setPostingForm({...postingForm, postingName: e.target.value})} />
              <div className="grid grid-cols-2 gap-3">
                <input className="inp" placeholder="Posting Latitude" type="number" value={postingForm.postingLat} onChange={e => setPostingForm({...postingForm, postingLat: e.target.value})} />
                <input className="inp" placeholder="Posting Longitude" type="number" value={postingForm.postingLng} onChange={e => setPostingForm({...postingForm, postingLng: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setEditingPosting(null)} className="flex-1 py-2 rounded-xl text-sm" style={{ background: 'var(--surface2)' }}>Cancel</button>
              <button onClick={savePosting} className="flex-1 py-2 rounded-xl font-semibold text-sm" style={{ background: 'var(--accent)', color: 'var(--ink)' }}>Save</button>
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
              <th className="text-left p-4 text-xs uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Shift Hours</th>
              <th className="text-left p-4 text-xs uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Posting</th>
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
                <td className="p-4 text-sm">
                  {s.role === 'driver' && (
                    <select className="inp text-xs py-1 px-2" value={s.shiftHours || ''}
                      onChange={e => handleUpdate(s._id, { shiftHours: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Not set</option>
                      <option value="8">8 hours</option>
                      <option value="12">12 hours</option>
                      <option value="24">24 hours</option>
                    </select>
                  )}
                </td>
                <td className="p-4 text-sm" style={{ color: 'var(--text2)' }}>
                  {s.role === 'driver' && (
                    <div className="flex items-center gap-2">
                      <span>{s.postingName || <span style={{ color: 'var(--red)' }}>Not set</span>}</span>
                      <button onClick={() => openPostingEdit(s)} className="text-xs px-2 py-1 rounded-lg"
                        style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
                        Edit
                      </button>
                    </div>
                  )}
                </td>
                <td className="p-4">
                  <span className={`badge text-xs ${s.isActive ? 'badge-green' : 'badge-red'}`}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="p-4">
                  {s.isActive && (
                    <div className="flex gap-2">
                      {s.role === 'driver' && (
                        <button onClick={() => openMove(s)}
                          className="text-xs px-2 py-1 rounded-lg"
                          style={{ background: 'var(--surface2)', color: 'var(--text2)' }}>
                          Move fleet
                        </button>
                      )}
                      <button onClick={() => handleDeactivate(s._id)}
                        className="text-xs px-3 py-1 rounded-lg"
                        style={{ background: 'rgba(255,77,109,.1)', color: 'var(--red)' }}>
                        Deactivate
                      </button>
                    </div>
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

      {/* Move a driver to another partner's fleet. */}
      {moveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,.6)' }}>
          <div className="card w-full" style={{ maxWidth: 440 }}>
            <h2 className="text-lg font-bold mb-1">Move {moveTarget.name}</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text3)' }}>
              This changes whose roster they are on, which ambulances they can claim, and whether
              they get attendance and payroll. Any ambulance they are assigned to is unassigned.
            </p>

            <label className="block text-xs font-semibold mb-1 uppercase tracking-wide"
              style={{ color: 'var(--text2)' }}>Fleet</label>
            <select className="inp w-full mb-4" value={moveOwnerId}
              onChange={e => setMoveOwnerId(e.target.value)}>
              <option value="">— No fleet (unlink) —</option>
              {owners.map(o => (
                <option key={o._id} value={o._id}>
                  {o.isPlatformOwner ? '★ ' : ''}{o.businessName || o.name}
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2">
              <button className="text-sm px-3 py-2 rounded-lg"
                style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                onClick={() => setMoveTarget(null)}>Cancel</button>
              <button className="text-sm px-3 py-2 rounded-lg"
                style={{ background: 'var(--accent)', color: '#00110d', fontWeight: 600 }}
                disabled={moving} onClick={confirmMove}>
                {moving ? 'Moving…' : 'Move driver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Staff;