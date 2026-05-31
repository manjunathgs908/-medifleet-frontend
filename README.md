# MediFleet CRM — React Frontend

## Quick Start

```bash
# Install
npm install

# Development (proxies /api to localhost:5000)
npm run dev

# Production build
npm run build
```

Open `http://localhost:3000`

---

## Folder Structure

```
src/
├── main.jsx              ← React entry, Toast provider
├── App.jsx               ← Route tree + role-based guards
├── index.css             ← Global styles + design tokens (CSS vars)
│
├── api/
│   └── client.js         ← Axios instance + auto token refresh + all API helpers
│
├── contexts/
│   └── AuthContext.jsx   ← JWT state, OTP login, password login, logout
│
├── components/
│   ├── Shell.jsx         ← Sidebar + topbar layout wrapper
│   └── ui.jsx            ← StatCard, Btn, Modal, Input, Badge, Tabs, Spinner, Empty…
│
└── pages/
    ├── LoginPage.jsx     ← Dual mode: Password (admin) + OTP (driver)
    ├── DashboardPage.jsx ← Command center with live metrics + recharts
    ├── DispatchPage.jsx  ← Booking form + live trip board + bill modal
    ├── FleetPage.jsx     ← Vehicle cards with compliance warnings
    ├── AllPages.jsx      ← TripsPage, BillingPage, FinancePage, SalaryPage,
    │                        LeadsPage, CompliancePage, HospitalsPage
    └── driver/
        └── DriverApp.jsx ← Mobile PWA: checklist, trip alerts, navigation, history
```

---

## Role-Based Access

| Route         | Owner | Telecaller | Driver      |
|---------------|-------|------------|-------------|
| /             | ✓     | ✓          |             |
| /dispatch     | ✓     | ✓          |             |
| /fleet        | ✓     | ✓          |             |
| /trips        | ✓     | ✓          |             |
| /billing      | ✓     | ✓          |             |
| /leads        | ✓     | ✓          |             |
| /finance      | ✓     |            |             |
| /salary       | ✓     |            |             |
| /compliance   | ✓     |            |             |
| /hospitals    | ✓     |            |             |
| /driver/*     |       |            | ✓ (PWA)     |

---

## Key Design Decisions

1. **OTP login redirects to `/driver`** — drivers get the mobile PWA, not the admin shell.
2. **Token auto-refresh** — Axios interceptor queues requests during refresh; no user impact.
3. **Live polling** — Dispatch board and driver app poll every 10–30s. Replace with Socket.io for real-time.
4. **Web Audio API alert** — Driver app plays a 880Hz tone when a new trip is assigned, even without native push.
5. **Checklist blocks availability** — `submitShiftChecklist` on backend sets driver status; frontend reflects it.
6. **Google Maps deep-link** — `maps.google.com/?q=ADDRESS&navigate=yes` opens turn-by-turn nav on Android.

---

## Environment

The Vite dev server proxies `/api/*` to `http://localhost:5000` (the backend).
For production, point `VITE_API_BASE` to your deployed API URL and update `client.js`.
