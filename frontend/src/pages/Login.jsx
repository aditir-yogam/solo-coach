import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandPanel } from '../components/Brand';
import { SparkIcon, PersonIcon, CalendarIcon, GoogleLogo, LinkedinLogo } from '../components/Icons';
import { api } from '../lib/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const POINTS = [
  { icon: <SparkIcon />, text: 'Your bio is drafted automatically from your website or resume.' },
  { icon: <PersonIcon />, text: 'Your photo comes across automatically if you sign in with Google or LinkedIn.' },
  { icon: <CalendarIcon />, text: 'A live portfolio page is ready before your first client call.' },
];

// Epic 1 addendum, Story 2: returning coaches log in with email + password.
// Right -> straight to Portfolio (Page 2 is skipped). Wrong -> a calm inline
// message on this screen, not one of the fallback screens. Google/LinkedIn
// buttons are the same links as on Page 1. "Forgot password?" is a visible,
// non-functional stub (password reset is out of scope).
export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  function validate() {
    const next = {};
    if (!email.trim()) next.email = 'Please enter your email address.';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Please enter a valid email address.';
    if (!password) next.password = 'Please enter your password.';
    setErrors(next);
    if (next.email) emailRef.current?.focus();
    else if (next.password) passwordRef.current?.focus();
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setFormError('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await api.login(email.trim(), password);
      navigate(res.redirect || '/portfolio', { replace: true });
    } catch (err) {
      setFormError(err.status === 401 ? 'Email or password is incorrect.' : err.message);
      setPassword('');
      passwordRef.current?.focus();
      setSubmitting(false);
    }
  }

  return (
    <div className="onboarding">
      <BrandPanel
        title="Welcome back."
        subtitle="Log in to pick up where you left off."
        points={POINTS}
      />
      <main className="form-panel">
        <div className="form-column form-column--signup">
          <div className="page-heading">
            <h2>Log in</h2>
            <p>Use the email and password you set up.</p>
          </div>

          <form className="fields" onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="login-email">
                Email
              </label>
              <input
                ref={emailRef}
                id="login-email"
                className="input"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
              />
              {errors.email && (
                <p className="field-error" id="login-email-error">
                  {errors.email}
                </p>
              )}
            </div>
            <div className="field">
              <div className="field-label-row">
                <label className="field-label" htmlFor="login-password">
                  Password
                </label>
                <button type="button" className="link-button forgot-link" title="Password reset isn't available yet">
                  Forgot password?
                </button>
              </div>
              <input
                ref={passwordRef}
                id="login-password"
                className="input"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'login-password-error' : undefined}
              />
              {errors.password && (
                <p className="field-error" id="login-password-error">
                  {errors.password}
                </p>
              )}
            </div>

            {formError && (
              <div className="alert" role="alert" data-testid="login-error">
                {formError}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ marginTop: 10 }}>
              {submitting && <span className="spinner" aria-hidden="true" />}
              {submitting ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <div className="divider">
            <span>OR</span>
          </div>

          <div className="social-row">
            <a className="social-btn" href="/auth/google/start">
              <GoogleLogo />
              Google
            </a>
            <a className="social-btn" href="/auth/linkedin/start">
              <LinkedinLogo />
              LinkedIn
            </a>
          </div>

          <p className="muted-line">
            New here?{' '}
            <Link className="link-button" to="/join">
              Sign up
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
