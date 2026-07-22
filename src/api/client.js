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
  assign      : (id, vehicleId) => api.put(`/trips/${id}/assign`, { vehicleId }),
  complete    : (id, data) => api.put(`/trips/${id}/complete`, data),
  cancel      : (id, reason)   => api.put(`/trips/${id}/cancel`, { reason }),
  updateStatus: (id, status)   => api.put(`/trips/${id}/status`, { status }),
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

// Owners — KYC review (Owner model, distinct from the CRM's own User
// staff; these hit /api/owners, gated by protect+authorize('owner') on
// the backend, same role as this CRM session, not the fleet-Owner's own
// app login).
export const ownersApi = {
  getAll : ()          => api.get('/owners'),
  approve: (id)        => api.put(`/owners/${id}/approve`),
  reject : (id, reason) => api.put(`/owners/${id}/reject`, { reason }),
};
