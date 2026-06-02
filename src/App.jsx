// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

// Layout
import Shell from './components/Shell';

// Auth
import LoginPage from './pages/LoginPage';

// Owner / Telecaller pages
import DashboardPage   from './pages/DashboardPage';
import DispatchPage    from './pages/DispatchPage';
import FleetPage       from './pages/FleetPage';
import TripsPage       from './pages/TripsPage';
import BillingPage     from './pages/BillingPage';
import FinancePage     from './pages/FinancePage';
import SalaryPage      from './pages/SalaryPage';
import LeadsPage       from './pages/LeadsPage';
import CompliancePage  from './pages/CompliancePage';
import StaffPage       from './pages/Staff';
import AdvancePage     from './pages/AdvancePage';
import HospitalsPage   from './pages/HospitalsPage';

// Driver mobile app pages
import DriverApp       from './pages/driver/DriverApp';

// ── Route guard ──────────────────────────────────────────────
const ProtectedRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user)   return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

const FullScreenLoader = () => (
  <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--ink)' }}>
    <div className="flex flex-col items-center gap-4">
      <div className="text-4xl">🚑</div>
      <div className="text-sm font-mono" style={{ color: 'var(--accent)' }}>MediFleet CRM</div>
      <div className="flex gap-1 mt-2">
        {[0,1,2].map(i => (
          <div key={i} className="w-2 h-2 rounded-full pulse-dot"
            style={{ background: 'var(--accent)', animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  </div>
);

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      {/* Driver mobile app — standalone layout */}
      <Route path="/driver/*" element={
        <ProtectedRoute roles={['driver']}>
          <DriverApp />
        </ProtectedRoute>
      } />

      {/* Admin shell — Owner & Telecaller */}
      <Route path="/*" element={
        <ProtectedRoute roles={['owner', 'telecaller']}>
          <Shell>
            <Routes>
              <Route index element={<DashboardPage />} />
              <Route path="dispatch"   element={<DispatchPage />} />
              <Route path="fleet"      element={<FleetPage />} />
              <Route path="trips"      element={<TripsPage />} />
              <Route path="billing"    element={<BillingPage />} />
              <Route path="finance"    element={
                <ProtectedRoute roles={['owner']}>
                  <FinancePage />
                </ProtectedRoute>
              } />
              <Route path="salary"     element={
                <ProtectedRoute roles={['owner']}>
                  <SalaryPage />
                </ProtectedRoute>
              } />
              <Route path="leads"      element={<LeadsPage />} />
             <Route path="advances"   element={
                <ProtectedRoute roles={['owner']}>
                  <AdvancePage />
                </ProtectedRoute>
              } />
              <Route path="staff"      element={
                <ProtectedRoute roles={['owner']}>
                  <StaffPage />
                </ProtectedRoute>
              } />
              <Route path="compliance" element={
                <ProtectedRoute roles={['owner']}>
                  <CompliancePage />
                </ProtectedRoute>
              } />
              <Route path="hospitals"  element={
                <ProtectedRoute roles={['owner']}>
                  <HospitalsPage />
                </ProtectedRoute>
              } />
              <Route path="*"          element={<Navigate to="/" replace />} />
            </Routes>
          </Shell>
        </ProtectedRoute>
      } />
    </Routes>
  );
}
