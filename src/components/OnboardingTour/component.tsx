/**
 * OnboardingTour — a guided action flow that walks a first-time user through
 * completing one full planning task end to end:
 *
 *   1. open_input   Click "+ Add to Planner"            (auto-advances on open)
 *   2. type         Type into Quick Add                 (Next once text entered)
 *   3. add_ready    Click "Add to Ready to schedule"    (auto-advances on add)
 *   4. show_ready   See the item waiting in Ready       (auto-advances on place)
 *   5. place_block  The placed block — two ways to move (Next)
 *   6. arrows       Precise: arrow keys                 (Next)
 *   7. drag         Fast: drag it onto the week         (Finish)
 *
 * Principle: at every step the spotlight cuts out ONLY the element the user
 * should touch next; that element keeps full colour/opacity and stays
 * interactive, while everything else is dimmed. Instruction cards are always
 * placed clear of the active element.
 *
 * Persisted in localStorage so it shows once. Re-trigger with ?tour=1.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';

const TOUR_KEY = 'bpp_tour_v2';

type TourStep =
  | 'open_input'
  | 'type'
  | 'add_ready'
  | 'show_ready'
  | 'place_block'
  | 'arrows'
  | 'drag'
  | 'complete';

const ORDER: Exclude<TourStep, 'complete'>[] = [
  'open_input', 'type', 'add_ready', 'show_ready', 'place_block', 'arrows', 'drag',
];

interface SpotlightRect { top: number; left: number; width: number; height: number; }

const PAD = 8;
const CARD_W = 280;

// ─── Hook: watch block counts ────────────────────────────────────────────────

const useBlockCounts = () => {
  const unscheduled = useLiveQuery(
    () => db.blocks.filter(b => !b.isScheduled && !b.deletedAt).count(),
    [], 0,
  );
  const scheduled = useLiveQuery(
    () => db.blocks.filter(b => !!b.isScheduled && !!b.date && !b.deletedAt).count(),
    [], 0,
  );
  return { unscheduled: unscheduled ?? 0, scheduled: scheduled ?? 0 };
};

// ─── Main component ──────────────────────────────────────────────────────────

interface OnboardingTourProps {
  /** Open the "Add to Planner" modal (used to re-open if it's mis-closed). */
  onOpenAddModal?: () => void;
  /** Close the modal (used when moving past the modal-based steps). */
  onCloseAddModal?: () => void;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ onOpenAddModal, onCloseAddModal }) => {
  const [step, setStep] = useState<TourStep | null>(null);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [visible, setVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [inputHasText, setInputHasText] = useState(false);
  const raf = useRef<number>(0);
  // Baseline counts captured when the tour starts, so step transitions fire on
  // a genuine increase (robust even if the planner already has items).
  const baseUnsched = useRef<number | null>(null);
  const baseSched = useRef<number | null>(null);
  const { unscheduled, scheduled } = useBlockCounts();

  useEffect(() => {
    if (step && step !== 'complete' && baseUnsched.current === null) {
      baseUnsched.current = unscheduled;
      baseSched.current = scheduled;
    }
    if (!step || step === 'complete') {
      baseUnsched.current = null;
      baseSched.current = null;
    }
  }, [step, unscheduled, scheduled]);

  // Start the tour (first visit, or forced via ?tour=1 / ?demo=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forceTour = params.get('tour') === '1';

    if (forceTour) {
      params.delete('tour');
      const newSearch = params.toString();
      window.history.replaceState(
        {}, '',
        window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash,
      );
      localStorage.removeItem(TOUR_KEY);
    }

    if (forceTour || !localStorage.getItem(TOUR_KEY)) {
      const t = setTimeout(() => {
        // If the modal is somehow already open, skip straight to typing.
        const inputOpen = !!document.querySelector('[data-tour="quick-add-input"]');
        setStep(inputOpen ? 'type' : 'open_input');
      }, 800);
      return () => clearTimeout(t);
    }
  }, []);

  // Allow the tour to be replayed on demand (Settings → Replay walkthrough,
  // empty-state prompts, etc.) without a page reload.
  useEffect(() => {
    const onStart = () => {
      localStorage.removeItem(TOUR_KEY);
      const inputOpen = !!document.querySelector('[data-tour="quick-add-input"]');
      setStep(inputOpen ? 'type' : 'open_input');
    };
    window.addEventListener('planner:start-tour', onStart);
    return () => window.removeEventListener('planner:start-tour', onStart);
  }, []);

  // Poll modal-open state + whether the input has text
  useEffect(() => {
    if (!step || step === 'complete') return;
    const id = window.setInterval(() => {
      const input = document.querySelector<HTMLInputElement>('[data-tour="quick-add-input"]');
      setModalOpen(!!input);
      setInputHasText(!!input && input.value.trim().length > 0);
    }, 150);
    return () => window.clearInterval(id);
  }, [step]);

  // Step 1 → 2: the user opened the modal
  useEffect(() => {
    if (step === 'open_input' && modalOpen) setStep('type');
  }, [step, modalOpen]);

  // Keep the modal open during the modal-based steps; focus the input on Step 2
  useEffect(() => {
    if ((step === 'type' || step === 'add_ready') && !modalOpen) {
      onOpenAddModal?.();
    }
    if (step === 'type' && modalOpen) {
      document.querySelector<HTMLInputElement>('[data-tour="quick-add-input"]')?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, modalOpen]);

  // Step 3 → 4: a Ready item was created — close the modal to reveal it.
  // Also handles the user pressing Enter during Step 2 (adds without clicking).
  useEffect(() => {
    if ((step === 'add_ready' || step === 'type') &&
        baseUnsched.current !== null && unscheduled > baseUnsched.current) {
      onCloseAddModal?.();
      setStep('show_ready');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, unscheduled]);

  // Step 4 → 5: the item was placed onto the week (became a block)
  useEffect(() => {
    if (step === 'show_ready' &&
        baseSched.current !== null && scheduled > baseSched.current) {
      setStep('place_block');
    }
  }, [step, scheduled]);

  // Fade in on each step
  useEffect(() => {
    if (step && step !== 'complete') {
      setVisible(false);
      const t = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Track the active element's position every frame
  useLayoutEffect(() => {
    if (!step || step === 'complete') { setRect(null); return; }
    const selectors = STEP_SELECTORS[step];
    const measure = () => {
      let el: HTMLElement | null = null;
      for (const sel of selectors) {
        el = document.querySelector<HTMLElement>(sel);
        if (el) break;
      }
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
      } else {
        setRect(null);
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

  const finish = () => {
    onCloseAddModal?.();
    localStorage.setItem(TOUR_KEY, '1');
    setVisible(false);
    setTimeout(() => setStep('complete'), 300);
  };

  const goNext = () => {
    const i = ORDER.indexOf(step as Exclude<TourStep, 'complete'>);
    if (i >= 0 && i < ORDER.length - 1) setStep(ORDER[i + 1]);
    else finish();
  };

  if (!step || step === 'complete') return null;

  const config = STEP_CONFIG[step];
  const cardPos = getCardPos(step, rect);
  // Capture clicks on the dim only while a modal is open underneath, so a
  // mis-click can't dismiss it. Other steps stay click-through for drag/select.
  const panelPE: React.CSSProperties['pointerEvents'] =
    step === 'type' || step === 'add_ready' ? 'auto' : 'none';

  // Which steps get a manual button (others auto-advance)
  const manualNext =
    step === 'type' ? { label: 'Next', disabled: !inputHasText, onClick: goNext } :
    step === 'place_block' ? { label: 'Next', disabled: false, onClick: goNext } :
    step === 'arrows' ? { label: 'Next', disabled: false, onClick: goNext } :
    step === 'drag' ? { label: 'Finish', disabled: false, onClick: finish } :
    null;

  const lifted = step === 'place_block' || step === 'drag';

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[900]"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.25s ease' }}
      aria-live="polite"
    >
      {/* Dimming + spotlight cutout (only when we have a target) */}
      {rect && (
        <>
          <div className="absolute bg-black/45 left-0 right-0 top-0" style={{ height: Math.max(0, rect.top), pointerEvents: panelPE }} />
          <div className="absolute bg-black/45 left-0 right-0 bottom-0" style={{ top: rect.top + rect.height, pointerEvents: panelPE }} />
          <div className="absolute bg-black/45" style={{ top: rect.top, height: rect.height, left: 0, width: Math.max(0, rect.left), pointerEvents: panelPE }} />
          <div className="absolute bg-black/45" style={{ top: rect.top, height: rect.height, left: rect.left + rect.width, right: 0, pointerEvents: panelPE }} />

          {/* Spotlight ring (pulses on the arrows step, glows on block steps) */}
          <div
            className={`absolute rounded-large ${step === 'arrows' ? 'animate-pulse' : ''}`}
            style={{
              top: rect.top, left: rect.left,
              width: rect.width, height: rect.height,
              boxShadow: lifted
                ? '0 0 0 3px #7C5CFC, 0 0 0 7px rgba(124,92,252,0.30), 0 14px 40px 4px rgba(124,92,252,0.45)'
                : '0 0 0 3px #7C5CFC, 0 0 0 7px rgba(124,92,252,0.28), 0 0 26px 4px rgba(124,92,252,0.30)',
              pointerEvents: 'none',
            }}
          />

          {/* Inline "Start here" pill above the input on the typing step */}
          {step === 'type' && (
            <InlinePill text="Start here" top={rect.top - 30} left={rect.left + rect.width / 2} />
          )}
          {/* Inline drag hint on the block for the drag step */}
          {step === 'drag' && (
            <InlinePill text="Click, hold and drag" top={rect.top - 30} left={rect.left + rect.width / 2} />
          )}
        </>
      )}

      {/* Instruction card */}
      <div
        className="pointer-events-auto absolute"
        style={{ top: cardPos.top, left: cardPos.left, width: CARD_W }}
      >
        <div className="bg-white rounded-large shadow-modal border border-border-default p-4">
          {/* Progress dots */}
          <div className="flex gap-1 mb-3">
            {ORDER.map((s) => (
              <div
                key={s}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: s === step ? 18 : 6,
                  background: s === step ? '#7C5CFC' : '#E2E8F0',
                }}
              />
            ))}
          </div>

          <div className="text-[13px] font-bold text-text-primary mb-1">{config.title}</div>
          <p className="text-[12px] text-text-secondary leading-relaxed">{config.body}</p>

          {/* Arrow-key chips on the arrows step */}
          {step === 'arrows' && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {[
                { keys: '← →', label: 'day' },
                { keys: '↑ ↓', label: 'time' },
                { keys: '+ −', label: 'length' },
              ].map(({ keys, label }) => (
                <div key={keys} className="flex items-center gap-1 text-[11px]">
                  <span className="bg-surface-secondary border border-border-default rounded px-1.5 py-0.5 font-mono font-bold text-text-primary">{keys}</span>
                  <span className="text-text-muted">{label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={dismiss}
              className="text-[11px] text-text-muted hover:text-text-secondary transition-colors"
              title="You can replay this any time from Settings"
            >
              Skip — replay later in Settings
            </button>
            {manualNext && (
              <button
                onClick={manualNext.onClick}
                disabled={manualNext.disabled}
                className="h-8 px-4 bg-accent-primary hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-bold rounded-small transition-colors"
              >
                {manualNext.label} →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Inline pill ──────────────────────────────────────────────────────────────

const InlinePill: React.FC<{ text: string; top: number; left: number }> = ({ text, top, left }) => (
  <div className="absolute flex flex-col items-center" style={{ top, left, transform: 'translateX(-50%)' }}>
    <span className="rounded-full bg-accent-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm whitespace-nowrap">
      {text}
    </span>
    <span
      className="w-0 h-0"
      style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid #7C5CFC' }}
    />
  </div>
);

// ─── Step config ──────────────────────────────────────────────────────────────

const STEP_SELECTORS: Record<TourStep, string[]> = {
  open_input:  ['[data-tour="add-button"]'],
  type:        ['[data-tour="quick-add-field"]'],
  add_ready:   ['[data-tour="add-ready-button"]'],
  show_ready:  ['[data-tour="ready-item"]', '[data-tour="ready-to-schedule"]'],
  place_block: ['[data-tour="scheduled-block"]'],
  arrows:      ['[data-tour="arrow-controls"]'],
  drag:        ['[data-tour="scheduled-block"]'],
  complete:    [],
};

const STEP_CONFIG: Record<Exclude<TourStep, 'complete'>, { title: string; body: string }> = {
  open_input: {
    title: 'Add to your week',
    body: 'Click here to add something to your week.',
  },
  type: {
    title: 'Type one thing in',
    body: 'Start with anything you need to get done. A food shop, an appointment, an email, a reminder. Just type it here first.',
  },
  add_ready: {
    title: 'Send it to Ready',
    body: 'This drops your item into the Ready list — where it waits until you place it on your week. Click to add it.',
  },
  show_ready: {
    title: 'Your item is waiting here',
    body: 'This is where unscheduled items wait until you place them. Now drag it onto any day in your week.',
  },
  place_block: {
    title: 'Move your block into place',
    body: 'You can move a block in two ways. Click the block and use the arrows for precise changes, or click, hold and drag it directly into the right place.',
  },
  arrows: {
    title: 'Precise: use the arrows',
    body: 'With the block selected, the arrow keys move it up, down or across days. Use them when you want small, controlled movements.',
  },
  drag: {
    title: 'Fast: drag it',
    body: 'You can also drag the block straight onto the week. This is fastest when you already know where it belongs.',
  },
};

// ─── Card positioning ─────────────────────────────────────────────────────────
// Cards are always placed clear of the active element.

const getCardPos = (step: TourStep, r: SpotlightRect | null): { top: number; left: number } => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampL = (l: number) => Math.max(12, Math.min(l, vw - CARD_W - 12));
  const clampT = (t: number) => Math.max(12, Math.min(t, vh - 190));
  const bottomSheet = { top: vh - 196, left: clampL((vw - CARD_W) / 2) };

  if (!r) return bottomSheet;

  switch (step) {
    case 'open_input':
      // Below the button
      return { top: clampT(r.top + r.height + 12), left: clampL(r.left) };

    case 'type':
    case 'add_ready': {
      // Beside the modal (right, then left), else bottom sheet
      const right = r.left + r.width + 24;
      if (right + CARD_W <= vw - 12) return { top: clampT(r.top - 4), left: right };
      const left = r.left - CARD_W - 24;
      if (left >= 12) return { top: clampT(r.top - 4), left };
      return bottomSheet;
    }

    case 'show_ready': {
      // To the right of the ready item, else below it
      const right = r.left + r.width + 16;
      if (right + CARD_W <= vw - 12) return { top: clampT(r.top - 4), left: right };
      return { top: clampT(r.top + r.height + 12), left: clampL(r.left) };
    }

    case 'arrows':
      // Above the controls footer so it doesn't cover them
      return { top: clampT(r.top - 172), left: clampL(r.left + r.width / 2 - CARD_W / 2) };

    case 'place_block':
    case 'drag':
      // Pin to the far left so the card never covers the calendar grid/block
      return { top: clampT(100), left: 12 };

    default:
      return { top: clampT(r.top + r.height + 12), left: clampL(r.left) };
  }
};
