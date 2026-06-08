import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { markImportDeviceOnlyForCurrentUser, markImportLaterForCurrentUser, queueLocalImportForCurrentUser, signOut, syncPendingChanges } from '../../services/syncService';
import { connectGoogleCalendar, sendMagicLink, signInWithGoogle } from '../../services/supabaseClient';
import { getLastSyncTime, hasGCalAccess, syncGoogleCalendarEvents } from '../../services/googleCalendarService';
import { importIcsFile } from '../../services/icsImportService';

const accountHref = `${import.meta.env.BASE_URL || '/'}account`.replace(/\/{2,}/g, '/');

const formatRelativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
};

export const SyncStatusPanel: React.FC = () => {
  const sync = useSyncStatus();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalLastSync, setGcalLastSync] = useState<string | null>(null);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [icsImporting, setIcsImporting] = useState(false);
  const icsInputRef = React.useRef<HTMLInputElement>(null);

  // Check Google Calendar connection state when panel opens
  useEffect(() => {
    if (!isOpen || !sync.isLoggedIn) return;
    void hasGCalAccess().then(setGcalConnected);
    void getLastSyncTime().then(setGcalLastSync);
  }, [isOpen, sync.isLoggedIn]);

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

  const handleConnectGoogleCalendar = async () => {
    setIsSubmitting(true);
    try {
      await connectGoogleCalendar();
      // Page will redirect for OAuth — no further action needed here
    } catch {
      setMessage('Could not connect Google Calendar.');
      setIsSubmitting(false);
    }
  };

  const handleIcsFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIcsImporting(true);
    setMessage(null);
    try {
      const result = await importIcsFile(file);
      if (result.imported > 0) {
        setMessage(`Imported ${result.imported} event${result.imported === 1 ? '' : 's'} from Apple Calendar`);
      } else if (result.deduplicated > 0) {
        setMessage('All events already imported — nothing new to add.');
      } else {
        setMessage('No timed events found in that file.');
      }
    } catch {
      setMessage("Could not read that file. Make sure it's a .ics file exported from Apple Calendar.");
    } finally {
      setIcsImporting(false);
      // Reset so the same file can be re-uploaded
      if (icsInputRef.current) icsInputRef.current.value = '';
    }
  };

  const handleSyncGoogleCalendar = async () => {
    setGcalSyncing(true);
    try {
      const result = await syncGoogleCalendarEvents();
      if (result.status === 'connected') {
        setGcalLastSync(result.lastSyncAt ?? null);
        setMessage(`Synced ${result.upserted} calendar event${result.upserted === 1 ? '' : 's'}`);
      } else if (result.status === 'unauthorized') {
        setGcalConnected(false);
        setMessage('Google Calendar access expired — reconnect below.');
      } else {
        setMessage('Calendar sync failed. Try again.');
      }
    } finally {
      setGcalSyncing(false);
    }
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

      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-modal" onClick={() => setIsOpen(false)} />
          <div className="fixed right-4 top-[76px] z-modal w-[min(340px,calc(100vw-24px))] rounded-medium border border-border-default bg-surface-primary p-4 shadow-modal">
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
            <>
              {/* Google Calendar section */}
              <div className="mt-3 rounded-small border border-border-default bg-background p-3">
                <div className="flex items-center gap-2 mb-2">
                  <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true" className="flex-shrink-0">
                    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
                    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
                    <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"/>
                    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z"/>
                  </svg>
                  <span className="text-[13px] font-bold text-text-primary">Google Calendar</span>
                  {gcalConnected && (
                    <span className="ml-auto text-[11px] font-bold text-green-600">Connected</span>
                  )}
                </div>

                {gcalConnected ? (
                  <>
                    <p className="text-[12px] text-text-secondary leading-snug mb-2">
                      Your calendar events appear in blue in the grid. Drag them to reschedule &mdash; changes sync back to Google Calendar.
                      {gcalLastSync && (
                        <span className="block mt-1 text-text-muted">Last synced {formatRelativeTime(gcalLastSync)}</span>
                      )}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSyncGoogleCalendar}
                        disabled={gcalSyncing}
                        className="h-8 flex-1 rounded-small border border-border-default bg-surface-primary px-3 text-[12px] font-bold text-text-primary disabled:opacity-60"
                      >
                        {gcalSyncing ? 'Syncing...' : 'Sync now'}
                      </button>
                      <button
                        onClick={handleConnectGoogleCalendar}
                        disabled={isSubmitting}
                        className="h-8 flex-1 rounded-small border border-border-default bg-surface-primary px-3 text-[12px] font-bold text-text-secondary disabled:opacity-60"
                        title="Re-authorise Google Calendar access"
                      >
                        Reconnect
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[12px] text-text-secondary leading-snug mb-2">
                      Pull in your existing Google Calendar events. Drag them to reschedule &mdash; changes go straight back to Google.
                    </p>
                    <button
                      onClick={handleConnectGoogleCalendar}
                      disabled={isSubmitting}
                      className="flex h-9 w-full items-center justify-center gap-2 rounded-small border border-border-default bg-surface-primary px-3 text-[13px] font-bold text-text-primary hover:bg-[#E8F0FE] disabled:opacity-60 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
                        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
                        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
                        <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"/>
                        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z"/>
                      </svg>
                      Connect Google Calendar
                    </button>
                  </>
                )}
              </div>

              {/* Apple Calendar — .ics import */}
              <div className="mt-2 rounded-small border border-border-default bg-background p-3">
                <div className="flex items-center gap-2 mb-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-red-500 flex-shrink-0" aria-hidden="true">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  <span className="text-[13px] font-bold text-text-primary">Apple Calendar</span>
                  <span className="ml-auto text-[10px] font-semibold text-text-muted">Manual import</span>
                </div>
                <p className="text-[12px] text-text-secondary leading-snug mb-2">
                  Export from Apple Calendar → File → Export, then upload the .ics file here.
                </p>
                <input
                  ref={icsInputRef}
                  type="file"
                  accept=".ics,text/calendar"
                  onChange={handleIcsFile}
                  className="hidden"
                  id="ics-file-input"
                />
                <button
                  onClick={() => icsInputRef.current?.click()}
                  disabled={icsImporting}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-small border border-border-default bg-surface-primary px-3 text-[12px] font-bold text-text-primary hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-60 transition-colors"
                >
                  {icsImporting ? 'Importing…' : 'Upload .ics file'}
                </button>
              </div>

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
            </>
          )}

          {message && (
            <div className="mt-3 text-[12px] font-semibold text-text-secondary">{message}</div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <a href={accountHref} className="text-[12px] font-bold text-accent-primary hover:text-accent-hover">
              Account access
            </a>
            <a
              href="/feedback.html?src=app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-semibold text-text-muted hover:text-text-secondary"
            >
              Share feedback →
            </a>
          </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
