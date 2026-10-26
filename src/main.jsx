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
              background: '#1a2035',
              color: '#f0f4ff',
              border: '1px solid rgba(0,212,170,.3)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
            },
            success: { iconTheme: { primary: '#00d4aa', secondary: '#0a0f1e' } },
            error:   { iconTheme: { primary: '#ff4d6d', secondary: '#0a0f1e' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
