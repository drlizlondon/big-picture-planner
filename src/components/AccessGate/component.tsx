import React, { useEffect, useState } from 'react';
import { getAccessState, redeemCode, subscribeToAccessChanges, type AccessState } from '../../services/accessService';
import { signInWithApple, signInWithGoogle, sendMagicLink, getCurrentSession, getSupabaseClient } from '../../services/supabaseClient';
import { signOut } from '../../services/syncService';
import { getAppHref, getSiteHref } from '../../utils/deploymentPaths';
import { track } from '../../services/analytics';
import { AppleMark, GoogleMark, AuthLegal } from './authBits';

interface Props {
  children: React.ReactNode;
}

/**
 * Free for everyone: the planner is always usable, and signing in only
 * saves/syncs. The invite-code + paid-trial gating is preserved below but
 * disabled — flip PREMIUM_GATING to re-enable invite-only access later.
 */
const PREMIUM_GATING = false;

export const AccessGate: React.FC<Props> = ({ children }) => {
  const [access, setAccess] = useState<AccessState>({ status: 'loading' });

  const refresh = async () => {
    const state = await getAccessState();
    setAccess(state);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load of access state on mount
    void refresh();
    const unsub = subscribeToAccessChanges(refresh);
    // Re-evaluate access the moment Supabase establishes/refreshes/clears the
    // session (e.g. straight after the OAuth redirect), so a fresh sign-in
    // immediately starts syncing without a second prompt.
    const { data: authSub } = getSupabaseClient()?.auth.onAuthStateChange(() => {
      void refresh();
    }) ?? { data: undefined };
    return () => {
      unsub();
      authSub?.subscription.unsubscribe();
    };
  }, []);

  // ── Preserved premium gating (disabled) ──────────────────────────────────
  // When PREMIUM_GATING is on, the planner is invite-only behind sign-in +
  // access code + paid trial. Kept intact for a future premium tier.
  if (PREMIUM_GATING) {
    if (access.status === 'unconfigured' || access.status === 'loading') return <>{children}</>;
    if (access.status === 'unauthenticated') return <SignInScreen onSignedIn={refresh} />;
    if (access.status === 'no_access') return <CodeEntryScreen onRedeemed={refresh} />;
    if (access.status === 'expired') return <TrialExpiredScreen />;
  }

  // ── Free for everyone ────────────────────────────────────────────────────
  // The planner is always shown. We only overlay save/sync prompts and the
  // entitlement banners on top of it.
  return (
    <>
      {access.status === 'unauthenticated' && <SavePlannerBanner />}
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
    track({ type: 'sign_in_started', method: 'google' });
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

  const handleApple = async () => {
    setIsSubmitting(true);
    setError(null);
    track({ type: 'sign_in_started', method: 'apple' });
    try {
      await signInWithApple();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start Apple sign-in.';
      console.error('[auth] Apple sign-in failed:', message);
      setError(message);
      setIsSubmitting(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    setError(null);
    track({ type: 'sign_in_started', method: 'email' });
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
          <h1 className="text-[28px] font-bold text-text-primary leading-tight">Save your planner</h1>
          <p className="mt-3 text-[14px] leading-5 text-text-secondary">
            Continue to save your progress and pick up your planner from any device.
          </p>
        </div>

        <div className="rounded-large border border-border-default bg-surface-primary p-5 shadow-card space-y-3">
          <button
            onClick={handleApple}
            disabled={isSubmitting}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-small border border-border-default bg-surface-primary text-[14px] font-bold text-text-primary hover:bg-surface-secondary disabled:opacity-60 transition-colors"
          >
            <AppleMark />
            Continue with Apple
          </button>
          <button
            onClick={handleGoogle}
            disabled={isSubmitting}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-small border border-border-default bg-surface-primary text-[14px] font-bold text-text-primary hover:bg-surface-secondary disabled:opacity-60 transition-colors"
          >
            <GoogleMark />
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
                {isSubmitting ? 'Sending…' : 'Continue with Email'}
              </button>
            </form>
          )}
          {error && <p className="text-[12px] text-semantic-error font-semibold">{error}</p>}
          <AuthLegal className="pt-1" />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-[12px] font-bold">
          <a href={getAppHref('')} className="text-accent-primary hover:underline">Keep planning without saving</a>
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

// ─── Save Planner Banner ───────────────────────────────────────────────────
// Shown to signed-out users: the planner already works on this device; signing
// in just saves progress so it follows them across devices. Dismissible.

const SAVE_BANNER_DISMISS_KEY = 'bpp_save_banner_dismissed';

const SavePlannerBanner: React.FC = () => {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(SAVE_BANNER_DISMISS_KEY) === '1'; } catch { return false; }
  });
  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(SAVE_BANNER_DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  return (
    <div className="bg-accent-primary/10 border-b border-accent-primary/20 px-4 py-2 flex items-center justify-center gap-3 flex-wrap text-center">
      <p className="text-[12px] font-semibold text-text-primary">
        Your planner is saved on this device. Sign in to keep it across your phone, laptop and tablet.
      </p>
      <a
        href={getAppHref('sign-in?src=save_banner')}
        className="text-[12px] font-bold text-white bg-accent-primary rounded-small px-3 py-1 hover:bg-accent-hover transition-colors"
      >
        Save your planner
      </a>
      <button
        onClick={dismiss}
        className="text-[12px] font-bold text-text-secondary hover:text-text-primary"
        aria-label="Dismiss"
      >
        Not now
      </button>
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
