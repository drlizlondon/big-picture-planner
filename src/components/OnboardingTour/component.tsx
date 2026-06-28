/**
 * OnboardingTour — a guided action flow that walks a first-time user through
 * completing one full planning task end to end:
 *
 *   1. open_input   Click "+ Add to Planner"            (auto-advances on open)
 *   2. type         Type into Quick Add                 (Next once text entered)
 *   3. add_ready    Click "Add to Life Inbox"    (auto-advances on add)
 *   4. show_ready   See the item waiting in Ready       (auto-advances on place)
 *   5. place_block  The placed block — two ways to move (Next)
 *   6. arrows       Precise: arrow keys                 (Next)
 *   7. drag         Fast: drag it onto the week         (Finish)
 *
 * Principle: at every step the spotlight cuts out ONLY the element the user
 * should touch next; that element keeps full colour/opacity and stays
 * interactive, while everything else is dimmed. The instruction card anchors
 * to the target with an arrow and never covers it.
 *
 * Mobile-first positioning:
 *   - Measures the target every frame via getBoundingClientRect(), so it stays
 *     correct after scroll, resize, orientation change, browser-chrome show/hide,
 *     keyboard open/close, modal animation and dynamic content.
 *   - Uses window.visualViewport (with fallbacks) for the true visible area, so
 *     the card stays above the mobile keyboard / browser UI.
 *   - Clamps the spotlight and the card to the visible viewport and to iOS
 *     safe-area insets.
 *   - Card: max-width min(90vw, 360px), max-height 35dvh (35vh fallback),
 *     internal scroll, primary button pinned in a footer that is always visible.
 *
 * Persisted in localStorage so it shows once. Re-trigger with ?tour=1 or the
 * `planner:start-tour` event.
 */

/* eslint-disable react-hooks/set-state-in-effect -- this component is an
   effect-driven step machine: step transitions and per-frame layout are
   deliberately committed from effects. */
import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { getCurrentSession } from '../../services/supabaseClient';

const TOUR_KEY = 'bpp_tour_v2';

/**
 * The walkthrough is "seen once per user, per device" — keyed to the signed-in
 * user id so a genuinely new user sees it once and returning users never do.
 * Demo / signed-out visitors fall back to a shared device key.
 */
const resolveTourKey = async (): Promise<string> => {
  try {
    const session = await getCurrentSession();
    const uid = session?.user?.id;
    return uid ? `${TOUR_KEY}_${uid}` : `${TOUR_KEY}_demo`;
  } catch {
    return TOUR_KEY;
  }
};

// The walkthrough is a singleton, so the resolved per-user key is held at module
// scope (rather than a React ref) and read by the dismiss/finish handlers.
let activeTourKey = TOUR_KEY;

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

type Placement = 'below' | 'above' | 'right' | 'left' | 'sheet';

interface Rect { top: number; left: number; width: number; height: number; }
interface Layout {
  spot: Rect | null;
  card: { top: number; left: number; width: number; height: number };
  placement: Placement;
  arrowX: number | null; // px from card left edge (below/above)
  arrowY: number | null; // px from card top edge (left/right)
}

const PAD = 10;     // spotlight padding around the target (8–12px)
const GAP = 12;     // gap between target and card
const MARGIN = 12;  // min gap from viewport / safe-area edge
const ARROW = 8;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

const readInset = (name: string): number => {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    const n = parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  } catch {
    return 0;
  }
};

const findTarget = (selectors: string[]): HTMLElement | null => {
  // Prefer the first match that is actually visible (has size). This matters on
  // mobile, where e.g. the desktop "+ Add to Planner" button is display:none and
  // the mobile FAB is the real target (both share the data-tour anchor).
  let fallback: HTMLElement | null = null;
  for (const s of selectors) {
    const els = document.querySelectorAll<HTMLElement>(s);
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
      if (!fallback) fallback = el;
    }
  }
  return fallback;
};

// ─── Layout computation (the heart of the responsive behaviour) ───────────────

const computeLayout = (selectors: string[], measuredCardH: number | undefined): Layout => {
  const vv = window.visualViewport;
  const vw = vv?.width ?? window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;
  const vLeft = vv?.offsetLeft ?? 0;
  const vTop = vv?.offsetTop ?? 0;

  // iOS safe-area insets
  const sat = readInset('--bpp-sat');
  const sab = readInset('--bpp-sab');
  const sal = readInset('--bpp-sal');
  const sar = readInset('--bpp-sar');

  // Visible region (in layout-viewport coords, matching position:fixed)
  const visL = vLeft + sal;
  const visT = vTop + sat;
  const visR = vLeft + vw - sar;
  let visB = vTop + vh - sab;

  const el = findTarget(selectors);

  // Reserve the mobile Life Inbox tray's space so the card is never placed over
  // (or trapped behind) the drawer — unless the tray IS the current target
  // (the "drag from Ready" step), where the card should sit just above it.
  const tray = document.querySelector<HTMLElement>('.mobile-life-inbox-tray');
  if (tray && !(el && tray.contains(el))) {
    const tr = tray.getBoundingClientRect();
    if (tr.height > 0 && tr.top > visT) {
      visB = Math.min(visB, tr.top - GAP);
    }
  }

  const cardW = Math.round(Math.min(360, vw * 0.9, vw - 2 * MARGIN));
  const cardH = Math.min(measuredCardH || 220, Math.round(vh * 0.35));

  const minL = visL + MARGIN;
  const maxL = Math.max(minL, visR - cardW - MARGIN);
  const minT = visT + MARGIN;
  const maxT = Math.max(minT, visB - cardH - MARGIN);
  const clampL = (x: number) => clamp(x, minL, maxL);
  const clampT = (y: number) => clamp(y, minT, maxT);

  if (!el) {
    // No target yet (e.g. arrow controls hidden on mobile) — show the card as a
    // bottom sheet so manual-advance steps are never stuck.
    return {
      spot: null,
      card: { top: clampT(maxT), left: clampL((visL + visR - cardW) / 2), width: cardW, height: cardH },
      placement: 'sheet', arrowX: null, arrowY: null,
    };
  }

  const b = el.getBoundingClientRect();

  // Spotlight: pad, then clamp to the visible region so it never draws off-screen
  const sLeft = Math.max(visL, b.left - PAD);
  const sTop = Math.max(visT, b.top - PAD);
  const sRight = Math.min(visR, b.right + PAD);
  const sBottom = Math.min(visB, b.bottom + PAD);
  const spot: Rect | null = (sRight > sLeft && sBottom > sTop)
    ? { top: sTop, left: sLeft, width: sRight - sLeft, height: sBottom - sTop }
    : null;

  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const spaceBelow = visB - b.bottom - GAP;
  const spaceAbove = b.top - visT - GAP;
  const spaceRight = visR - b.right - GAP;
  const spaceLeft = b.left - visL - GAP;

  let placement: Placement;
  let top: number;
  let left: number;
  let arrowX: number | null = null;
  let arrowY: number | null = null;

  if (spaceBelow >= cardH) {
    placement = 'below';
    top = b.bottom + GAP;
    left = clampL(cx - cardW / 2);
    arrowX = clamp(cx - left, 18, cardW - 18);
  } else if (spaceAbove >= cardH) {
    placement = 'above';
    top = b.top - GAP - cardH;
    left = clampL(cx - cardW / 2);
    arrowX = clamp(cx - left, 18, cardW - 18);
  } else if (spaceRight >= cardW) {
    placement = 'right';
    left = b.right + GAP;
    top = clampT(cy - cardH / 2);
    arrowY = clamp(cy - top, 18, cardH - 18);
  } else if (spaceLeft >= cardW) {
    placement = 'left';
    left = b.left - GAP - cardW;
    top = clampT(cy - cardH / 2);
    arrowY = clamp(cy - top, 18, cardH - 18);
  } else {
    // Not enough room anywhere: bottom (or top) sheet, opposite the target.
    placement = 'sheet';
    left = clampL(cx - cardW / 2);
    const targetInTopHalf = cy < (visT + visB) / 2;
    top = targetInTopHalf ? maxT : minT;
  }

  top = clampT(top);
  left = clampL(left);

  return { spot, card: { top, left, width: cardW, height: cardH }, placement, arrowX, arrowY };
};

const layoutSig = (l: Layout): string => {
  const r = (n: number) => Math.round(n);
  const s = l.spot ? `${r(l.spot.top)},${r(l.spot.left)},${r(l.spot.width)},${r(l.spot.height)}` : 'x';
  return `${l.placement}|${r(l.card.top)},${r(l.card.left)},${l.card.width},${r(l.card.height)}|${s}|${l.arrowX ?? 'x'}|${l.arrowY ?? 'x'}`;
};

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
  onOpenAddModal?: () => void;
  onCloseAddModal?: () => void;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ onOpenAddModal, onCloseAddModal }) => {
  const [step, setStep] = useState<TourStep | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [visible, setVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [inputHasText, setInputHasText] = useState(false);
  const raf = useRef<number>(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<string>('');
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

  // Start the tour (first visit for this user, or forced via ?tour=1)
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      const forceTour = params.get('tour') === '1';
      const key = await resolveTourKey();
      if (cancelled) return;
      activeTourKey = key;
      if (forceTour) {
        params.delete('tour');
        const newSearch = params.toString();
        window.history.replaceState({}, '',
          window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash);
        localStorage.removeItem(key);
      }
      if (forceTour || !localStorage.getItem(key)) {
        timer = setTimeout(() => {
          const inputOpen = !!document.querySelector('[data-tour="quick-add-input"]');
          setStep(inputOpen ? 'type' : 'open_input');
        }, 800);
      }
    })();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  // Replay on demand (Settings, empty-state prompts) without a reload
  useEffect(() => {
    const onStart = () => {
      localStorage.removeItem(activeTourKey);
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

  useEffect(() => {
    if (step === 'open_input' && modalOpen) setStep('type');
  }, [step, modalOpen]);

  useEffect(() => {
    if ((step === 'type' || step === 'add_ready') && !modalOpen) onOpenAddModal?.();
    if (step === 'type' && modalOpen) {
      document.querySelector<HTMLInputElement>('[data-tour="quick-add-input"]')?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, modalOpen]);

  useEffect(() => {
    if ((step === 'add_ready' || step === 'type') &&
        baseUnsched.current !== null && unscheduled > baseUnsched.current) {
      onCloseAddModal?.();
      setStep('show_ready');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, unscheduled]);

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

  // Expose the active step on <body> so CSS can keep the mobile Life Inbox /
  // FAB visible-but-dimmed and non-interactive during the walkthrough (except
  // the one control each step actually targets). Cleared when the tour ends.
  useEffect(() => {
    if (step && step !== 'complete') {
      document.body.dataset.tourStep = step;
    } else {
      delete document.body.dataset.tourStep;
    }
    return () => { delete document.body.dataset.tourStep; };
  }, [step]);

  // Scroll the target into view within its scroll container (window, modal,
  // sheet, drawer) once the step settles, so the spotlight wraps a fully
  // visible element.
  useEffect(() => {
    if (!step || step === 'complete') return;
    let cancelled = false;
    const scrollToTarget = () => {
      if (cancelled) return;
      const el = findTarget(STEP_SELECTORS[step]);
      if (el) {
        try {
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
        } catch {
          el.scrollIntoView();
        }
      }
    };
    // Wait for modal/sheet open + layout to settle, then scroll.
    const t1 = setTimeout(scrollToTarget, 280);
    const t2 = setTimeout(scrollToTarget, 650);
    return () => { cancelled = true; clearTimeout(t1); clearTimeout(t2); };
  }, [step]);

  // Continuously recompute layout: handles scroll, resize, orientation change,
  // browser-chrome show/hide, keyboard open/close, modal animation, etc.
  useEffect(() => {
    if (!step || step === 'complete') { setLayout(null); sigRef.current = ''; return; }
    const tick = () => {
      const next = computeLayout(STEP_SELECTORS[step], cardRef.current?.offsetHeight);
      const sig = layoutSig(next);
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setLayout(next);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [step]);

  const dismiss = () => {
    localStorage.setItem(activeTourKey, '1');
    onCloseAddModal?.();
    setVisible(false);
    setTimeout(() => setStep(null), 300);
  };
  const finish = () => {
    onCloseAddModal?.();
    localStorage.setItem(activeTourKey, '1');
    setVisible(false);
    setTimeout(() => setStep('complete'), 300);
  };
  const goNext = () => {
    const i = ORDER.indexOf(step as Exclude<TourStep, 'complete'>);
    if (i >= 0 && i < ORDER.length - 1) setStep(ORDER[i + 1]);
    else finish();
  };

  if (!step || step === 'complete' || !layout) return null;

  const config = STEP_CONFIG[step];
  const { spot, card, placement, arrowX, arrowY } = layout;
  const panelPE: React.CSSProperties['pointerEvents'] =
    step === 'type' || step === 'add_ready' ? 'auto' : 'none';

  const manualNext =
    step === 'type' ? { label: 'Next', disabled: !inputHasText, onClick: goNext } :
    step === 'place_block' ? { label: 'Next', disabled: false, onClick: goNext } :
    step === 'arrows' ? { label: 'Next', disabled: false, onClick: goNext } :
    step === 'drag' ? { label: 'Finish', disabled: false, onClick: finish } :
    null;

  const lifted = step === 'place_block' || step === 'drag';

  return (
    <div
      className="pointer-events-none fixed inset-0 z-tour"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.25s ease' }}
      aria-live="polite"
    >
      {/* Dimming + spotlight cutout */}
      {spot ? (
        <>
          <div className="absolute bg-black/60 left-0 right-0 top-0" style={{ height: Math.max(0, spot.top), pointerEvents: panelPE }} />
          <div className="absolute bg-black/60 left-0 right-0 bottom-0" style={{ top: spot.top + spot.height, pointerEvents: panelPE }} />
          <div className="absolute bg-black/60" style={{ top: spot.top, height: spot.height, left: 0, width: Math.max(0, spot.left), pointerEvents: panelPE }} />
          <div className="absolute bg-black/60" style={{ top: spot.top, height: spot.height, left: spot.left + spot.width, right: 0, pointerEvents: panelPE }} />

          <div
            className={`absolute rounded-large ${step === 'arrows' ? 'animate-pulse' : ''}`}
            style={{
              top: spot.top, left: spot.left, width: spot.width, height: spot.height,
              boxShadow: lifted
                ? '0 0 0 3px #7C5CFC, 0 0 0 7px rgba(124,92,252,0.30), 0 14px 40px 4px rgba(124,92,252,0.45)'
                : '0 0 0 3px #7C5CFC, 0 0 0 7px rgba(124,92,252,0.28), 0 0 26px 4px rgba(124,92,252,0.30)',
              pointerEvents: 'none',
            }}
          />

          {step === 'type' && (
            <InlinePill text="Start here" cx={spot.left + spot.width / 2} top={spot.top - 30} />
          )}
          {step === 'drag' && (
            <InlinePill text="Click, hold and drag" cx={spot.left + spot.width / 2} top={spot.top - 30} />
          )}
        </>
      ) : (
        <div className="absolute inset-0 bg-black/60" style={{ pointerEvents: panelPE }} />
      )}

      {/* Arrow connecting card to target */}
      {placement !== 'sheet' && (
        <CardArrow placement={placement} card={card} arrowX={arrowX} arrowY={arrowY} />
      )}

      {/* Instruction card */}
      <div
        ref={cardRef}
        className="tour-card pointer-events-auto fixed flex flex-col bg-white rounded-large shadow-modal border border-border-default overflow-hidden"
        style={{ top: card.top, left: card.left, width: card.width }}
      >
        <div className="tour-card__body overflow-y-auto px-4 pt-4 pb-2">
          {/* Progress dots */}
          <div className="flex gap-1 mb-3">
            {ORDER.map((s) => (
              <div key={s} className="h-1.5 rounded-full transition-all"
                style={{ width: s === step ? 18 : 6, background: s === step ? '#7C5CFC' : '#E2E8F0' }} />
            ))}
          </div>

          <div className="text-[13px] font-bold text-text-primary mb-1">{config.title}</div>
          <p className="text-[12px] text-text-secondary leading-relaxed">{config.body}</p>

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
        </div>

        {/* Footer — always visible, clears the home indicator / browser chrome */}
        <div
          className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border-default/60 bg-white"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={dismiss}
            className="text-[11px] text-text-muted hover:text-text-secondary transition-colors text-left"
            title="You can replay this any time from Settings"
          >
            Skip, replay in Settings
          </button>
          {manualNext && (
            <button
              onClick={manualNext.onClick}
              disabled={manualNext.disabled}
              className="h-9 px-4 flex-shrink-0 bg-accent-primary hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-bold rounded-small transition-colors"
            >
              {manualNext.label} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Card arrow ───────────────────────────────────────────────────────────────

const CardArrow: React.FC<{
  placement: Placement;
  card: { top: number; left: number; width: number; height: number };
  arrowX: number | null;
  arrowY: number | null;
}> = ({ placement, card, arrowX, arrowY }) => {
  const base: React.CSSProperties = { position: 'fixed', width: 0, height: 0, pointerEvents: 'none' };
  if (placement === 'below' && arrowX != null) {
    return <div style={{ ...base, top: card.top - ARROW, left: card.left + arrowX - ARROW,
      borderLeft: `${ARROW}px solid transparent`, borderRight: `${ARROW}px solid transparent`,
      borderBottom: `${ARROW}px solid white`, filter: 'drop-shadow(0 -1px 0 rgba(0,0,0,0.06))' }} />;
  }
  if (placement === 'above' && arrowX != null) {
    return <div style={{ ...base, top: card.top + card.height, left: card.left + arrowX - ARROW,
      borderLeft: `${ARROW}px solid transparent`, borderRight: `${ARROW}px solid transparent`,
      borderTop: `${ARROW}px solid white`, filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.06))' }} />;
  }
  if (placement === 'right' && arrowY != null) {
    return <div style={{ ...base, top: card.top + arrowY - ARROW, left: card.left - ARROW,
      borderTop: `${ARROW}px solid transparent`, borderBottom: `${ARROW}px solid transparent`,
      borderRight: `${ARROW}px solid white`, filter: 'drop-shadow(-1px 0 0 rgba(0,0,0,0.06))' }} />;
  }
  if (placement === 'left' && arrowY != null) {
    return <div style={{ ...base, top: card.top + arrowY - ARROW, left: card.left + card.width,
      borderTop: `${ARROW}px solid transparent`, borderBottom: `${ARROW}px solid transparent`,
      borderLeft: `${ARROW}px solid white`, filter: 'drop-shadow(1px 0 0 rgba(0,0,0,0.06))' }} />;
  }
  return null;
};

// ─── Inline pill (anchored to the spotlight, clamped on-screen) ────────────────

const InlinePill: React.FC<{ text: string; cx: number; top: number }> = ({ text, cx, top }) => {
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const left = clamp(cx, 72, vw - 72);
  const clampedTop = Math.max((window.visualViewport?.offsetTop ?? 0) + 6, top);
  return (
    <div className="fixed flex flex-col items-center pointer-events-none" style={{ top: clampedTop, left, transform: 'translateX(-50%)' }}>
      <span className="rounded-full bg-accent-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm whitespace-nowrap max-w-[80vw] truncate">
        {text}
      </span>
      <span className="w-0 h-0" style={{ borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid #7C5CFC' }} />
    </div>
  );
};

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
    body: 'This drops your item into the Ready list, where it waits until you place it on your week. Click to add it.',
  },
  show_ready: {
    title: 'Your item is waiting here',
    body: 'This is where unscheduled items wait until you place them. Now drag it onto any day in your week.',
  },
  place_block: {
    title: 'Move your block into place',
    body: 'You can move a block in two ways. Tap the block and use the arrows for precise changes, or press, hold and drag it directly into the right place.',
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
