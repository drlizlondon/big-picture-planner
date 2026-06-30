// Planner Header Component
import React from 'react';
import { getStartOfWeek, addDays } from '../../utils/dateUtils';
import { SyncStatusPanel } from '../SyncStatusPanel/component';

type PlannerViewMode = 'day' | 'week' | 'month';

interface Props {
  currentDate: Date;
  viewMode?: PlannerViewMode;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onOpenSetup: () => void;
  textScale: number;
  canDecreaseText: boolean;
  canIncreaseText: boolean;
  onDecreaseText: () => void;
  onIncreaseText: () => void;
}

export const PlannerHeader: React.FC<Props> = ({
  currentDate,
  viewMode = 'week',
  onPrevWeek,
  onNextWeek,
  onToday,
  onOpenSetup,
  textScale,
  canDecreaseText,
  canIncreaseText,
  onDecreaseText,
  onIncreaseText,
}) => {
  const startOfWeek = getStartOfWeek(currentDate);
  const endOfWeek = addDays(startOfWeek, 6);

  const formatOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  const startStr = startOfWeek.toLocaleDateString('en-GB', formatOptions);
  const endStr = endOfWeek.toLocaleDateString('en-GB', formatOptions);
  const year = startOfWeek.getFullYear();

  // The range label matches the active view: a month, a week span, or a day.
  let rangeLabel: string;
  let mobileRangeLabel: string;
  if (viewMode === 'month') {
    rangeLabel = currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    mobileRangeLabel = currentDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  } else if (viewMode === 'day') {
    rangeLabel = currentDate.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    mobileRangeLabel = currentDate.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
  } else {
    rangeLabel = `${startStr} - ${endStr} ${year}`;
    mobileRangeLabel = `${startStr} - ${endStr}`;
  }
  const navLabel = viewMode === 'month' ? 'month' : viewMode === 'day' ? 'day' : 'week';

  return (
    <header className="planner-header h-[76px] bg-white/95 backdrop-blur flex items-center px-5 justify-between gap-4 sticky top-0 z-header border-b border-border-default/50">
      <div className="planner-header-main flex items-center gap-5">
        <div className="planner-brand">
          <div className="flex items-center gap-2">
            <div className="text-[20px] font-bold tracking-tight text-text-primary">Big Picture Planner</div>
            <span
              className="founder-badge rounded-full bg-accent-primary/10 text-accent-primary text-[10px] font-bold uppercase tracking-wide px-2 py-0.5"
              title="You're an early founder member — expect rough edges, and your feedback shapes what we build."
            >
              Founder Beta
            </span>
          </div>
          <div className="text-[11px] font-medium text-text-secondary">See the big picture. Fit everything in.</div>
        </div>
        
        <div className="planner-nav flex items-center gap-3 pl-3">
          <button onClick={onToday} className="planner-today-button h-9 text-[12px] font-semibold px-4 hover:bg-background rounded-medium border border-border-default shadow-sm transition-colors bg-surface-primary">
            Today
          </button>
          <div className="planner-week-nav flex items-center gap-3">
            <button onClick={onPrevWeek} className="planner-week-button h-9 w-9 border border-border-default hover:bg-background rounded-medium shadow-sm transition-colors text-text-secondary hover:text-text-primary bg-surface-primary" aria-label={`Previous ${navLabel}`}>
              ←
            </button>
            <span className="planner-week-range text-[16px] font-bold w-[230px] text-center text-text-primary">
              <span className="planner-week-range-desktop">{rangeLabel}</span>
              <span className="planner-week-range-mobile">{mobileRangeLabel}</span>
            </span>
            <button onClick={onNextWeek} className="planner-week-button h-9 w-9 border border-border-default hover:bg-background rounded-medium shadow-sm transition-colors text-text-secondary hover:text-text-primary bg-surface-primary" aria-label={`Next ${navLabel}`}>
              →
            </button>
          </div>
        </div>
      </div>
      
      <div className="planner-header-actions flex items-center gap-3">
        <TextZoomControls
          textScale={textScale}
          canDecreaseText={canDecreaseText}
          canIncreaseText={canIncreaseText}
          onDecreaseText={onDecreaseText}
          onIncreaseText={onIncreaseText}
        />
        <PlanningLegend />
        <SyncStatusPanel />
        <button onClick={onOpenSetup} className="planner-setup-button h-9 w-9 hover:bg-background rounded-medium border border-border-default shadow-sm transition-colors flex items-center justify-center text-text-secondary hover:text-text-primary" aria-label="Planner Setup" title="Planner Setup">
          <span aria-hidden="true">⚙</span>
        </button>
      </div>
    </header>
  );
};

interface TextZoomControlsProps {
  textScale: number;
  canDecreaseText: boolean;
  canIncreaseText: boolean;
  onDecreaseText: () => void;
  onIncreaseText: () => void;
}

const TextZoomControls: React.FC<TextZoomControlsProps> = ({
  textScale,
  canDecreaseText,
  canIncreaseText,
  onDecreaseText,
  onIncreaseText,
}) => (
  <div className="planner-text-zoom inline-flex items-center rounded-medium border border-border-default bg-surface-primary p-0.5 shadow-sm" title="Planner text size">
    <button
      type="button"
      onClick={onDecreaseText}
      disabled={!canDecreaseText}
      className="h-8 w-8 rounded-small text-[16px] font-bold text-text-secondary hover:bg-background hover:text-text-primary disabled:opacity-35"
      aria-label="Decrease planner text"
    >
      -
    </button>
    <span className="min-w-9 text-center text-[11px] font-bold text-text-muted" aria-live="polite">
      {Math.round(textScale * 100)}%
    </span>
    <button
      type="button"
      onClick={onIncreaseText}
      disabled={!canIncreaseText}
      className="h-8 w-8 rounded-small text-[16px] font-bold text-text-secondary hover:bg-background hover:text-text-primary disabled:opacity-35"
      aria-label="Increase planner text"
    >
      +
    </button>
  </div>
);

const PlanningLegend: React.FC = () => (
  <div className="hidden 2xl:flex items-center gap-3 rounded-medium border border-border-default bg-surface-primary px-3 py-1.5 shadow-sm">
    <LegendItem color="#8A93A3" label="Flexible task" />
    <LegendItem color="#F59E0B" label="Fixed/review" />
    <LegendItem color="#5B35F5" label="Personal time" />
    <LegendItem color="#44A7F7" label="Travel" />
    <LegendItem color="#E85D75" label="Conflict" />
  </div>
);

const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-text-secondary whitespace-nowrap">
    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
    {label}
  </div>
);
