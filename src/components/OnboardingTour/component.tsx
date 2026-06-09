/**
 * OnboardingTour — a 3-step guided demo shown to first-time users.
 *
 * Step 1: Highlights the "+ Add to Planner" button — user adds their first task.
 * Step 2: Highlights the Ready to schedule panel — user drags it to the calendar.
 * Step 3: Highlights the week grid — explains arrow key controls.
 *
 * State is persisted in localStorage so it only shows once.
 * Can be re-triggered by clearing localStorage key `bpp_tour_v1`.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';

const TOUR_KEY = 'bpp_tour_v1';

type TourStep = 'add_task' | 'find_slot' | 'move_it' | 'complete';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8; // padding around the spotlight target

// ─── Hook: watch block counts ────────────────────────────────────────────────

const useBlockCounts = () => {
  const unscheduled = useLiveQuery(
    () => db.blocks.filter(b => !b.isScheduled && !b.deletedAt).count(),
    [], 0
  );
  const scheduled = useLiveQuery(
    () => db.blocks.filter(b => !!b.isScheduled && !!b.date && !b.deletedAt).count(),
    [], 0
  );
  return { unscheduled: unscheduled ?? 0, scheduled: scheduled ?? 0 };
};

// ─── Main component ──────────────────────────────────────────────────────────

interface OnboardingTourProps {
  /** Open the "Add to Planner" modal so Step 1 can spotlight its input. */
  onOpenAddModal?: () => void;
  /** Close the modal when leaving Step 1 (advance / skip / finish). */
  onCloseAddModal?: () => void;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ onOpenAddModal, onCloseAddModal }) => {
  const [step, setStep] = useState<TourStep | null>(null);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [visible, setVisible] = useState(false);
  const raf = useRef<number>(0);
  const { unscheduled, scheduled } = useBlockCounts();

  // Only show if tour hasn't been completed (or if ?tour=1 in URL)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forceTour = params.get('tour') === '1';

    if (forceTour) {
      // Remove the param from the URL without a reload
      params.delete('tour');
      const newSearch = params.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash,
      );
      // Force restart even for returning users
      localStorage.removeItem(TOUR_KEY);
    }

    if (forceTour || !localStorage.getItem(TOUR_KEY)) {
      // Small delay so the app renders first
      const t = setTimeout(() => setStep('add_task'), 800);
      return () => clearTimeout(t);
    }
  }, []);

  // Step 1 plays out inside the "Add to Planner" modal: open it when Step 1
  // starts, close it once we move on (or the tour ends).
  useEffect(() => {
    if (step === 'add_task') {
      onOpenAddModal?.();
    } else {
      onCloseAddModal?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Advance step 1 → 2 when first task is added
  useEffect(() => {
    if (step === 'add_task' && unscheduled > 0) {
      setStep('find_slot');
    }
  }, [step, unscheduled]);

  // Advance step 2 → 3 when first task is scheduled
  useEffect(() => {
    if (step === 'find_slot' && scheduled > 0) {
      setStep('move_it');
    }
  }, [step, scheduled]);

  // Fade in when step activates
  useEffect(() => {
    if (step && step !== 'complete') {
      setVisible(false);
      const t = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Track target element position (recalculate every frame)
  useLayoutEffect(() => {
    if (!step || step === 'complete') { setRect(null); return; }

    const selectors = STEP_SELECTORS[step];
    const measure = () => {
      // Try each selector in order — Step 1 prefers the modal input field but
      // falls back to the "+ Add to Planner" button until the modal mounts.
      let el: HTMLElement | null = null;
      for (const sel of selectors) {
        el = document.querySelector<HTMLElement>(sel);
        if (el) break;
      }
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
      }
      raf.current = requestAnimationFrame(measure);
    };
    raf.current = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf.current);
  }, [step]);

  const dismiss = () => {
    localStorage.setItem(TOUR_KEY, '1');
    onCloseAddModal?.();
    setVisible(false);
    setTimeout(() => setStep(null), 300);
  };

  const complete = () => {
    onCloseAddModal?.();
    setStep('complete');
    setVisible(false);
    localStorage.setItem(TOUR_KEY, '1');
  };

  if (!step || step === 'complete') return null;

  const config = STEP_CONFIG[step];
  const tooltipPos = rect ? getTooltipPosition(step, rect) : null;
  // Step 1 sits over a modal — capture clicks on the dim so the modal can't be
  // dismissed by mis-clicks. Other steps stay click-through for drag/select.
  const panelPE: React.CSSProperties['pointerEvents'] = step === 'add_task' ? 'auto' : 'none';

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[900]"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.25s ease' }}
      aria-live="polite"
    >
      {/* Dark overlay — 4 panels around the spotlight.
          During Step 1 the panels capture clicks so tapping the dimmed area
          can't accidentally close the modal behind them; the input itself sits
          in the (uncovered) cutout and stays fully interactive. */}
      {rect && (
        <>
          {/* Top */}
          <div className="absolute bg-black/40 left-0 right-0 top-0" style={{ height: Math.max(0, rect.top), pointerEvents: panelPE }} />
          {/* Bottom */}
          <div className="absolute bg-black/40 left-0 right-0 bottom-0" style={{ top: rect.top + rect.height, pointerEvents: panelPE }} />
          {/* Left */}
          <div className="absolute bg-black/40" style={{ top: rect.top, height: rect.height, left: 0, width: Math.max(0, rect.left), pointerEvents: panelPE }} />
          {/* Right */}
          <div className="absolute bg-black/40" style={{ top: rect.top, height: rect.height, left: rect.left + rect.width, right: 0, pointerEvents: panelPE }} />
          {/* Spotlight ring */}
          <div
            className="absolute rounded-large"
            style={{
              top: rect.top, left: rect.left,
              width: rect.width, height: rect.height,
              boxShadow: step === 'add_task'
                ? '0 0 0 3px #7C5CFC, 0 0 0 7px rgba(124,92,252,0.30), 0 0 28px 4px rgba(124,92,252,0.35)'
                : '0 0 0 3px #7C5CFC, 0 0 0 6px rgba(124,92,252,0.25)',
              pointerEvents: 'none',
            }}
          />
          {/* "Start here" pill above the input (Step 1 only) */}
          {step === 'add_task' && (
            <div
              className="absolute flex flex-col items-center"
              style={{ top: rect.top - 30, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' }}
            >
              <span className="rounded-full bg-accent-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm whitespace-nowrap">
                Start here
              </span>
              <span
                className="w-0 h-0"
                style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid #7C5CFC' }}
              />
            </div>
          )}
        </>
      )}

      {/* Tooltip */}
      {tooltipPos && (
        <div
          className="pointer-events-auto absolute z-10"
          style={{ top: tooltipPos.top, left: tooltipPos.left, width: 280 }}
        >
          {/* Arrow */}
          <div
            className="mx-auto w-0 h-0"
            style={tooltipPos.arrowStyle}
          />
          <div className="bg-white rounded-large shadow-modal border border-border-default p-4">
            {/* Progress dots */}
            <div className="flex gap-1.5 mb-3">
              {(['add_task', 'find_slot', 'move_it'] as TourStep[]).map((s, i) => (
                <div
                  key={i}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: s === step ? 20 : 6,
                    background: s === step ? '#7C5CFC' : '#E2E8F0',
                  }}
                />
              ))}
            </div>

            <div className="text-[13px] font-bold text-text-primary mb-1">{config.title}</div>
            <p className="text-[12px] text-text-secondary leading-relaxed mb-3">{config.body}</p>

            {step === 'move_it' ? (
              <div className="space-y-2">
                {/* Keyboard hints */}
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {[
                    { keys: '← →', label: 'change day' },
                    { keys: '↑ ↓', label: 'move time' },
                    { keys: '+ −', label: 'adjust length' },
                  ].map(({ keys, label }) => (
                    <div key={keys} className="flex items-center gap-1 text-[11px]">
                      <span className="bg-surface-secondary border border-border-default rounded px-1.5 py-0.5 font-mono font-bold text-text-primary">{keys}</span>
                      <span className="text-text-muted">{label}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={complete}
                  className="w-full h-9 bg-accent-primary hover:bg-accent-hover text-white text-[13px] font-bold rounded-small transition-colors"
                >
                  Got it — let me plan my week →
                </button>
              </div>
            ) : (
              <button
                onClick={dismiss}
                className="text-[11px] text-text-muted hover:text-text-secondary transition-colors"
              >
                Skip tour
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Step config ──────────────────────────────────────────────────────────────

const STEP_SELECTORS: Record<TourStep, string[]> = {
  add_task:  ['[data-tour="quick-add-field"]', '[data-tour="add-button"]'],
  find_slot: ['[data-tour="ready-to-schedule"]'],
  move_it:   ['[data-tour="week-grid"]'],
  complete:  [],
};

const STEP_CONFIG: Record<Exclude<TourStep, 'complete'>, { title: string; body: string }> = {
  add_task: {
    title: 'Start here — add your first task',
    body: 'Type anything you need to get done — a food shop, an appointment, that email. Press Enter to add it.',
  },
  find_slot: {
    title: 'Step 2 — Find it a slot',
    body: 'Your task is waiting in the list. Drag it into the calendar — pick a day, find a gap, and drop it in.',
  },
  move_it: {
    title: 'Step 3 — Move it around',
    body: 'Click the task to select it. Then use the keyboard to fine-tune it:',
  },
};

// ─── Tooltip positioning ──────────────────────────────────────────────────────

type TooltipPos = { top: number; left: number; arrowStyle: React.CSSProperties };

const TOOLTIP_W = 280;
const TOOLTIP_GAP = 12;

const getTooltipPosition = (step: TourStep, r: SpotlightRect): TooltipPos => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const noArrow: React.CSSProperties = {};

  // Step 1: the input sits inside a centred modal. Never cover it — place the
  // card beside the modal (right, then left), and fall back to a bottom sheet
  // when there isn't room either side (mobile / narrow).
  if (step === 'add_task') {
    const rightLeft = r.left + r.width + 24;
    const leftLeft = r.left - TOOLTIP_W - 24;
    if (rightLeft + TOOLTIP_W <= vw - 12) {
      const top = Math.max(12, Math.min(r.top - 4, vh - 180));
      return { top, left: rightLeft, arrowStyle: noArrow };
    }
    if (leftLeft >= 12) {
      const top = Math.max(12, Math.min(r.top - 4, vh - 180));
      return { top, left: leftLeft, arrowStyle: noArrow };
    }
    // Bottom sheet
    return {
      top: vh - 188,
      left: Math.max(12, (vw - TOOLTIP_W) / 2),
      arrowStyle: noArrow,
    };
  }

  // Default: tooltip below target, centred
  let top = r.top + r.height + TOOLTIP_GAP;
  let left = r.left + r.width / 2 - TOOLTIP_W / 2;

  // For the week grid (step 3), put tooltip above-right so it doesn't cover the calendar
  if (step === 'move_it') {
    top = r.top + TOOLTIP_GAP;
    left = Math.min(r.left + 60, vw - TOOLTIP_W - 16);
  }

  // Clamp to viewport
  left = Math.max(12, Math.min(left, vw - TOOLTIP_W - 12));

  const arrowStyle: React.CSSProperties = step === 'move_it' ? noArrow : {
    borderLeft: '7px solid transparent',
    borderRight: '7px solid transparent',
    borderBottom: '7px solid white',
    marginBottom: -1,
    filter: 'drop-shadow(0 -1px 0 #e2e8f0)',
  };

  return { top, left, arrowStyle };
};
