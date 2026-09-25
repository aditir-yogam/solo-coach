import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandPanel, PageLoading } from '../components/Brand';
import { SparkIcon, PersonIcon, CalendarIcon } from '../components/Icons';
import { api } from '../lib/api';

const MIN = 8;

const POINTS = [
  { icon: <SparkIcon />, text: 'Your bio is drafted automatically from your website or resume.' },
  { icon: <PersonIcon />, text: 'Next time, log in with your email and this password — no new link needed.' },
  { icon: <CalendarIcon />, text: 'A live portfolio page is ready before your first client call.' },
];

// Epic 1 addendum, Story 1. Reached from the one-time magic link. The coach is
// still 'pending' here; saving a matching password stores it (hashed) in the
// dev-only credentials table, makes the account active and continues to Page 2.
// Mismatched passwords are blocked inline and nothing is sent.
export default function SetPassword() {
  const navigate = useNavigate();
  const [setup, setSetup] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api
      .passwordSetup()
      .then((data) => alive && setSetup(data))
      .catch(() => alive && navigate('/signin/error?reason=expired&provider=email', { replace: true }));
    return () => {
      alive = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (setup) passwordRef.current?.focus();
  }, [setup]);

  const tooShort = password.length > 0 && password.length < MIN;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= MIN && password === confirm && !submitting;

  async function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    setFormError('');
    if (!canSubmit) return; // blocked inline: nothing is sent, nothing saved
    setSubmitting(true);
    try {
      const res = await api.setPassword(password, confirm);
      navigate(res.redirect || '/personalize', { replace: true });
    } catch (err) {
      if (err.code === 'setup_expired' || err.code === 'password_exists') {
        navigate('/signin/error?reason=expired&provider=email', { replace: true });
        return;
      }
      setFormError(err.message);
      setSubmitting(false);
    }
  }

  if (!setup) return <PageLoading />;

  return (
    <div className="onboarding">
      <BrandPanel title="Your email is confirmed." subtitle="One last thing before we set up your profile." points={POINTS} />
      <main className="form-panel">
        <div className="form-column form-column--signup">
          <div className="page-heading">
            <h2>Set your password</h2>
            <p>
              For <strong>{setup.email}</strong>. You'll use it to log in next time.
            </p>
          </div>

          <form className="fields" onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="new-password">
                Password
              </label>
              <input
                ref={passwordRef}
                id="new-password"
                className="input"
                type="password"
                autoComplete="new-password"
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={tooShort && touched}
                aria-describedby="new-password-help"
              />
              <p className={tooShort && touched ? 'field-error' : 'field-help'} id="new-password-help">
                At least {MIN} characters.
              </p>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="confirm-password">
                Confirm password
              </label>
              <input
                id="confirm-password"
                className="input"
                type="password"
                autoComplete="new-password"
                maxLength={128}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={mismatch}
                aria-describedby={mismatch ? 'confirm-password-error' : undefined}
              />
              {mismatch && (
                <p className="field-error" id="confirm-password-error" data-testid="password-mismatch">
                  Passwords don't match.
                </p>
              )}
            </div>

            {formError && (
              <div className="alert" role="alert">
                {formError}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={!canSubmit} style={{ marginTop: 10 }}>
              {submitting && <span className="spinner" aria-hidden="true" />}
              {submitting ? 'Saving…' : 'Set password and continue'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
