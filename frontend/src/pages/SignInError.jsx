import { useNavigate, useSearchParams } from 'react-router-dom';
import { BrandMark } from '../components/Brand';
import { AlertIcon } from '../components/Icons';
import { getSignInCopy } from '../lib/signinCopy';

const REASONS = ['provider', 'cancelled', 'conflict', 'expired'];

// The four sign-in fallback states ("Sign-in fallback states.html").
// Reached by real triggers (provider error / cancel / conflict / expired link)
// or directly via /signin/error?reason=<reason>&provider=<provider>.
export default function SignInError() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const reason = REASONS.includes(params.get('reason')) ? params.get('reason') : 'provider';
  const provider = params.get('provider');
  const copy = getSignInCopy(reason, provider);

  function run(action) {
    switch (action) {
      case 'retry':
        window.location.assign(`/auth/${provider}/start`);
        break;
      case 'email':
        navigate('/join?focus=email');
        break;
      case 'login':
        navigate('/join?login=1');
        break;
      default:
        navigate('/join');
    }
  }

  return (
    <main className="center-page" data-signin-state={reason}>
      <div className="center-card">
        <BrandMark />
        <div className="status-icon">
          <AlertIcon />
        </div>
        <div className="center-copy">
          <h2>{copy.heading}</h2>
          <p>{copy.subtext}</p>
        </div>
        <div className="center-actions">
          <button type="button" className="btn btn-primary" onClick={() => run(copy.primary.action)}>
            {copy.primary.label}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => run(copy.secondary.action)}>
            {copy.secondary.label}
          </button>
        </div>
        <a className="support-link" href="mailto:support@example.com">
          Contact support
        </a>
      </div>
    </main>
  );
}
