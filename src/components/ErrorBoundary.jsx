// src/components/ErrorBoundary.jsx
import React from 'react';

// Top-level safety net — without this, any render-time crash (a bad
// import, a null-property access, anything) unmounts the whole app to
// a blank dark screen with no clue why, since #root just ends up empty.
// Class component is required here — error boundaries have no hook
// equivalent yet.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--ink)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: 'var(--ink2)', border: '1px solid rgba(255,77,109,.3)' }}>
            <h1 className="text-lg font-bold mb-2" style={{ color: 'var(--red)' }}>Something went wrong</h1>
            <p className="text-sm mb-4" style={{ color: 'var(--text2)' }}>
              This page hit an error instead of loading. Reloading usually fixes a stale-bundle issue;
              if it keeps happening, share the message below.
            </p>
            <pre className="text-xs p-3 rounded-lg overflow-x-auto"
              style={{ background: 'var(--ink3)', color: 'var(--text3)', whiteSpace: 'pre-wrap' }}>
              {String(this.state.error?.message || this.state.error)}
            </pre>
            <button onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--accent)', color: 'var(--ink)' }}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
