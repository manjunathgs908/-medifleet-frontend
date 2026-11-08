// src/utils/staffStatus.js
//
// The Staff page's Activate / Deactivate toggle —
// PATCH /api/auth/users/:id/status { isActive } (medifleet-backend
// routes/auth.js). The backend answers
//   200 { success, changed, message, user: { _id, name, role, isActive } }
//   400 (isActive not boolean | code SELF | code ROLE_NOT_ALLOWED)
//   409 code DRIVER_ON_DUTY   404 unknown user
// and every failure carries a human `message`.

// Owner logins are never toggled here (the backend refuses them too).
export const STATUS_TOGGLE_ROLES = ['driver', 'telecaller'];
export const canToggleStatus = (u) => !!u && STATUS_TOGGLE_ROLES.includes(u.role);

// statusOutcome({ data } | { error }, requested) ->
//   { ok: true,  isActive, message }   the row now shows isActive
//   { ok: false, message }             show message, leave the row as it was
export function statusOutcome({ data, error } = {}, requested) {
  if (error) {
    if (!error.response) return { ok: false, message: 'Could not reach the server — check the connection and try again.' };
    const d = error.response.data || {};
    return { ok: false, message: d.message || `Could not change the status (HTTP ${error.response.status}).` };
  }
  if (!data?.success) return { ok: false, message: data?.message || 'Could not change the status.' };
  // Trust what the server says it is now; fall back to what was asked.
  const isActive = typeof data.user?.isActive === 'boolean' ? data.user.isActive : !!requested;
  return { ok: true, isActive, message: data.message || (isActive ? 'Activated' : 'Deactivated') };
}
