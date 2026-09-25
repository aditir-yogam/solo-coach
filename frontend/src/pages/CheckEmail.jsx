import { useState } from 'react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import { BrandMark } from '../components/Brand';
import { MailIcon } from '../components/Icons';
import { api } from '../lib/api';

// Shown after the magic link is sent. Not in the wireframes; styled like the
// fallback-state screens so the flow feels continuous.
export default function CheckEmail() {
  const { state } = useLocation();
  const [resent, setResent] = useState('');
  const [sending, setSending] = useState(false);

  if (!state?.email) return <Navigate to="/join" replace />;

  async function resend() {
    setSending(true);
    setResent('');
    try {
      await api.requestMagicLink(state.name || '', state.email, state.org || '');
      setResent('A new link is on its way.');
    } catch (err) {
      setResent(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="center-page">
      <div className="center-card">
        <BrandMark />
        <div className="status-icon">
          <MailIcon />
        </div>
        <div className="center-copy">
          <h2>Check your email</h2>
          <p>
            We sent a sign-in link to <strong style={{ color: 'var(--ink)' }}>{state.email}</strong>. Click it to continue —
            it works once and is valid for 24 hours.
          </p>
        </div>
        <div className="center-actions">
          <button type="button" className="btn btn-primary" onClick={resend} disabled={sending}>
            {sending && <span className="spinner" aria-hidden="true" />}
            {sending ? 'Sending…' : 'Resend link'}
          </button>
          <Link to={state.org ? `/join?org=${encodeURIComponent(state.org)}` : '/join'} className="btn btn-secondary">
            Use a different email
          </Link>
        </div>
        <p className="support-link" role="status" aria-live="polite">
          {resent}
        </p>
        <p className="field-help">
          Local demo: emails arrive in Mailpit at{' '}
          <a href="http://localhost:8025" target="_blank" rel="noreferrer">
            localhost:8025
          </a>
        </p>
      </div>
    </main>
  );
}
