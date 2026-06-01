import React, { useState } from 'react';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { markImportDeviceOnlyForCurrentUser, markImportLaterForCurrentUser, queueLocalImportForCurrentUser, signOut, syncPendingChanges } from '../../services/syncService';
import { sendMagicLink } from '../../services/supabaseClient';

const accountHref = `${import.meta.env.BASE_URL || '/'}account`.replace(/\/{2,}/g, '/');

export const SyncStatusPanel: React.FC = () => {
  const sync = useSyncStatus();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        className="h-10 rounded-medium border border-border-default bg-surface-primary px-3 text-[12px] font-bold text-text-primary shadow-sm hover:bg-background transition-colors flex items-center gap-2"
        aria-expanded={isOpen}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${sync.label === 'Synced' ? 'bg-green-500' : sync.label === 'Syncing' ? 'bg-accent-primary' : sync.label === 'Sync failed, retrying' ? 'bg-amber-500' : 'bg-text-muted'}`} />
        {sync.label}
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
            <form onSubmit={handleMagicLink} className="mt-3 flex flex-col gap-2">
              <p className="text-[13px] leading-snug text-text-secondary">
                Enter your email and we’ll send you a sign-in link.
              </p>
              <label className="text-[12px] font-bold uppercase tracking-[0.04em] text-text-primary">Email</label>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                className="h-10 rounded-small border border-border-default px-3 text-[14px] outline-none focus:border-accent-primary"
                placeholder="you@example.com"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="h-10 rounded-small bg-accent-primary px-3 text-[13px] font-bold text-white disabled:opacity-60"
              >
                {isSubmitting ? 'Syncing' : 'Send sign-in link'}
              </button>
            </form>
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
