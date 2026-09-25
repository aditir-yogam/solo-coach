// Copy for the four sign-in fallback states.
//
// provider / cancelled / conflict: verbatim from "Sign-in fallback states.html".
// The wireframe hard-codes a provider name ("LinkedIn" in the first two,
// "Google" in the conflict text). We substitute the provider the coach actually
// used; with no provider in the URL the wireframe's original wording is shown.
//
// expired: NOT in the wireframe (it only contains three states). The copy below
// is a placeholder written in the same tone, pending confirmation from
// Pradeepa. Replace it here when the real copy arrives.

const LABELS = { google: 'Google', linkedin: 'LinkedIn', email: 'email' };

export function getSignInCopy(reason, provider) {
  const label = LABELS[provider];
  switch (reason) {
    case 'cancelled': {
      const p = label && provider !== 'email' ? label : 'LinkedIn';
      return {
        heading: 'Sign-in cancelled',
        subtext: `You closed the window before finishing sign-in with ${p}. No account was created — you can pick up where you left off.`,
        primary: { label: 'Back to sign up', action: 'signup' },
        secondary: { label: 'Continue with email instead', action: 'email' },
      };
    }
    case 'conflict': {
      const p = label || 'Google';
      return {
        heading: 'This email is already registered',
        subtext: `An account with this email already exists using a password. Log in that way instead, or use a different email to sign up with ${p}.`,
        primary: { label: 'Log in with email & password', action: 'login' },
        secondary: { label: 'Use a different email', action: 'signup' },
      };
    }
    case 'expired':
      return {
        placeholderCopy: true,
        heading: 'This sign-in link has expired',
        subtext: "Sign-in links work once and only for 24 hours — this one can't be used anymore. Enter your email again and we'll send you a fresh link.",
        primary: { label: 'Send me a new link', action: 'email' },
        secondary: { label: 'Back to sign up', action: 'signup' },
      };
    case 'provider':
    default: {
      const p = label && provider !== 'email' ? label : 'LinkedIn';
      const retry = provider === 'google' || provider === 'linkedin' ? 'retry' : 'signup';
      return {
        // Email-link verification failing on our side (rare) shouldn't mention a social provider.
        heading: provider === 'email' ? "We couldn't finish signing you in" : `We couldn't connect to ${p}`,
        subtext:
          "Something went wrong on our end finishing sign-in — this wasn't anything you did. You can try again, or sign up with your email instead.",
        primary: { label: 'Try again', action: retry },
        secondary: { label: 'Continue with email', action: 'email' },
      };
    }
  }
}
