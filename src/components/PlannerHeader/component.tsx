// Planner Header Component
import React from 'react';
import { getStartOfWeek, addDays } from '../../utils/dateUtils';
import { SyncStatusPanel } from '../SyncStatusPanel/component';

interface Props {
  currentDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onOpenSetup: () => void;
}

export const PlannerHeader: React.FC<Props> = ({ currentDate, onPrevWeek, onNextWeek, onToday, onOpenSetup }) => {
  const startOfWeek = getStartOfWeek(currentDate);
  const endOfWeek = addDays(startOfWeek, 6);
  
  const formatOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  const startStr = startOfWeek.toLocaleDateString('en-GB', formatOptions);
  const endStr = endOfWeek.toLocaleDateString('en-GB', formatOptions);
  const year = startOfWeek.getFullYear();
  const mobileWeekRange = `${startOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${endOfWeek.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
  
  const weekRange = `${startStr} - ${endStr} ${year}`;

  return (
    <header className="planner-header h-[82px] bg-white/95 backdrop-blur flex items-center px-6 justify-between gap-5 sticky top-0 z-header border-b border-border-default/50">
      <div className="planner-header-main flex items-center gap-6">
        <div className="planner-brand">
          <div className="text-[22px] font-bold tracking-tight text-text-primary">Big Picture Planner</div>
          <div className="text-[11px] font-medium text-text-secondary">See the big picture. Fit everything in.</div>
        </div>
        
        <div className="planner-nav flex items-center gap-3 pl-4">
          <button onClick={onToday} className="planner-today-button h-10 text-[13px] font-semibold px-5 hover:bg-background rounded-medium border border-border-default shadow-sm transition-colors bg-surface-primary">
            Today
          </button>
          <div className="planner-week-nav flex items-center gap-3">
            <button onClick={onPrevWeek} className="planner-week-button h-10 w-10 border border-border-default hover:bg-background rounded-medium shadow-sm transition-colors text-text-secondary hover:text-text-primary bg-surface-primary" aria-label="Previous Week">
              ←
            </button>
            <span className="planner-week-range text-[17px] font-bold w-[240px] text-center text-text-primary">
              <span className="planner-week-range-desktop">{weekRange}</span>
              <span className="planner-week-range-mobile">{mobileWeekRange}</span>
            </span>
            <button onClick={onNextWeek} className="planner-week-button h-10 w-10 border border-border-default hover:bg-background rounded-medium shadow-sm transition-colors text-text-secondary hover:text-text-primary bg-surface-primary" aria-label="Next Week">
              →
            </button>
          </div>
        </div>
      </div>
      
      <div className="planner-header-actions flex items-center gap-6">
        <PlanningLegend />
        <SyncStatusPanel />
        <button onClick={onOpenSetup} className="planner-setup-button h-10 text-[13px] font-semibold px-4 hover:bg-background rounded-medium border border-border-default shadow-sm transition-colors flex items-center gap-2">
          <span aria-hidden="true">⚙</span>
          Planner Setup
        </button>
      </div>
    </header>
  );
};

const PlanningLegend: React.FC = () => (
  <div className="hidden lg:flex items-center gap-4 rounded-medium border border-border-default bg-surface-primary px-4 py-2 shadow-sm">
    <LegendItem color="#8A93A3" label="Flexible task" />
    <LegendItem color="#F59E0B" label="Fixed/review" />
    <LegendItem color="#5B35F5" label="Personal time" />
    <LegendItem color="#44A7F7" label="Travel" />
    <LegendItem color="#E85D75" label="Conflict" />
  </div>
);

const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary whitespace-nowrap">
    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
    {label}
  </div>
);
