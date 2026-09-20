import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ownersApi } from '../api/client';
import { PageHeader, Btn, Modal, StatusBadge, Spinner, Empty } from '../components/ui';

const DOC_LABELS = { aadhaar: 'Aadhaar', pan: 'PAN', addressProof: 'Address Proof', photo: 'Photo' };

// Platform admin reviews fleet Owners' KYC here — separate actor/model
// from everything else in this CRM (Owner, not User), backed by the new
// GET/PUT /api/owners* admin endpoints (protect+authorize('owner'), same
// CRM session as this page, not the fleet-Owner's own app login).
export default function OwnersPage() {
  const [owners,  setOwners]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId,  setBusyId]  = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [reason, setReason] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await ownersApi.getAll();
      setOwners(data.owners);
    } finally { setLoading(false); }
  };

  const approve = async (owner) => {
    setBusyId(owner._id);
    try {
      await ownersApi.approve(owner._id);
      toast.success('Owner approved');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not approve owner');
    } finally {
      setBusyId(null);
    }
  };

  const togglePlatformOwner = async (owner, next) => {
    setBusyId(owner._id);
    try {
      await ownersApi.setPlatformOwner(owner._id, next);
      toast.success(next
        ? 'Marked as SaveLife-owned — its drivers now get attendance and payroll.'
        : 'Unmarked — its drivers no longer get attendance or payroll.');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not update this owner');
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = async () => {
    setBusyId(rejectTarget._id);
    try {
      await ownersApi.reject(rejectTarget._id, reason.trim() || undefined);
      toast.success('Owner rejected');
      setRejectTarget(null);
      setReason('');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not reject owner');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page-enter">
      <PageHeader title="Owners" subtitle="Fleet owner KYC review — approve or reject registrations" />

      {loading ? <Spinner /> : owners.length === 0 ? <Empty icon="🧑‍💼" message="No owners registered yet" /> : (
        <div className="flex flex-col gap-4">
          {owners.map((o) => {
            const docs = o.kycDocuments || {};
            const isBusy = busyId === o._id;
            // 'pending' as well as 'submitted'. A partner who registers
            // has kycStatus 'pending' and only reaches 'submitted' by
            // uploading KYC documents from the app — gating the buttons on
            // 'submitted' alone left every new registration unapprovable
            // and stalled onboarding at step one. Documents are still
            // visible above, so the admin can see there are none and
            // decide accordingly.
            const canDecide = o.kycStatus === 'pending' || o.kycStatus === 'submitted';
            return (
              <div key={o._id} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="font-bold font-display">
                      {o.businessName || o.name}
                      {o.isPlatformOwner && (
                        <span className="text-[10px] font-semibold ml-2 px-1.5 py-0.5 rounded"
                              style={{ background: 'var(--green-dim, #16a34a22)', color: 'var(--green, #16a34a)' }}>
                          SAVELIFE
                        </span>
                      )}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text2)' }}>{o.name}</div>
                    <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--text3)' }}>{o.phone}</div>
                    {(o.gstin || o.pan) && (
                      <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--text3)' }}>
                        {o.gstin ? `GSTIN ${o.gstin}` : null}{o.gstin && o.pan ? ' · ' : null}{o.pan ? `PAN ${o.pan}` : null}
                      </div>
                    )}
                    {o.kycStatus === 'rejected' && o.kycRejectionReason && (
                      <div className="text-xs mt-2" style={{ color: 'var(--red)' }}>Reason: {o.kycRejectionReason}</div>
                    )}
                  </div>
                  <StatusBadge status={o.kycStatus} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {Object.entries(DOC_LABELS).map(([docType, label]) => (
                    <div key={docType} className="text-center">
                      {docs[docType]?.url
                        ? <img src={docs[docType].url} alt={label}
                            className="w-full h-24 object-cover rounded-lg"
                            style={{ border: '1px solid var(--border2)' }} />
                        : <div className="w-full h-24 rounded-lg flex items-center justify-center text-xs"
                            style={{ background: 'var(--surface2)', border: '1px dashed var(--border2)', color: 'var(--text3)' }}>
                            Not uploaded
                          </div>
                      }
                      <div className="text-xs mt-1.5" style={{ color: 'var(--text3)' }}>{label}</div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canDecide && (
                    <>
                      <Btn size="sm" onClick={() => approve(o)} disabled={isBusy}>✓ Approve</Btn>
                      <Btn size="sm" variant="danger" onClick={() => { setRejectTarget(o); setReason(''); }} disabled={isBusy}>✕ Reject</Btn>
                    </>
                  )}

                  {/* Marks this Owner as SaveLife's own. Its drivers then get
                      attendance rows and appear in payroll; a partner's do
                      not, because the partner employs and pays them. Only
                      this CRM session can set it — there is no owner-app
                      path to it at all. */}
                  <label className="flex items-center gap-2 text-xs ml-auto cursor-pointer select-none"
                         style={{ color: 'var(--text2)' }}>
                    <input
                      type="checkbox"
                      checked={!!o.isPlatformOwner}
                      disabled={isBusy}
                      onChange={(e) => togglePlatformOwner(o, e.target.checked)}
                    />
                    SaveLife-owned fleet (attendance &amp; payroll)
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title={`Reject ${rejectTarget?.name || ''}`}>
        <label className="block text-xs font-semibold mb-1 tracking-wide uppercase" style={{ color: 'var(--text2)' }}>
          Reason
        </label>
        <textarea
          className="inp w-full"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What needs to be fixed?"
        />
        <div className="flex justify-end gap-2 mt-4">
          <Btn variant="ghost" onClick={() => setRejectTarget(null)}>Cancel</Btn>
          <Btn variant="danger" onClick={confirmReject} disabled={busyId === rejectTarget?._id}>Confirm Reject</Btn>
        </div>
      </Modal>
    </div>
  );
}
