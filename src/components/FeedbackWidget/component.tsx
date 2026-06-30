import React, { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../services/supabaseClient';
import { track } from '../../services/analytics';

/**
 * FeedbackWidget — a persistent, always-visible feedback button.
 *
 * Tap it to open a lightweight panel with two modes:
 *   - Quick: one box, send. Available any time.
 *   - Detailed: the structured flow (rating, use-cases, what's missing, what's
 *     working) mirroring landing/feedback.html, so it writes to the same
 *     public.feedback table / RLS policy.
 *
 * After the user has explored for a while we gently nudge the detailed flow.
 * Feedback is best-effort: if Supabase isn't configured we fall back to email.
 */

const USE_CASES: { value: string; label: string }[] = [
  { value: 'work', label: 'Work' },
  { value: 'family', label: 'Family' },
  { value: 'personal', label: 'Personal' },
  { value: 'health', label: 'Health' },
  { value: 'admin', label: 'Life admin' },
  { value: 'mix', label: 'A mix' },
];

type Mode = 'quick' | 'structured';

interface FeedbackRow {
  rating: number | null;
  use_cases: string[] | null;
  missing: string | null;
  working: string | null;
  email: string | null;
  name: string | null;
  source: string;
  submitted_at: string;
}

const submitFeedback = async (row: FeedbackRow): Promise<boolean> => {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const { error } = await supabase.from('feedback').insert([row]);
  if (error) {
    console.error('[feedback] insert failed:', error.message);
    return false;
  }
  return true;
};

/** Heuristic: nudge the detailed flow once the user has actually engaged. */
const hasExplored = (): boolean => {
  try {
    return !!localStorage.getItem('bpp_first_first_drag_completed')
      || !!localStorage.getItem('bpp_first_first_task_created');
  } catch {
    return false;
  }
};

export const FeedbackWidget: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('quick');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick + structured fields.
  const [quickText, setQuickText] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [useCases, setUseCases] = useState<string[]>([]);
  const [missing, setMissing] = useState('');
  const [working, setWorking] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openPanel = () => {
    setOpen(true);
    setSent(false);
    setError(null);
    setMode(hasExplored() ? 'structured' : 'quick');
    track({ type: 'feedback_opened' });
  };

  const toggleUseCase = (value: string) => {
    setUseCases(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const isQuick = mode === 'quick';
    if (isQuick && !quickText.trim()) { setError('Add a few words first.'); return; }
    if (!isQuick && !missing.trim() && !working.trim() && !rating && useCases.length === 0) {
      setError('Fill in at least one field before sending.');
      return;
    }

    setSubmitting(true);
    const row: FeedbackRow = isQuick
      ? {
        rating: null, use_cases: null,
        missing: quickText.trim(), working: null,
        email: null, name: null,
        source: 'app_quick', submitted_at: new Date().toISOString(),
      }
      : {
        rating, use_cases: useCases.length ? useCases : null,
        missing: missing.trim() || null, working: working.trim() || null,
        email: email.trim() || null, name: name.trim() || null,
        source: 'app_structured', submitted_at: new Date().toISOString(),
      };

    const ok = await submitFeedback(row);
    setSubmitting(false);
    if (!ok) {
      setError('Could not send just now. Please email hello@bigpictureplanner.app');
      return;
    }
    track({ type: 'feedback_submitted', mode, rating: rating ?? undefined });
    setSent(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="feedback-fab flex items-center gap-1.5 rounded-full border border-accent-primary/30 bg-accent-primary/10 px-3.5 py-2 text-[13px] font-bold text-accent-primary shadow-card backdrop-blur hover:bg-accent-primary/20 transition-colors"
        aria-label="Share feedback"
      >
        <span aria-hidden="true">💬</span>
        <span>Feedback</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Share feedback"
        >
          <div
            className="w-full max-w-md rounded-t-large bg-surface-primary p-5 shadow-modal sm:rounded-large"
            onClick={e => e.stopPropagation()}
          >
            {sent ? (
              <div className="text-center py-4">
                <div className="text-[28px] mb-2" aria-hidden="true">🙏</div>
                <h2 className="text-[18px] font-bold text-text-primary">Thank you — genuinely.</h2>
                <p className="mt-2 text-[14px] leading-6 text-text-secondary">
                  Your feedback directly shapes what we build next.
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-4 h-10 rounded-small bg-accent-primary px-5 text-[13px] font-bold text-white"
                >
                  Back to planning
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[18px] font-bold text-text-primary">
                    {mode === 'quick' ? 'Tell us anything' : 'Tell us what you think'}
                  </h2>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="h-8 w-8 rounded-small text-[18px] font-bold text-text-secondary hover:bg-background">×</button>
                </div>

                {mode === 'quick' ? (
                  <>
                    <textarea
                      value={quickText}
                      onChange={e => setQuickText(e.target.value)}
                      placeholder="What's working, what's confusing, what you wish it did…"
                      autoFocus
                      className="min-h-[110px] w-full rounded-small border border-border-default p-3 text-[15px] outline-none focus:border-accent-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setMode('structured')}
                      className="text-[12px] font-bold text-accent-primary hover:underline"
                    >
                      Got a minute? Give detailed feedback →
                    </button>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.04em] text-text-secondary">How's it feeling so far?</p>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setRating(n)}
                            className={`h-9 flex-1 rounded-small border text-[14px] font-bold transition-colors ${rating === n ? 'border-accent-primary bg-accent-primary text-white' : 'border-border-default bg-background text-text-secondary hover:border-accent-primary/40'}`}
                            aria-pressed={rating === n}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.04em] text-text-secondary">What are you planning?</p>
                      <div className="flex flex-wrap gap-1.5">
                        {USE_CASES.map(uc => (
                          <button
                            key={uc.value}
                            type="button"
                            onClick={() => toggleUseCase(uc.value)}
                            className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${useCases.includes(uc.value) ? 'border-accent-primary bg-accent-primary/10 text-accent-primary' : 'border-border-default bg-background text-text-secondary hover:border-accent-primary/40'}`}
                            aria-pressed={useCases.includes(uc.value)}
                          >
                            {uc.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <textarea
                      value={missing}
                      onChange={e => setMissing(e.target.value)}
                      placeholder="What's missing, or what would make this better?"
                      className="min-h-[70px] w-full rounded-small border border-border-default p-3 text-[14px] outline-none focus:border-accent-primary"
                    />
                    <textarea
                      value={working}
                      onChange={e => setWorking(e.target.value)}
                      placeholder="What's working well for you?"
                      className="min-h-[60px] w-full rounded-small border border-border-default p-3 text-[14px] outline-none focus:border-accent-primary"
                    />
                    <div className="flex gap-2">
                      <input
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        type="email"
                        placeholder="Email (optional)"
                        autoComplete="email"
                        className="h-10 flex-1 rounded-small border border-border-default px-3 text-[14px] outline-none focus:border-accent-primary"
                      />
                      <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        type="text"
                        placeholder="Name (optional)"
                        autoComplete="given-name"
                        className="h-10 w-28 rounded-small border border-border-default px-3 text-[14px] outline-none focus:border-accent-primary"
                      />
                    </div>
                  </>
                )}

                {error && <p className="text-[12px] font-semibold text-semantic-danger">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="h-11 w-full rounded-small bg-accent-primary text-[14px] font-bold text-white disabled:opacity-60"
                >
                  {submitting ? 'Sending…' : 'Send feedback'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};
