// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { startPwaUpdates } from './lib/pwaUpdate';
import { startInstallCapture } from './lib/installApp';
import './index.css';

// Service worker + "New version available — Reload" (see lib/pwaUpdate.jsx).
startPwaUpdates();
// Keep Chrome's install prompt for the "Install app" button (lib/installApp.jsx).
startInstallCapture();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--surface)',
              color: 'var(--text)',
              border: '1px solid var(--border2)',
              boxShadow: '0 8px 24px rgba(15,23,42,.12)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
            },
            success: { iconTheme: { primary: '#0c6b45', secondary: '#ffffff' } },
            error:   { iconTheme: { primary: '#b91c1c', secondary: '#ffffff' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
