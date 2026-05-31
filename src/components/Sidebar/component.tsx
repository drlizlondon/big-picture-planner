// Sidebar Component
import React from 'react';
import { ToSchedulePanel } from '../ToSchedulePanel/component';
import { TemplatePanel } from '../TemplatePanel/component';
import { useWeekBlocks } from '../../hooks/usePlannerData';
import { formatDate } from '../../utils/dateUtils';
import { timeToMinutes } from '../../utils/planningEngine';

interface SidebarProps {
  onAddClick: () => void;
  onEditBlock: (blockId: string) => void;
  onViewToday: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onAddClick, onEditBlock, onViewToday }) => {
  return (
    <>
      {/* Add To Planner Button */}
      <button onClick={onAddClick} className="w-full h-11 bg-accent-primary hover:bg-accent-hover text-white rounded-medium font-bold text-[14px] transition-colors shadow-sm">
        + Add to Planner
      </button>

      <TodayPanel onViewToday={onViewToday} onEditBlock={onEditBlock} />

      {/* Main Inbox */}
      <ToSchedulePanel onEditBlock={onEditBlock} />
      
      {/* Templates */}
      <TemplatePanel />
    </>
  );
};

interface TodayPanelProps {
  onViewToday: () => void;
  onEditBlock: (blockId: string) => void;
}

const TodayPanel: React.FC<TodayPanelProps> = ({ onViewToday, onEditBlock }) => {
  const today = formatDate(new Date());
  const todayBlocks = useWeekBlocks(today, today) || [];
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const sortedBlocks = [...todayBlocks].sort((a, b) => timeToMinutes(a.startTime || '00:00') - timeToMinutes(b.startTime || '00:00'));
  const nextBlock = sortedBlocks.find(block => block.startTime && timeToMinutes(block.startTime) >= nowMinutes) || sortedBlocks[0];
  const laterBlocks = nextBlock
    ? sortedBlocks.filter(block => block.id !== nextBlock.id && block.startTime && timeToMinutes(block.startTime) >= nowMinutes).slice(0, 3)
    : [];

  return (
    <section className="bg-surface-primary rounded-medium border border-border-default p-3 shadow-sm flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-semibold">Today</h2>
        <span className="text-[11px] font-semibold text-text-muted">Next up</span>
      </div>

      {nextBlock ? (
        <button
          onClick={() => onEditBlock(nextBlock.id)}
          className="text-left rounded-small border border-border-default bg-background hover:border-accent-primary/40 p-2.5 transition-colors"
          title="Edit next placed block"
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-accent-primary">Next</div>
          <div className="mt-1 text-[13px] font-semibold text-text-primary truncate">{nextBlock.title}</div>
          <div className="mt-1 text-[12px] text-text-secondary">{nextBlock.startTime || 'Waiting for a time'}</div>
        </button>
      ) : (
        <p className="text-[13px] text-text-secondary">Nothing placed today.</p>
      )}

      {nextBlock && laterBlocks.length > 0 && (
        <div className="text-[12px] text-text-secondary">
          <div className="font-semibold mb-1">Later today</div>
          <div className="flex flex-col gap-0.5">
            {laterBlocks.map(block => (
              <button key={block.id} onClick={() => onEditBlock(block.id)} className="truncate text-left hover:text-text-primary">
                {block.startTime} · {block.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {nextBlock && laterBlocks.length === 0 && (
        <p className="text-[12px] text-text-secondary">Later today: nothing else placed yet.</p>
      )}

      <button
        onClick={onViewToday}
        className="h-[36px] rounded-small bg-background hover:bg-border-default border border-border-default text-[13px] font-semibold text-text-primary transition-colors"
      >
        {nextBlock ? 'View Today' : 'Choose something from Life Inbox'}
      </button>
    </section>
  );
};
