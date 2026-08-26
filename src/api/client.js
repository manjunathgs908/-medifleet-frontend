// src/api/client.js
import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
 baseURL: 'https://api.savelife.health/api',
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach current access token ─────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// ── Response interceptor: auto-refresh on 401 ────────────────
let isRefreshing   = false;
let refreshQueue   = [];

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    // Token expired — try refresh
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (isRefreshing) {
        // Queue request until refresh resolves
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then(token => {
          original.headers['Authorization'] = `Bearer ${token}`;
          return api(original);
        });
      }

      isRefreshing = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post('https://api.savelife.health/api/auth/refresh', { refreshToken });
        const newToken = data.accessToken;

        localStorage.setItem('accessToken', newToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

        refreshQueue.forEach(q => q.resolve(newToken));
        refreshQueue = [];
        isRefreshing = false;

        original.headers['Authorization'] = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshErr) {
        refreshQueue.forEach(q => q.reject(refreshErr));
        refreshQueue = [];
        isRefreshing = false;

        // Force logout
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      }
    }

    // Show error toast for non-401 errors (skip network errors)
    const msg = err.response?.data?.message || err.message;
    if (err.response && err.response.status !== 401) {
      toast.error(msg, { duration: 4000 });
    }

    return Promise.reject(err);
  }
);

export default api;

// ── Typed API helpers used across pages ──────────────────────

// Auth
export const authApi = {
  getUsers  : (params) => api.get('/auth/users', { params }),
  updateUser: (id, data) => api.put(`/auth/users/${id}`, data),
  register  : (data) => api.post('/auth/register', data),
};

// Trips
export const tripsApi = {
  getAll      : (params) => api.get('/trips', { params }),
  getLive     : ()       => api.get('/trips/live'),
  getById     : (id)     => api.get(`/trips/${id}`),
  create      : (data)   => api.post('/trips', data),
  // Quote without booking. Runs the same verifyRoute + fareCalculator.compute
  // path createTrip runs, so the figure shown to the operator is the figure
  // the trip is created with. Never reimplement slab pricing client-side.
  estimate    : (data)   => api.post('/trips/estimate', data),
  // target: { vehicleId } (legacy) or { ambulanceId } (owner/driver on
  // duty via the mobile app) — backend accepts either.
  assign      : (id, target) => api.put(`/trips/${id}/assign`, target),
  complete    : (id, data) => api.put(`/trips/${id}/complete`, data),
  cancel      : (id, reason)   => api.put(`/trips/${id}/cancel`, { reason }),
  updateStatus: (id, status)   => api.put(`/trips/${id}/status`, { status }),
};

// Pricing — the MongoDB `pricing` collection is the single source of truth
// for which services are bookable at all. The CRM's service dropdown is
// built from this, never from a hard-coded list, so a service added in the
// DB shows up in dispatch without a frontend release.
export const pricingApi = {
  getAll: () => api.get('/pricing'),
};

// Google Places / Directions, proxied by the backend so the Maps key stays
// server-side. Same endpoints the SaveLife website booking form uses.
export const placesApi = {
  autocomplete: (input)   => api.get('/places/autocomplete', { params: { input } }),
  details     : (placeid) => api.get('/places/details', { params: { placeid } }),
  reverse     : (lat, lng) => api.get('/places/reverse', { params: { lat, lng } }),
};

// Vehicles
export const vehiclesApi = {
  getAll        : (params) => api.get('/vehicles', { params }),
  getById       : (id)     => api.get(`/vehicles/${id}`),
  create        : (data)   => api.post('/vehicles', data),
  update        : (id, d)  => api.put(`/vehicles/${id}`, d),
  assignDriver  : (id, driverId) => api.put(`/vehicles/${id}/assign-driver`, { driverId }),
  updateDocument: (id, data)     => api.put(`/vehicles/${id}/document`, data),
  addServiceLog : (id, data)     => api.post(`/vehicles/${id}/service-log`, data),
  getServiceLogs: (id)           => api.get(`/vehicles/${id}/service-logs`),
  compliance    : ()             => api.get('/vehicles/compliance-dashboard'),
};

// Ambulances — CRM-admin read of the mobile app's Ambulance/Assignment/
// Shift system, so an owner (or driver) on duty there shows up
// alongside legacy Vehicle records. Read-only from the CRM's side.
export const ambulancesApi = {
  getAdminList: () => api.get('/ambulances/admin'),
};

// Billing
export const billingApi = {
  getBills         : (params) => api.get('/billing/bills', { params }),
  getBill          : (id)     => api.get(`/billing/bills/${id}`),
  recordPayment    : (id, d)  => api.put(`/billing/bills/${id}/payment`, d),
  generateInvoice  : (data)   => api.post('/billing/hospital-invoice/generate', data),
  getInvoices      : (params) => api.get('/billing/hospital-invoices', { params }),
  updateInvoice    : (id, status) => api.put(`/billing/hospital-invoices/${id}/status`, { status }),
  dashboard        : ()       => api.get('/billing/dashboard'),
};

// Finance
export const financeApi = {
  getExpenses : (params) => api.get('/finance/expenses', { params }),
  addExpense  : (data)   => api.post('/finance/expenses', data),
  getIncome   : (params) => api.get('/finance/income', { params }),
  addIncome   : (data)   => api.post('/finance/income', data),
  getLoans    : ()       => api.get('/finance/loans'),
  addLoan     : (data)   => api.post('/finance/loans', data),
  recordEmi   : (id)     => api.put(`/finance/loans/${id}/record-emi`),
  summary     : (params) => api.get('/finance/summary', { params }),
};

// Salary
export const salaryApi = {
  calculate  : (month, year) => api.post(`/salary/calculate/${month}/${year}`),
  getSummary : (month, year) => api.get(`/salary/summary/${month}/${year}`),
  getPayslip : (dId, m, y)   => api.get(`/salary/${dId}/${m}/${y}`),
  approve    : (id)           => api.put(`/salary/${id}/approve`),
  markPaid   : (id, mode)     => api.put(`/salary/${id}/mark-paid`, { paymentMode: mode }),
  deductions : (id, data)     => api.put(`/salary/${id}/deductions`, data),
};

// Attendance
export const attendanceApi = {
  clockIn   : (data) => api.post('/attendance/clock-in', data),
  clockOut  : ()     => api.post('/attendance/clock-out'),
  checklist : (data) => api.post('/attendance/shift-checklist', data),
  getRecords: (dId, params) => api.get(`/attendance/${dId}`, { params }),
};

// Leads
export const leadsApi = {
  getAll : (params) => api.get('/leads', { params }),
  update : (id, d)  => api.put(`/leads/${id}`, d),
};

// Hospitals
export const hospitalsApi = {
  getAll : ()     => api.get('/hospitals'),
  create : (data) => api.post('/hospitals', data),
  update : (id,d) => api.put(`/hospitals/${id}`, d),
};

// SOS / emergency alerts — driver-triggered, resolved by CRM ops.
export const sosApi = {
  getAll : ()   => api.get('/sos'),
  resolve: (id) => api.patch(`/sos/${id}/resolve`),
};

// Trip call events — telemetry for the dispatch push -> driver response
// pipeline (medifleet-backend's TripCallEvent, added alongside the
// self-managed Telecom ConnectionService work). type omitted returns
// everything (persisted events + the live NO_RESPONSE snapshot); type:
// 'NO_RESPONSE' alone returns just the live snapshot, cheaply, for the
// nav badge.
export const tripCallEventsApi = {
  getAll: (params) => api.get('/trip-call-events', { params }),
};

// Fixed-posting geofence events (medifleet-backend's GeofenceEvent) —
// warning/recording only, no salary or notification tied to these yet.
export const geofenceEventsApi = {
  getAll: (params) => api.get('/geofence-events', { params }),
};

// Owners — KYC review (Owner model, distinct from the CRM's own User
// staff; these hit /api/owners, gated by protect+authorize('owner') on
// the backend, same role as this CRM session, not the fleet-Owner's own
// app login).
export const ownersApi = {
  getAll : ()          => api.get('/owners'),
  approve: (id)        => api.put(`/owners/${id}/approve`),
  reject : (id, reason) => api.put(`/owners/${id}/reject`, { reason }),
};

// WhatsApp leads — customers who asked for a service with no working
// backendCode (see whatsappServiceCatalog.js on the backend), or hit a
// pricing failure, via the WhatsApp booking bot. Separate from leadsApi
// (the ads-specific Lead model) — status is only new/contacted/closed.
export const whatsappLeadsApi = {
  getAll      : (params)      => api.get('/whatsapp-leads', { params }),
  updateStatus: (id, status)  => api.patch(`/whatsapp-leads/${id}/status`, { status }),
};

// WhatsApp conversations — every distinct phone active in the booking bot's
// funnel window (medifleet-backend's routes/whatsappRoutes.js /conversations),
// whether they're still live, dropped off mid-flow, or completed a booking.
// Separate from whatsappLeadsApi above (WhatsAppLead — only the
// no-backendCode/pricing-failure dead-ends) and from /funnel (aggregate
// step counts, not one row per conversation).
export const whatsappConversationsApi = {
  getAll    : (params) => api.get('/whatsapp/conversations', { params }),
  // Logs an ops call-back outcome (medifleet-backend's POST /call-outcome) —
  // body: { phone, outcome, followUpAt?, note?, tripId? }.
  logOutcome: (body)   => api.post('/whatsapp/call-outcome', body),
};

// Full permanent call/conversation/trip history for one customer, phone-
// normalised on the backend (medifleet-backend's GET /customer/:phone) —
// no date limit, unlike whatsappConversationsApi.getAll above.
export const whatsappCustomerApi = {
  get: (phone) => api.get(`/whatsapp/customer/${encodeURIComponent(phone)}`),
};

// SEO draft pipeline (medifleet-backend routes/seo.js) — owner-only, and
// nothing here touches savelife.health. Generation is deliberately slow:
// the backend makes two Claude calls plus a similarity sweep, so `generate`
// gets its own long timeout rather than the client default.
//
// The ANTHROPIC_API_KEY lives only in the backend's Render environment. It is
// never sent to, stored in, or read by this app — the browser only ever sees
// the generated draft that comes back.
export const seoApi = {
  generate  : (body)          => api.post('/seo/generate', body, { timeout: 300000 }),
  getAll    : (params)        => api.get('/seo/articles', { params }),
  getById   : (id)            => api.get(`/seo/articles/${id}`),
  update    : (id, body)      => api.put(`/seo/articles/${id}`, body),
  setStatus : (id, body)      => api.put(`/seo/articles/${id}/status`, body),
  // Re-runs every quality gate over an article after a human edit. Slow for
  // the same reason generate is — it makes a Claude fact-check call — so it
  // needs the long timeout rather than the client default.
  recheck   : (id)            => api.post(`/seo/articles/${id}/recheck`, {}, { timeout: 300000 }),
  // Rewrites the blocking claims the last recheck raised, plus a meta
  // description outside its length band. One Claude call, so the same long
  // timeout as recheck and generate.
  repair    : (id)            => api.post(`/seo/articles/${id}/repair`, {}, { timeout: 300000 }),
  // Repair -> recheck, up to twice. Four Claude calls at worst, so it gets
  // the longest timeout of the three.
  autoRepair: (id)            => api.post(`/seo/articles/${id}/auto-repair`, {}, { timeout: 600000 }),
  remove    : (id)            => api.delete(`/seo/articles/${id}`),
  facts     : ()              => api.get('/seo/facts'),
};
