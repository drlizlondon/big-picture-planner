import React, { useState } from 'react';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { markImportDeviceOnlyForCurrentUser, markImportLaterForCurrentUser, queueLocalImportForCurrentUser, signOut, syncPendingChanges } from '../../services/syncService';
import { sendMagicLink, signInWithGoogle } from '../../services/supabaseClient';
import { getAccountAccessState, getImportChoiceDescription } from './accountAccessCore';
import { getAppHref } from '../../utils/deploymentPaths';

const plannerHref = getAppHref();

export const AccountAccess: React.FC = () => {
  const sync = useSyncStatus();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const pageState = getAccountAccessState({
    isConfigured: sync.isConfigured,
    isLoggedIn: sync.isLoggedIn,
    needsImport: sync.needsImport,
    importDecision: sync.importDecision,
    magicLinkSent,
  });

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      await signInWithGoogle();
    } catch {
      setMessage('Could not start Google sign-in. Please try email instead.');
      setIsSubmitting(false);
    }
  };

  const handleMagicLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setMessage(null);
    try {
      await sendMagicLink(email.trim());
      setMagicLinkSent(true);
    } catch {
      setMessage('Saved on this device');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImport = async () => {
    setIsSubmitting(true);
    try {
      await queueLocalImportForCurrentUser();
      await syncPendingChanges();
      setMessage('Sync pending');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeviceOnly = async () => {
    await markImportDeviceOnlyForCurrentUser();
    setMessage('Saved on this device');
  };

  const handleDecideLater = async () => {
    await markImportLaterForCurrentUser();
    setMessage('Saved on this device');
  };

  const handleSignOut = async () => {
    await signOut();
    setMessage('Saved on this device');
  };

  return (
    <main className="min-h-dvh bg-background text-text-primary font-sans">
      <div className="mx-auto flex min-h-dvh w-full max-w-[980px] flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-3">
          <a href={plannerHref} className="text-[13px] font-bold text-text-secondary hover:text-text-primary">
            Back to planner
          </a>
          <div className="flex items-center gap-2 rounded-medium border border-border-default bg-surface-primary px-3 py-2 text-[12px] font-bold text-text-secondary shadow-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${sync.label === 'Synced' ? 'bg-green-500' : sync.label === 'Syncing' ? 'bg-accent-primary' : sync.label === 'Sync failed, retrying' ? 'bg-amber-500' : 'bg-text-muted'}`} />
            {sync.label}
          </div>
        </header>

        <section className="grid flex-1 items-center gap-6 py-8 md:grid-cols-[1fr_400px] md:py-10">
          <div className="max-w-[560px]">
            <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-text-secondary">Big Picture Planner</div>
            <h1 className="mt-3 text-[34px] font-bold leading-tight tracking-normal text-text-primary sm:text-[42px]">
              Use your planner across devices
            </h1>
            <p className="mt-4 text-[16px] leading-7 text-text-secondary">
              Save this planner to your account so you can use it on your laptop, mobile and tablet.
            </p>
          </div>

          <div className="rounded-large border border-border-default bg-surface-primary p-4 shadow-card sm:p-5">
            {pageState === 'local-only' && (
              <div className="space-y-3">
                <h2 className="text-[18px] font-bold text-text-primary">Saved on this device</h2>
                <p className="text-[14px] leading-6 text-text-secondary">
                  Your planner is ready to use here. Account sync is not available in this version.
                </p>
                <a href={plannerHref} className="inline-flex min-h-10 items-center justify-center rounded-small bg-accent-primary px-4 py-2 text-[13px] font-bold text-white">
                  Continue planning
                </a>
              </div>
            )}

            {(pageState === 'email-entry' || pageState === 'magic-link-sent') && (
              <div className="space-y-3">
                <h2 className="text-[18px] font-bold text-text-primary">Sign in</h2>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSubmitting}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-small border border-border-default bg-surface-primary px-4 py-2 text-[14px] font-bold text-text-primary hover:bg-surface-secondary disabled:opacity-60"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
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
                <form onSubmit={handleMagicLink} className="space-y-3">
                  <p className="text-[14px] leading-6 text-text-secondary">
                    Enter your email and we'll send you a sign-in link.
                  </p>
                  <label className="block text-[12px] font-bold uppercase tracking-[0.04em] text-text-primary" htmlFor="account-email">Email</label>
                  <input
                    id="account-email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    autoComplete="email"
                    className="h-12 w-full rounded-small border border-border-default px-3 text-[16px] outline-none focus:border-accent-primary"
                    placeholder="you@example.com"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !email.trim()}
                    className="min-h-11 w-full rounded-small bg-accent-primary px-4 py-2 text-[14px] font-bold text-white disabled:opacity-60"
                  >
                    {isSubmitting ? 'Syncing' : 'Send sign-in link'}
                  </button>
                  {pageState === 'magic-link-sent' && (
                    <p className="rounded-small border border-semantic-success/30 bg-semantic-success/10 p-3 text-[13px] font-semibold text-text-primary">
                      Sign-in link sent. You can keep planning on this device while you check your email.
                    </p>
                  )}
                </form>
              </div>
            )}

            {pageState === 'import-choice' && (
              <ImportChoicePanel onImport={handleImport} onDeviceOnly={handleDeviceOnly} onDecideLater={handleDecideLater} isSubmitting={isSubmitting} />
            )}

            {pageState === 'decide-later' && (
              <div className="space-y-3">
                <h2 className="text-[18px] font-bold text-text-primary">Decide later</h2>
                <p className="text-[14px] leading-6 text-text-secondary">
                  Your local planner is still on this device. You can come back here when you are ready.
                </p>
                <ImportChoicePanel onImport={handleImport} onDeviceOnly={handleDeviceOnly} onDecideLater={handleDecideLater} isSubmitting={isSubmitting} compact />
              </div>
            )}

            {pageState === 'signed-in' && (
              <div className="space-y-3">
                <h2 className="text-[18px] font-bold text-text-primary">Signed in</h2>
                <p className="text-[14px] leading-6 text-text-secondary">
                  {sync.userEmail ? `${sync.userEmail} is connected.` : 'This planner is connected to your account.'}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <a href={plannerHref} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-small bg-accent-primary px-4 py-2 text-[13px] font-bold text-white">
                    Continue planning
                  </a>
                  <button onClick={handleSignOut} className="min-h-10 flex-1 rounded-small border border-border-default bg-surface-primary px-4 py-2 text-[13px] font-bold text-text-primary">
                    Sign out
                  </button>
                </div>
              </div>
            )}

            {message && (
              <p className="mt-4 text-[13px] font-semibold text-text-secondary">{message}</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

interface ImportChoicePanelProps {
  onImport: () => void;
  onDeviceOnly: () => void;
  onDecideLater: () => void;
  isSubmitting: boolean;
  compact?: boolean;
}

const ImportChoicePanel: React.FC<ImportChoicePanelProps> = ({ onImport, onDeviceOnly, onDecideLater, isSubmitting, compact = false }) => (
  <div className="space-y-3">
    {!compact && (
      <>
        <h2 className="text-[18px] font-bold text-text-primary">Choose what happens to this planner</h2>
        <p className="text-[14px] leading-6 text-text-secondary">
          You are signed in. Choose whether this device&apos;s planner should be added to your account.
        </p>
      </>
    )}
    <ChoiceButton title="Import local planner into account" description={getImportChoiceDescription('import')} onClick={onImport} disabled={isSubmitting} primary />
    <ChoiceButton title="Keep this device only" description={getImportChoiceDescription('device-only')} onClick={onDeviceOnly} disabled={isSubmitting} />
    <ChoiceButton title="Decide later" description={getImportChoiceDescription('later')} onClick={onDecideLater} disabled={isSubmitting} />
  </div>
);

interface ChoiceButtonProps {
  title: string;
  description: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}

const ChoiceButton: React.FC<ChoiceButtonProps> = ({ title, description, onClick, disabled, primary = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full rounded-medium border p-3 text-left transition-colors disabled:opacity-60 ${primary ? 'border-accent-primary bg-accent-primary/[0.06]' : 'border-border-default bg-background hover:bg-surface-secondary'}`}
  >
    <span className="block text-[14px] font-bold text-text-primary">{title}</span>
    <span className="mt-1 block text-[12px] leading-5 text-text-secondary">{description}</span>
  </button>
);
