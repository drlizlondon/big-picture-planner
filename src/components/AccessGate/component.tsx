import React, { useEffect, useState } from 'react';
import { getAccessState, redeemCode, subscribeToAccessChanges, type AccessState } from '../../services/accessService';
import { signInWithGoogle, sendMagicLink, getCurrentSession } from '../../services/supabaseClient';
import { signOut } from '../../services/syncService';

interface Props {
  children: React.ReactNode;
}

export const AccessGate: React.FC<Props> = ({ children }) => {
  const [access, setAccess] = useState<AccessState>({ status: 'loading' });

  const refresh = async () => {
    const state = await getAccessState();
    setAccess(state);
  };

  useEffect(() => {
    void refresh();
    const unsub = subscribeToAccessChanges(refresh);
    return unsub;
  }, []);

  // Unconfigured (no Supabase) or loading — just show the app
  if (access.status === 'unconfigured' || access.status === 'loading') {
    return <>{children}</>;
  }

  // Not logged in — show sign-in screen
  if (access.status === 'unauthenticated') {
    return <SignInScreen onSignedIn={refresh} />;
  }

  // Logged in but no code entered yet
  if (access.status === 'no_access') {
    return <CodeEntryScreen onRedeemed={refresh} />;
  }

  // Trial active or paid — show the app
  if (access.status === 'trial' || access.status === 'paid') {
    return (
      <>
        {access.status === 'trial' && access.daysRemaining !== undefined && access.daysRemaining <= 7 && (
          <TrialBanner daysRemaining={access.daysRemaining} />
        )}
        {children}
      </>
    );
  }

  // Trial expired
  if (access.status === 'expired') {
    return <TrialExpiredScreen />;
  }

  return <>{children}</>;
};

// ─── Sign In Screen ────────────────────────────────────────────────────────────

const SignInScreen: React.FC<{ onSignedIn: () => void }> = ({ onSignedIn: _ }) => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setIsSubmitting(true);
    try { await signInWithGoogle(); } catch { setIsSubmitting(false); }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await sendMagicLink(email.trim());
      setSent(true);
    } catch {
      setError('Could not send link. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-[13px] font-bold uppercase tracking-widest text-text-secondary mb-2">Big Picture Planner</div>
          <h1 className="text-[28px] font-bold text-text-primary leading-tight">Sign in to access<br />your planner</h1>
        </div>

        <div className="rounded-large border border-border-default bg-surface-primary p-5 shadow-card space-y-3">
          <button
            onClick={handleGoogle}
            disabled={isSubmitting}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-small border border-border-default bg-surface-primary text-[14px] font-bold text-text-primary hover:bg-surface-secondary disabled:opacity-60 transition-colors"
          >
            <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
              <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border-default" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">or</span>
            <div className="h-px flex-1 bg-border-default" />
          </div>

          {sent ? (
            <div className="rounded-small bg-semantic-success/10 border border-semantic-success/30 p-3 text-[13px] font-semibold text-text-primary text-center">
              Check your email for a sign-in link.
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                className="h-11 w-full rounded-small border border-border-default px-3 text-[15px] outline-none focus:border-accent-primary"
              />
              <button
                type="submit"
                disabled={isSubmitting || !email.trim()}
                className="h-11 w-full rounded-small bg-accent-primary text-[14px] font-bold text-white disabled:opacity-60"
              >
                {isSubmitting ? 'Sending...' : 'Email me a sign-in link'}
              </button>
            </form>
          )}
          {error && <p className="text-[12px] text-semantic-error font-semibold">{error}</p>}
        </div>

        <p className="mt-4 text-center text-[12px] text-text-muted">
          Don&apos;t have a code yet?{' '}
          <a href="https://drlizlondon.github.io/bigpictureplanner-landing/" className="text-accent-primary font-bold hover:underline">Join the waitlist</a>
        </p>
      </div>
    </div>
  );
};

// ─── Code Entry Screen ─────────────────────────────────────────────────────────

const CodeEntryScreen: React.FC<{ onRedeemed: () => void }> = ({ onRedeemed }) => {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    getCurrentSession().then(s => setUserEmail(s?.user.email ?? ''));
  }, []);

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setIsSubmitting(true);
    setError(null);

    const result = await redeemCode(code);
    if (result.ok) {
      onRedeemed();
    } else {
      setError(result.error ?? 'Something went wrong.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-[28px] mb-2">&#x1F9E9;</div>
          <h1 className="text-[28px] font-bold text-text-primary leading-tight">Enter your access code</h1>
          <p className="mt-2 text-[14px] text-text-secondary">
            {userEmail ? `Signed in as ${userEmail}` : 'Check your invitation email for your code.'}
          </p>
        </div>

        <div className="rounded-large border border-border-default bg-surface-primary p-5 shadow-card">
          <form onSubmit={handleRedeem} className="space-y-3">
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. A1B2C3D4"
              maxLength={12}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="h-14 w-full rounded-small border border-border-default px-4 text-[22px] font-bold tracking-[0.15em] text-center font-mono outline-none focus:border-accent-primary uppercase"
            />
            <button
              type="submit"
              disabled={isSubmitting || code.trim().length < 6}
              className="h-11 w-full rounded-small bg-accent-primary text-[14px] font-bold text-white disabled:opacity-60"
            >
              {isSubmitting ? 'Checking...' : 'Redeem code & start free trial'}
            </button>
          </form>

          {error && (
            <p className="mt-3 text-[13px] font-semibold text-semantic-error text-center">{error}</p>
          )}
        </div>

        <div className="mt-4 text-center space-y-2">
          <p className="text-[12px] text-text-muted">
            No code yet?{' '}
            <a href="https://drlizlondon.github.io/bigpictureplanner-landing/" className="text-accent-primary font-bold hover:underline">Join the waitlist</a>
          </p>
          <button onClick={() => signOut()} className="text-[12px] text-text-muted hover:text-text-secondary">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Trial Banner ──────────────────────────────────────────────────────────────

const TrialBanner: React.FC<{ daysRemaining: number }> = ({ daysRemaining }) => (
  <div className="bg-accent-primary px-4 py-2 text-center">
    <p className="text-[12px] font-bold text-white">
      {daysRemaining === 0
        ? 'Your free trial ends today.'
        : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left in your free trial.`}
      {' '}<a href="mailto:hello@bigpictureplanner.app" className="underline">Get in touch to keep access.</a>
    </p>
  </div>
);

// ─── Trial Expired Screen ──────────────────────────────────────────────────────

const TrialExpiredScreen: React.FC = () => (
  <div className="min-h-dvh bg-background flex items-center justify-center p-4">
    <div className="w-full max-w-sm text-center">
      <div className="text-[40px] mb-4">&#x23F0;</div>
      <h1 className="text-[28px] font-bold text-text-primary mb-3">Your free trial has ended</h1>
      <p className="text-[15px] text-text-secondary leading-relaxed mb-6">
        Your 28-day free trial has ended. Get in touch and we&apos;ll sort you out with a founder price.
      </p>
      <a
        href="mailto:hello@bigpictureplanner.app?subject=I want to keep my Big Picture Planner"
        className="inline-flex h-11 items-center justify-center rounded-small bg-accent-primary px-6 text-[14px] font-bold text-white"
      >
        Get in touch to continue &rarr;
      </a>
      <div className="mt-4">
        <button onClick={() => signOut()} className="text-[12px] text-text-muted hover:text-text-secondary">
          Sign out
        </button>
      </div>
    </div>
  </div>
);
