import React, { useState } from 'react';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { markImportDeviceOnlyForCurrentUser, markImportLaterForCurrentUser, queueLocalImportForCurrentUser, signOut, syncPendingChanges } from '../../services/syncService';
import { sendMagicLink, signInWithGoogle } from '../../services/supabaseClient';

const accountHref = `${import.meta.env.BASE_URL || '/'}account`.replace(/\/{2,}/g, '/');

export const SyncStatusPanel: React.FC = () => {
  const sync = useSyncStatus();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setMessage(null);
    try {
      await signInWithGoogle();
    } catch {
      setMessage('Could not start Google sign-in.');
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
      setMessage('Sign-in link sent.');
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

  const handleSkipImport = async () => {
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
    <div className="relative">
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="h-9 rounded-medium border border-transparent bg-transparent px-2 text-[12px] font-semibold text-text-secondary hover:border-border-default hover:bg-surface-primary transition-colors flex items-center gap-2"
        aria-expanded={isOpen}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${sync.label === 'Synced' ? 'bg-green-500' : sync.label === 'Syncing' ? 'bg-accent-primary' : sync.label === 'Sync failed, retrying' ? 'bg-amber-500' : 'bg-text-muted'}`} />
        {sync.isConfigured && !sync.isLoggedIn ? 'Sign in to sync' : sync.label}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-modal w-[min(340px,calc(100vw-24px))] rounded-medium border border-border-default bg-surface-primary p-4 shadow-modal">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[14px] font-bold text-text-primary">{sync.label}</div>
              <div className="mt-1 text-[12px] font-semibold text-text-secondary">
                {sync.isLoggedIn ? sync.userEmail : 'Local planner'}
              </div>
            </div>
            {sync.pendingCount > 0 && (
              <span className="rounded-small bg-background px-2 py-1 text-[11px] font-bold text-text-secondary">
                {sync.pendingCount} pending
              </span>
            )}
          </div>

          {!sync.isConfigured && (
            <p className="mt-3 text-[13px] leading-snug text-text-secondary">
              Saved on this device. Add Supabase keys to enable magic link sync.
            </p>
          )}

          {sync.isConfigured && !sync.isLoggedIn && (
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSubmitting}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-small border border-border-default bg-surface-primary px-3 text-[13px] font-bold text-text-primary hover:bg-surface-secondary disabled:opacity-60"
              >
                <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
                  <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z"/>
                </svg>
                Sign in with Google
              </button>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border-default" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">or</span>
                <div className="h-px flex-1 bg-border-default" />
              </div>
              <form onSubmit={handleMagicLink} className="flex flex-col gap-2">
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  className="h-10 rounded-small border border-border-default px-3 text-[14px] outline-none focus:border-accent-primary"
                  placeholder="Email — get a sign-in link"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !email.trim()}
                  className="h-10 rounded-small bg-accent-primary px-3 text-[13px] font-bold text-white disabled:opacity-60"
                >
                  {isSubmitting ? 'Sending...' : 'Send sign-in link'}
                </button>
              </form>
            </div>
          )}

          {sync.isLoggedIn && sync.needsImport && (
            <div className="mt-3 rounded-small border border-accent-primary/25 bg-accent-primary/[0.04] p-3">
              <div className="text-[13px] font-bold text-text-primary">Import local planner data?</div>
              <p className="mt-1 text-[12px] leading-snug text-text-secondary">
                Existing blocks on this device can be added to this cloud account once.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  onClick={handleImport}
                  disabled={isSubmitting}
                  className="min-h-9 rounded-small bg-accent-primary px-3 py-2 text-[12px] font-bold text-white disabled:opacity-60"
                >
                  Import local planner into account
                </button>
                <button
                  onClick={handleSkipImport}
                  className="min-h-9 rounded-small border border-border-default bg-surface-primary px-3 py-2 text-[12px] font-bold text-text-primary"
                >
                  Keep this device only
                </button>
                <button
                  onClick={handleDecideLater}
                  className="min-h-9 rounded-small border border-border-default bg-surface-primary px-3 py-2 text-[12px] font-bold text-text-primary"
                >
                  Decide later
                </button>
              </div>
            </div>
          )}

          {sync.isLoggedIn && !sync.needsImport && sync.importDecision === 'later' && (
            <div className="mt-3 rounded-small border border-border-default bg-background p-3">
              <div className="text-[13px] font-bold text-text-primary">Local planner data is still on this device.</div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleImport}
                  disabled={isSubmitting}
                  className="h-9 flex-1 rounded-small bg-accent-primary px-3 text-[12px] font-bold text-white disabled:opacity-60"
                >
                  Import local planner
                </button>
                <button
                  onClick={handleSkipImport}
                  className="h-9 flex-1 rounded-small border border-border-default bg-surface-primary px-3 text-[12px] font-bold text-text-primary"
                >
                  Keep device only
                </button>
              </div>
            </div>
          )}

          {sync.isLoggedIn && !sync.needsImport && sync.importDecision !== 'later' && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void syncPendingChanges()}
                className="h-9 flex-1 rounded-small border border-border-default bg-background px-3 text-[12px] font-bold text-text-primary"
              >
                Retry sync
              </button>
              <button
                onClick={handleSignOut}
                className="h-9 flex-1 rounded-small border border-border-default bg-surface-primary px-3 text-[12px] font-bold text-text-primary"
              >
                Sign out
              </button>
            </div>
          )}

          {message && (
            <div className="mt-3 text-[12px] font-semibold text-text-secondary">{message}</div>
          )}

          <a href={accountHref} className="mt-3 inline-flex text-[12px] font-bold text-accent-primary hover:text-accent-hover">
            Account access
          </a>
        </div>
      )}
    </div>
  );
};
