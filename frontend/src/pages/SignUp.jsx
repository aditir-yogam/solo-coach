import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BrandPanel, StepIndicator } from '../components/Brand';
import { SparkIcon, PersonIcon, CalendarIcon, GoogleLogo, LinkedinLogo } from '../components/Icons';
import { api } from '../lib/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Left-panel copy: verbatim from "Page 1 — Sign up & sources.html".
const POINTS = [
  { icon: <SparkIcon />, text: 'Your bio is drafted automatically from your website or resume.' },
  { icon: <PersonIcon />, text: 'Your photo comes across automatically if you sign in with Google or LinkedIn.' },
  { icon: <CalendarIcon />, text: 'A live portfolio page is ready before your first client call.' },
];

// Page 1 (Story 2). Copy per the epic: no password field, magic-link helper
// text, "Send me a sign-in link", "Step 1 of 2 — Create your account".
// Tenancy: /join -> solo coach; /join?org=<code> -> institute coach (the code
// travels with every sign-in path and is resolved on the server).
export default function SignUp() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loginMode, setLoginMode] = useState(params.get('login') === '1');
  const org = params.get('org') || '';
  const orgQuery = org ? `?org=${encodeURIComponent(org)}` : '';
  const emailRef = useRef(null);
  const nameRef = useRef(null);

  useEffect(() => {
    if (params.get('focus') === 'email' || params.get('login') === '1') emailRef.current?.focus();
  }, [params]);

  function validate() {
    const next = {};
    if (!loginMode && !name.trim()) next.name = 'Please enter your full name.';
    if (!email.trim()) next.email = 'Please enter your email address.';
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Please enter a valid email address.';
    setErrors(next);
    if (next.name) nameRef.current?.focus();
    else if (next.email) emailRef.current?.focus();
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setFormError('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await api.requestMagicLink(name.trim(), email.trim(), org);
      navigate('/check-email', { state: { email: res.email, name: name.trim(), org } });
    } catch (err) {
      if (err.code === 'account_conflict') {
        navigate('/signin/error?reason=conflict&provider=email');
        return;
      }
      if (err.code === 'org_invalid') {
        navigate('/signin/error?reason=provider&provider=email');
        return;
      }
      if (err.code === 'name_required') {
        setLoginMode(false);
        setErrors({ name: err.message });
        nameRef.current?.focus();
      } else if (err.code?.startsWith('email')) {
        setErrors({ email: err.message });
      } else {
        setFormError(err.message);
      }
      setSubmitting(false);
    }
  }

  function switchToLogin() {
    setLoginMode(true);
    setErrors({});
    emailRef.current?.focus();
  }

  return (
    <div className="onboarding">
      <BrandPanel
        title="Set up your coach profile in minutes."
        subtitle="A few details now — we'll draft the rest for you."
        points={POINTS}
      />
      <main className="form-panel">
        <div className="form-column form-column--signup">
          <StepIndicator step={1} total={2} label="Create your account" />

          <div className="page-heading">
            <h2>Create your coach profile</h2>
            <p>Takes about a minute. You can add more next.</p>
          </div>

          <form className="fields" onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="fullname">
                Full name {loginMode && <span className="optional">(optional when logging in)</span>}
              </label>
              <input
                ref={nameRef}
                id="fullname"
                className="input"
                type="text"
                placeholder="Jordan Blake"
                autoComplete="name"
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'fullname-error' : undefined}
              />
              {errors.name && (
                <p className="field-error" id="fullname-error">
                  {errors.name}
                </p>
              )}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="email">
                Email
              </label>
              <input
                ref={emailRef}
                id="email"
                className="input"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : 'email-help'}
              />
              {errors.email ? (
                <p className="field-error" id="email-error">
                  {errors.email}
                </p>
              ) : (
                <p className="field-help" id="email-help">
                  No password needed — we'll email you a sign-in link. It's valid for 24 hours.
                </p>
              )}
            </div>

            {formError && (
              <div className="alert" role="alert">
                {formError}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ marginTop: 10 }}>
              {submitting && <span className="spinner" aria-hidden="true" />}
              {submitting ? 'Sending your link…' : 'Send me a sign-in link'}
            </button>
          </form>

          <div className="divider">
            <span>OR</span>
          </div>

          <div className="social-row">
            <a className="social-btn" href={`/auth/google/start${orgQuery}`}>
              <GoogleLogo />
              Google
            </a>
            <a className="social-btn" href={`/auth/linkedin/start${orgQuery}`}>
              <LinkedinLogo />
              LinkedIn
            </a>
          </div>

          <p className="muted-line">
            Already have an account?{' '}
            <button type="button" className="link-button" onClick={switchToLogin}>
              Log in
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
