import React, { useState } from 'react';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { markImportDeviceOnlyForCurrentUser, markImportLaterForCurrentUser, queueLocalImportForCurrentUser, signOut, syncPendingChanges } from '../../services/syncService';
import { sendMagicLink } from '../../services/supabaseClient';
import { getAccountAccessState, getImportChoiceDescription } from './accountAccessCore';

const plannerHref = `${import.meta.env.BASE_URL || '/'}${import.meta.env.BASE_URL?.endsWith('/') ? '' : '/'}`
  .replace(/\/{2,}/g, '/');

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
                  Your planner is ready to use here. Account sync can be turned on when the app is connected to Supabase.
                </p>
                <a href={plannerHref} className="inline-flex min-h-10 items-center justify-center rounded-small bg-accent-primary px-4 py-2 text-[13px] font-bold text-white">
                  Continue planning
                </a>
              </div>
            )}

            {(pageState === 'email-entry' || pageState === 'magic-link-sent') && (
              <form onSubmit={handleMagicLink} className="space-y-3">
                <h2 className="text-[18px] font-bold text-text-primary">Sign in by email</h2>
                <p className="text-[14px] leading-6 text-text-secondary">
                  Enter your email and we’ll send you a sign-in link.
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
