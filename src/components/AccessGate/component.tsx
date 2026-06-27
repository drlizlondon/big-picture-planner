import React, { useEffect, useState } from 'react';
import { getAccessState, redeemCode, subscribeToAccessChanges, type AccessState } from '../../services/accessService';
import { signInWithGoogle, sendMagicLink, getCurrentSession, getSupabaseClient } from '../../services/supabaseClient';
import { signOut } from '../../services/syncService';
import { getAppHref, getSiteHref } from '../../utils/deploymentPaths';

interface Props {
  children: React.ReactNode;
}

export const AccessGate: React.FC<Props> = ({ children }) => {
  const [access, setAccess] = useState<AccessState>({ status: 'loading' });

  // Demo mode: ?tour=1 or ?demo=1 lets anyone try the planner locally,
  // with no sign-in and no code. Captured once on mount so it survives
  // the OnboardingTour stripping the param from the URL afterwards.
  const [isDemo] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('tour') === '1' || params.get('demo') === '1';
    } catch {
      return false;
    }
  });

  const refresh = async () => {
    const state = await getAccessState();
    setAccess(state);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load of access state on mount
    void refresh();
    const unsub = subscribeToAccessChanges(refresh);
    // Re-evaluate access the moment Supabase establishes/refreshes/clears the
    // session (e.g. straight after the Google OAuth redirect). Without this the
    // gate could keep showing the sign-in screen after a successful login,
    // making users sign in a second time.
    const { data: authSub } = getSupabaseClient()?.auth.onAuthStateChange(() => {
      void refresh();
    }) ?? { data: undefined };
    return () => {
      unsub();
      authSub?.subscription.unsubscribe();
    };
  }, []);

  // Demo mode — show the app immediately, ungated, with a convert banner.
  if (isDemo) {
    return (
      <>
        <DemoBanner />
        {children}
      </>
    );
  }

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

  // Trial active, comped, or paid — show the app
  if (access.status === 'trial' || access.status === 'comped' || access.status === 'paid') {
    return (
      <>
        {(access.status === 'trial' || access.status === 'comped') &&
          access.daysRemaining !== undefined && access.daysRemaining <= 7 && (
          <TrialBanner daysRemaining={access.daysRemaining} />
        )}
        {access.status === 'paid' && access.inRefundWindow && (
          <RefundWindowBanner endsAt={access.refundWindowEndsAt ?? ''} />
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

const SignInScreen: React.FC<{ onSignedIn: () => void }> = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogle = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      // Surface the real reason (e.g. redirect URL not allow-listed in Supabase)
      // instead of silently doing nothing — critical for debugging native auth.
      const message = err instanceof Error ? err.message : 'Could not start Google sign-in.';
      console.error('[auth] Google sign-in failed:', message);
      setError(message);
      setIsSubmitting(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await sendMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send link. Please try again.';
      console.error('[auth] magic link failed:', message);
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-[13px] font-bold uppercase tracking-widest text-text-secondary mb-2">Big Picture Planner</div>
          <h1 className="text-[28px] font-bold text-text-primary leading-tight">Sign in to continue</h1>
          <p className="mt-3 text-[14px] leading-5 text-text-secondary">
            If you have an access code, sign in first, then enter it on the next screen. You can also try the demo without signing in.
          </p>
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

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-[12px] font-bold">
          <a href={getAppHref('?demo=1&src=signin')} className="text-accent-primary hover:underline">Try demo</a>
          <a href={getSiteHref('#request')} className="text-accent-primary hover:underline">Back to landing / request access</a>
        </div>
        <BetaNote />
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
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-[28px] mb-2">&#x1F9E9;</div>
          <h1 className="text-[28px] font-bold text-text-primary leading-tight">Enter your access code</h1>
          <p className="mt-2 text-[14px] text-text-secondary">
            {userEmail ? `Signed in as ${userEmail}` : 'Check your invitation email for your code.'}
          </p>
          <p className="mt-2 text-[13px] leading-5 text-text-muted">
            Codes may be for trial, friend/family, tester, press, or founder access.
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
              {isSubmitting ? 'Checking...' : 'Continue'}
            </button>
          </form>

          {error && (
            <p className="mt-3 text-[13px] font-semibold text-semantic-error text-center">{error}</p>
          )}
        </div>

        <BetaNote />

        <div className="mt-4 text-center space-y-2">
          <p className="text-[12px] text-text-muted">
            No code yet?{' '}
            <a href={getSiteHref('#request')} className="text-accent-primary font-bold hover:underline">Request access</a>
          </p>
          <button onClick={() => signOut()} className="text-[12px] text-text-muted hover:text-text-secondary">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Beta note (honest expectation setting) ─────────────────────────────────────

const BetaNote: React.FC = () => (
  <p className="mt-4 text-center text-[12px] leading-5 text-text-muted">
    This is early. There may be rough edges. Founder feedback directly shapes what gets built next.
  </p>
);

// ─── Demo Banner ─────────────────────────────────────────────────────────────

const DemoBanner: React.FC = () => {
  // Leaving demo = reload at the base URL (no ?tour/?demo), which drops the
  // user onto the normal sign-in / code flow.
  const exitToSignIn = () => {
    window.location.href = window.location.pathname;
  };
  return (
    <div className="bg-accent-primary px-4 py-2 flex items-center justify-center gap-3 flex-wrap text-center">
      <p className="text-[12px] font-bold text-white">
        👀 You&apos;re in demo mode. Try anything you like. Changes save only on this device.
      </p>
      <button
        onClick={exitToSignIn}
        className="text-[12px] font-bold text-accent-primary bg-white rounded-small px-3 py-1 hover:bg-white/90 transition-colors"
      >
        Have a code? Sign in
      </button>
      <a
        href={getSiteHref('#request')}
        className="text-[12px] font-bold text-white underline underline-offset-2 hover:text-white/90"
      >
        Request access
      </a>
    </div>
  );
};

// ─── Trial Banner ──────────────────────────────────────────────────────────────

const TrialBanner: React.FC<{ daysRemaining: number }> = () => (
  <div className="bg-accent-primary px-4 py-2 text-center">
    <p className="text-[12px] font-bold text-white">
      You&apos;re a Founder Beta member. Thank you for helping shape Big Picture Planner.
      {' '}<a href={getSiteHref('feedback.html?src=app')} className="underline">Share feedback</a>
    </p>
  </div>
);

// ─── Refund Window Banner ──────────────────────────────────────────────────────

const RefundWindowBanner: React.FC<{ endsAt: string }> = ({ endsAt }) => {
  // eslint-disable-next-line react-hooks/purity -- one-off display calc, fine at render
  const days = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86400000);
  return (
    <div className="bg-green-600 px-4 py-2 text-center">
      <p className="text-[12px] font-bold text-white">
        14-day no-questions refund. {days} day{days === 1 ? '' : 's'} remaining.{' '}
        <a href="mailto:hello@bigpictureplanner.app?subject=Refund request" className="underline">
          Request a refund
        </a>
      </p>
    </div>
  );
};

// ─── Trial Expired Screen ──────────────────────────────────────────────────────

const TrialExpiredScreen: React.FC = () => (
  <div className="min-h-dvh bg-background flex items-center justify-center p-4">
    <div className="w-full max-w-sm text-center">
      <div className="text-[40px] mb-4">&#x2728;</div>
      <h1 className="text-[28px] font-bold text-text-primary mb-3">Your access needs renewing</h1>
      <p className="text-[15px] text-text-secondary leading-relaxed mb-6">
        Get in touch and we&apos;ll sort out your Founding Access. £40 one-off founder price (normally £60), with a 14-day no-questions refund.
      </p>
      <a
        href="mailto:hello@bigpictureplanner.app?subject=Founding Access"
        className="inline-flex h-11 items-center justify-center rounded-small bg-accent-primary px-6 text-[14px] font-bold text-white"
      >
        Get in touch to continue
      </a>
      <div className="mt-4">
        <button onClick={() => signOut()} className="text-[12px] text-text-muted hover:text-text-secondary">
          Sign out
        </button>
      </div>
    </div>
  </div>
);
