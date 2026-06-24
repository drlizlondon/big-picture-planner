// Week Canvas Component
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { addDays, formatDate, getStartOfWeek, getWeekDays } from '../../utils/dateUtils';
import { DayColumn } from '../DayColumn/component';
import { useWeekBlocks } from '../../hooks/usePlannerData';
import type { PlannerBlock } from '../../types/models';
import { matchesPlannerFilters, type PlannerFilterId } from '../../utils/plannerFilters';

type ViewMode = 'day' | 'week' | 'month';
type ZoomMode = 'compact' | 'comfortable' | 'focus';
type VisibleHoursPreset = '06-22' | '07-22' | '08-22' | 'custom';

const ZOOM_SCALE: Record<ZoomMode, number> = {
  compact: 0.92,
  comfortable: 1,
  focus: 1.12,
};

interface Props {
  currentDate: Date;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onEditBlock: (blockId: string) => void;
  onSelectBlock: (blockId: string) => void;
  selectedBlockId: string | null;
  expandedDate?: string | null;
  isDraggingBlock?: boolean;
  activeFilters: PlannerFilterId[];
  onSlotClick?: (position: { date: string; startTime: string }) => void;
  /** Mobile: focus (widen) one day, collapsing the others to thin rails. Toggles. */
  onToggleExpandDay?: (date: string) => void;
  /** Month view: open a specific day in day view (double-click a day cell). */
  onOpenDay?: (date: string) => void;
}

export const WeekGrid: React.FC<Props> = ({ currentDate, viewMode, onViewModeChange, onEditBlock, onSelectBlock, selectedBlockId, expandedDate = null, isDraggingBlock = false, activeFilters, onSlotClick, onToggleExpandDay, onOpenDay }) => {
  const setViewMode = onViewModeChange;
  const [zoomMode, setZoomMode] = usePersistedSetting<ZoomMode>('planner.zoomMode', 'comfortable');
  const [visibleHoursPreset, setVisibleHoursPreset] = usePersistedSetting<VisibleHoursPreset>('planner.visibleHoursPreset', '07-22');
  const [customStartHour, setCustomStartHour] = usePersistedNumberSetting('planner.visibleHoursCustomStart', 7);
  const [customEndHour, setCustomEndHour] = usePersistedNumberSetting('planner.visibleHoursCustomEnd', 22);
  const today = formatDate(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [boardHeight, setBoardHeight] = useState(640);
  const isMobile = useIsMobile();

  // The grid ALWAYS renders the full day (00:00–23:59) so any event is reachable
  // by scrolling (req #1). The "working window" only sets the default density and
  // the position the grid scrolls to — it never clips what can be seen (req #2).
  const selectedWorkingRange = useMemo(
    () => getVisibleHourRange(visibleHoursPreset, customStartHour, customEndHour),
    [visibleHoursPreset, customStartHour, customEndHour]
  );
  const workingRange = useMemo(
    () => isMobile ? getMobileVisibleHourRange(boardHeight) : selectedWorkingRange,
    [boardHeight, isMobile, selectedWorkingRange]
  );
  const fullDayHours = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
  const workingHoursCount = Math.max(1, workingRange.end - workingRange.start);
  // Size an hour so the working window fills the viewport; the rest of the day
  // overflows and becomes scrollable.
  const fitHourHeight = Math.max(isMobile ? 22 : 32, (boardHeight - (isMobile ? 56 : 112)) / workingHoursCount);
  const hourHeight = fitHourHeight * (isMobile ? 1 : ZOOM_SCALE[zoomMode]);
  const minuteHeight = hourHeight / 60;

  // Default-scroll to the working window on mount and whenever the working window,
  // view, or board size changes intentionally. Plain user scrolling doesn't change
  // these deps, so we never fight the user once they scroll to another hour.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || viewMode === 'month') return;
    el.scrollTop = workingRange.start * hourHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, workingRange.start, workingRange.end, boardHeight]);

  // When a block is moved/saved outside the current scroll position (arrow keys,
  // editor save), bring its time into view by scrolling — full day is always rendered.
  useEffect(() => {
    const onEnsure = (e: Event) => {
      const detail = (e as CustomEvent<{ startHour: number; endHour: number }>).detail;
      if (!detail) return;
      const el = scrollRef.current;
      if (!el) return;
      const top = detail.startHour * hourHeight;
      const bottom = detail.endHour * hourHeight;
      if (top < el.scrollTop) {
        el.scrollTop = top;
      } else if (bottom > el.scrollTop + el.clientHeight) {
        el.scrollTop = bottom - el.clientHeight;
      }
    };
    window.addEventListener('planner:ensure-time-visible', onEnsure);
    return () => window.removeEventListener('planner:ensure-time-visible', onEnsure);
  }, [hourHeight]);

  const visibleDates = useMemo(() => {
    if (viewMode === 'day') {
      return [{ label: currentDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), value: formatDate(currentDate) }];
    }
    return getWeekDays(currentDate);
  }, [currentDate, viewMode]);

  const monthDates = useMemo(() => getMonthCanvasDays(currentDate), [currentDate]);
  const queryStart = viewMode === 'month' ? monthDates[0].value : visibleDates[0].value;
  const queryEnd = viewMode === 'month' ? monthDates[monthDates.length - 1].value : visibleDates[visibleDates.length - 1].value;
  const allVisibleBlocks = useWeekBlocks(queryStart, queryEnd) || [];
  const visibleBlocks = allVisibleBlocks.filter(block => matchesPlannerFilters(block, activeFilters));

  // Current-time marker: which column is "today" and where "now" sits in the day.
  const nowMinute = useNowMinute();
  const todayIndex = viewMode === 'month' ? -1 : visibleDates.findIndex(day => day.value === today);
  // Only treat a day as expanded when it's actually in the current view, so a
  // stale expanded date from another week doesn't collapse every column to a rail.
  const expandedInView = !!expandedDate && visibleDates.some(day => day.value === expandedDate);

  // All-day / multi-day events get their own sticky lane above the time grid
  // (they have no start time, so they can't sit in an hour slot). Only shown
  // when at least one all-day event falls in view, so it never wastes space.
  const allDayByDate = visibleBlocks.reduce<Record<string, PlannerBlock[]>>((acc, block) => {
    if (block.isAllDay && block.date) (acc[block.date] = acc[block.date] || []).push(block);
    return acc;
  }, {});
  const hasAllDayLane = Object.keys(allDayByDate).length > 0;

  useEffect(() => {
    if (!scrollRef.current) return;
    const element = scrollRef.current;
    const updateHeight = () => setBoardHeight(element.clientHeight);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={scrollRef} data-tour="week-grid" className={`week-grid-shell flex flex-col h-full overflow-auto bg-white ${expandedInView ? 'has-expanded-day' : ''} ${isDraggingBlock ? 'is-dragging-block' : ''}`}>
      <div className="sticky top-0 z-header bg-surface-primary/95 backdrop-blur border-b border-border-default/70 px-4 py-2">
        <div className="week-grid-toolbar flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-[230px] flex items-baseline gap-2">
            <div className="text-[15px] font-bold text-text-primary">Fit your life into the week</div>
            <div className="planner-scaled-label text-text-secondary">
              {isMobile ? 'Drag from Life Inbox' : visibleBlocks.length === 0 ? 'Drag from Ready to schedule' : `${visibleBlocks.length} visible this week`}
            </div>
          </div>
          <div className="week-grid-controls flex flex-nowrap justify-end items-center gap-2 overflow-x-auto min-w-0 pb-1">
            <SegmentedControl
              value={viewMode}
              options={['day', 'week', 'month']}
              labels={{ day: 'Day', week: 'Week', month: 'Month' }}
              onChange={setViewMode}
            />
            <SegmentedControl
              value={zoomMode}
              options={['compact', 'comfortable', 'focus']}
              labels={{ compact: 'Compact', comfortable: 'Comfortable', focus: 'Focus' }}
              onChange={setZoomMode}
            />
            <ZoomSelect value={zoomMode} onChange={setZoomMode} />
            <VisibleHoursControl
              preset={visibleHoursPreset}
              onPresetChange={setVisibleHoursPreset}
              customStartHour={customStartHour}
              customEndHour={customEndHour}
              onCustomStartChange={setCustomStartHour}
              onCustomEndChange={setCustomEndHour}
            />
          </div>
        </div>
      </div>

      {viewMode === 'month' ? (
        <MonthCanvas dates={monthDates} blocks={visibleBlocks} today={today} onEditBlock={onEditBlock} onSelectBlock={onSelectBlock} onOpenDay={onOpenDay} />
      ) : (
        <>
          <div className="week-days-header flex border-b border-border-default/70 h-10 sticky top-[53px] bg-surface-primary z-header shadow-sm">
            <div className="week-time-gutter w-12 flex-shrink-0 border-r border-border-default/60" />
            {visibleDates.map(day => {
              const isExpanded = expandedInView && expandedDate === day.value;
              const isTodayCol = day.value === today;
              const tappable = isMobile && !!onToggleExpandDay && viewMode !== 'day';
              return (
              <div
                key={day.value}
                role={tappable ? 'button' : undefined}
                tabIndex={tappable ? 0 : undefined}
                aria-pressed={tappable ? isExpanded : undefined}
                aria-label={tappable ? `${isExpanded ? 'Collapse' : 'Expand'} ${day.label}` : undefined}
                onClick={tappable ? () => onToggleExpandDay!(day.value) : undefined}
                onKeyDown={tappable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpandDay!(day.value); } } : undefined}
                className={`week-day-heading ${isExpanded ? 'expanded-day' : ''} flex-1 min-w-0 flex items-center justify-center gap-1 border-r border-border-default/35 last:border-r-0 ${isTodayCol ? 'bg-accent-primary/[0.06]' : ''} ${tappable ? 'cursor-pointer select-none' : ''}`}
              >
                {isTodayCol && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-primary" aria-hidden="true" />}
                <span className={`text-[13px] font-bold whitespace-nowrap ${isTodayCol ? 'text-accent-primary' : 'text-text-primary'}`}>{day.label}</span>
                {tappable && <span className="day-expand-caret text-[9px] text-text-muted" aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>}
              </div>
              );
            })}
          </div>

          {hasAllDayLane && (
            <div className="all-day-lane flex border-b border-border-default/70 bg-surface-primary shadow-sm" data-all-day-lane="true">
              <div className="week-time-gutter w-12 flex-shrink-0 border-r border-border-default/50 flex items-center justify-center">
                <span className="planner-scaled-small font-semibold text-text-muted">all-day</span>
              </div>
              {visibleDates.map(day => (
                <AllDayCell
                  key={day.value}
                  blocks={allDayByDate[day.value] || []}
                  isToday={day.value === today}
                  onEditBlock={onEditBlock}
                  onSelectBlock={onSelectBlock}
                />
              ))}
            </div>
          )}

          <div className="flex flex-1 relative min-h-max" data-tour="time-grid" data-fullday-grid="true">
            <div className="week-time-gutter w-12 flex-shrink-0 border-r border-border-default/50 flex flex-col bg-surface-primary">
              {fullDayHours.map(hour => (
                <div key={hour} data-hour={hour} className="planner-scaled-small flex justify-center text-text-muted font-semibold pt-2 border-b border-border-default/55 box-border" style={{ height: `${hourHeight}px` }}>
                  {`${String(hour).padStart(2, '0')}:00`}
                </div>
              ))}
              <div className="relative h-0 flex justify-center text-text-muted text-[11px] font-medium">
                <span className="planner-scaled-small -translate-y-1/2 font-semibold">24:00</span>
              </div>
            </div>

            {visibleDates.map(day => (
              <DayColumn
                key={day.value}
                date={day.value}
                onEditBlock={onEditBlock}
                onSelectBlock={onSelectBlock}
                selectedBlockId={selectedBlockId}
                hourHeight={hourHeight}
                visibleHours={fullDayHours}
                visibleStartHour={0}
                visibleEndHour={24}
                isExpanded={expandedInView && expandedDate === day.value}
                activeFilters={activeFilters}
                onSlotClick={onSlotClick}
              />
            ))}

            {todayIndex >= 0 && (
              <CurrentTimeMarker
                minute={nowMinute}
                minuteHeight={minuteHeight}
                todayIndex={todayIndex}
                columnCount={visibleDates.length}
                showDot={!expandedInView}
              />
            )}

            <EmptyWeekPrompt />
          </div>
          {!isMobile && <KeyboardHint selectedBlock={visibleBlocks.find(block => block.id === selectedBlockId)} />}
          <div className="h-4 flex-shrink-0 bg-white" />
        </>
      )}
    </div>
  );
};

const KeyboardHint: React.FC<{ selectedBlock?: PlannerBlock }> = ({ selectedBlock }) => (
  <div data-tour="arrow-controls" className="keyboard-hint sticky bottom-0 z-header border-t border-border-default/70 bg-surface-primary/95 px-4 py-2 shadow-sm backdrop-blur">
    <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-center gap-2 text-[11px] text-text-secondary">
      <span className="font-bold text-text-primary">Keyboard shortcuts</span>
      <span>{selectedBlock ? 'Selected block:' : 'Select a block:'}</span>
      <span className="rounded-small border border-border-default bg-white px-2 py-1 font-semibold">↑ / ↓ 15 min</span>
      <span className="rounded-small border border-border-default bg-white px-2 py-1 font-semibold">← / → day</span>
      <span className="rounded-small border border-border-default bg-white px-2 py-1 font-semibold">+ / - duration</span>
    </div>
  </div>
);

/**
 * First-run guidance shown over the grid while the planner is completely
 * empty: point the user at the three ways to fill their week. Disappears as
 * soon as they have a single block (scheduled or in the inbox).
 */
const EmptyWeekPrompt: React.FC = () => {
  const totalBlocks = useLiveQuery(() => db.blocks.filter(b => !b.deletedAt).count(), [], undefined);
  if (totalBlocks !== 0) return null;

  const fire = (name: string) => window.dispatchEvent(new CustomEvent(name));

  return (
    <div className="pointer-events-none absolute inset-x-0 top-8 z-blocks flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-[340px] rounded-large border border-border-default bg-surface-primary/95 p-4 shadow-modal backdrop-blur">
        <div className="text-[14px] font-bold text-text-primary">Your week is empty. Let&apos;s fill it.</div>
        <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
          Bring in what you already have, then drag everything into place.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fire('planner:open-sync')}
            className="h-10 w-full rounded-small bg-accent-primary text-[13px] font-bold text-white hover:bg-accent-hover transition-colors"
          >
            Connect or import your calendar
          </button>
          <button
            type="button"
            onClick={() => fire('planner:open-import')}
            className="h-10 w-full rounded-small border border-border-default bg-background text-[13px] font-bold text-text-primary hover:bg-border-default/40 transition-colors"
          >
            Import your to-do list
          </button>
        </div>
        <p className="mt-2.5 text-center text-[11px] text-text-muted">
          Google Calendar syncs live. Apple Calendar imports via a .ics file.
        </p>
        <button
          type="button"
          onClick={() => fire('planner:start-tour')}
          className="mt-1 w-full text-center text-[11px] font-semibold text-accent-primary hover:underline"
        >
          Or take the 60-second walkthrough
        </button>
      </div>
    </div>
  );
};

const ZoomSelect: React.FC<{ value: ZoomMode; onChange: (value: ZoomMode) => void }> = ({ value, onChange }) => (
  <select
    value={value}
    onChange={(event) => onChange(event.target.value as ZoomMode)}
    className="zoom-select hidden h-[30px] rounded-small border border-border-default bg-background px-2 text-[12px] font-semibold text-text-secondary outline-none"
    title="Calendar density"
  >
    <option value="compact">Compact</option>
    <option value="comfortable">Comfortable</option>
    <option value="focus">Focus</option>
  </select>
);

interface SegmentedControlProps<T extends string> {
  value: T;
  options: T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}

const SegmentedControl = <T extends string>({ value, options, labels, onChange }: SegmentedControlProps<T>) => (
  <div className="inline-flex rounded-small border border-border-default bg-background p-0.5">
    {options.map(option => (
      <button
        key={option}
        onClick={() => onChange(option)}
        className={`px-2.5 py-1 text-[12px] font-semibold rounded-[8px] transition-colors whitespace-nowrap ${value === option ? 'bg-surface-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
      >
        {labels[option]}
      </button>
    ))}
  </div>
);

interface VisibleHoursControlProps {
  preset: VisibleHoursPreset;
  onPresetChange: (value: VisibleHoursPreset) => void;
  customStartHour: number;
  customEndHour: number;
  onCustomStartChange: (value: number) => void;
  onCustomEndChange: (value: number) => void;
}

const VisibleHoursControl: React.FC<VisibleHoursControlProps> = ({
  preset,
  onPresetChange,
  customStartHour,
  customEndHour,
  onCustomStartChange,
  onCustomEndChange,
}) => (
  <div className="inline-flex items-center gap-1 rounded-small border border-border-default bg-background p-0.5">
    <select
      value={preset}
      onChange={(event) => onPresetChange(event.target.value as VisibleHoursPreset)}
      className="h-[28px] rounded-[8px] bg-transparent px-2 text-[12px] font-semibold text-text-secondary outline-none hover:text-text-primary"
      title="Working hours — the day still scrolls to 00:00–23:59"
    >
      <option value="06-22">06:00-22:00</option>
      <option value="07-22">07:00-22:00</option>
      <option value="08-22">08:00-22:00</option>
      <option value="custom">Custom</option>
    </select>
    {preset === 'custom' && (
      <div className="flex items-center gap-1 pr-1 text-[12px] text-text-muted">
        <HourSelect value={customStartHour} min={0} max={22} onChange={onCustomStartChange} />
        <span>-</span>
        <HourSelect value={customEndHour} min={customStartHour + 1} max={24} onChange={onCustomEndChange} />
      </div>
    )}
  </div>
);

const HourSelect: React.FC<{ value: number; min: number; max: number; onChange: (value: number) => void }> = ({ value, min, max, onChange }) => {
  const options = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  return (
    <select
      value={Math.min(Math.max(value, min), max)}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-[26px] rounded-[7px] border border-border-default bg-surface-primary px-1 text-[12px] font-semibold text-text-secondary outline-none"
    >
      {options.map(hour => (
        <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>
      ))}
    </select>
  );
};

interface MonthCanvasProps {
  dates: Array<{ label: string; value: string; inMonth: boolean }>;
  blocks: PlannerBlock[];
  today: string;
  onEditBlock: (blockId: string) => void;
  onSelectBlock: (blockId: string) => void;
  onOpenDay?: (date: string) => void;
}

const MonthCanvas: React.FC<MonthCanvasProps> = ({ dates, blocks, today, onEditBlock, onSelectBlock, onOpenDay }) => {
  const blocksByDate = blocks.reduce<Record<string, PlannerBlock[]>>((acc, block) => {
    if (!block.date) return acc;
    acc[block.date] = [...(acc[block.date] || []), block];
    return acc;
  }, {});

  return (
    <div className="p-4">
      <div className="grid grid-cols-7 border border-border-default rounded-medium overflow-hidden bg-surface-primary">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <div key={day} className="planner-scaled-label h-9 flex items-center justify-center font-semibold text-text-secondary border-b border-border-default bg-background">
            {day}
          </div>
        ))}
        {dates.map(day => (
          <MonthDayCell
            key={day.value}
            day={day}
            dayBlocks={blocksByDate[day.value] || []}
            isToday={day.value === today}
            onEditBlock={onEditBlock}
            onSelectBlock={onSelectBlock}
            onOpenDay={onOpenDay}
          />
        ))}
      </div>
    </div>
  );
};

interface MonthDayCellProps {
  day: { label: string; value: string; inMonth: boolean };
  dayBlocks: PlannerBlock[];
  isToday: boolean;
  onEditBlock: (blockId: string) => void;
  onSelectBlock: (blockId: string) => void;
  onOpenDay?: (date: string) => void;
}

const MonthDayCell: React.FC<MonthDayCellProps> = ({ day, dayBlocks, isToday, onEditBlock, onSelectBlock, onOpenDay }) => {
  // Droppable so blocks can be dragged onto another day (keeping their time).
  const { isOver, setNodeRef } = useDroppable({ id: `month-${day.value}`, data: { date: day.value, monthDrop: true } });

  return (
    <div
      ref={setNodeRef}
      data-month-date={day.value}
      onDoubleClick={() => onOpenDay?.(day.value)}
      title="Double-click to open this day"
      className={`min-h-[108px] border-t border-r border-border-default/70 p-2 ${isToday ? 'bg-accent-primary/[0.055]' : 'bg-surface-primary'} ${day.inMonth ? '' : 'opacity-45'} ${isOver ? 'ring-1 ring-inset ring-accent-primary/40 bg-accent-primary/[0.06]' : ''}`}
    >
      <div className="planner-scaled-label font-semibold text-text-secondary">{day.label}</div>
      <div className="mt-2 flex flex-col gap-1">
        {dayBlocks.slice(0, 3).map(block => (
          <MonthBlock key={block.id} block={block} onEditBlock={onEditBlock} onSelectBlock={onSelectBlock} />
        ))}
        {dayBlocks.length > 3 && <div className="planner-scaled-small text-text-muted px-1">+{dayBlocks.length - 3} more</div>}
      </div>
    </div>
  );
};

const MonthBlock: React.FC<{ block: PlannerBlock; onEditBlock: (id: string) => void; onSelectBlock: (id: string) => void }> = ({ block, onEditBlock, onSelectBlock }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: block.id, data: block });
  const wasDragging = useRef(false);
  useEffect(() => {
    if (isDragging) { wasDragging.current = true; }
    else { const t = setTimeout(() => { wasDragging.current = false; }, 200); return () => clearTimeout(t); }
  }, [isDragging]);

  const tone = block.reviewColour === 'RED'
    ? 'border-[#FDA4AF] bg-[#FFF1F3]'
    : block.reviewColour === 'ORANGE' || block.isBaseEvent
      ? 'border-[#F4B04F] bg-[#FFF7E6]'
      : 'border-[#C9D3E1] bg-[#F3F6FB]';

  return (
    <div
      ref={setNodeRef}
      data-month-block={block.id}
      {...listeners}
      {...attributes}
      style={{ transform: CSS.Translate.toString(transform), zIndex: isDragging ? 50 : undefined }}
      onClick={(e) => {
        // A click (not the end of a drag) opens the block so it can be edited.
        if (wasDragging.current) { e.preventDefault(); e.stopPropagation(); return; }
        e.stopPropagation();
        onSelectBlock(block.id);
        onEditBlock(block.id);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`planner-scaled-label truncate text-text-primary rounded-small border px-2 py-1 cursor-pointer hover:shadow-sm ${tone} ${isDragging ? 'opacity-80 shadow-hover' : ''}`}
      title={`${block.title}${block.startTime ? ` · ${block.startTime}` : ''}`}
    >
      <span>{block.startTime ? `${block.startTime} ` : ''}{block.title}</span>
      {block.travelEnabled && (block.travelBeforeMinutes > 0 || block.travelAfterMinutes > 0) && (
        <span className="ml-1 text-[#2877BD]">Travel</span>
      )}
    </div>
  );
};

const getMonthCanvasDays = (date: Date) => {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const lastOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const gridStart = getStartOfWeek(firstOfMonth);
  const totalDays = Math.ceil((Math.round((lastOfMonth.getTime() - gridStart.getTime()) / 86400000) + 1) / 7) * 7;

  return Array.from({ length: totalDays }).map((_, index) => {
    const current = addDays(gridStart, index);
    return {
      label: String(current.getDate()),
      value: formatDate(current),
      inMonth: current.getMonth() === date.getMonth(),
    };
  });
};

const usePersistedSetting = <T extends string>(key: string, fallback: T): [T, (value: T) => void] => {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || fallback;
    } catch {
      return fallback;
    }
  });

  const updateValue = (nextValue: T) => {
    setValue(nextValue);
    try {
      localStorage.setItem(key, nextValue);
    } catch {
      // Ignore storage failures and keep the in-memory setting.
    }
  };

  return [value, updateValue];
};

const usePersistedNumberSetting = (key: string, fallback: number): [number, (value: number) => void] => {
  const [value, setValue] = useState<number>(() => {
    try {
      const storedValue = localStorage.getItem(key);
      return storedValue === null ? fallback : Number(storedValue);
    } catch {
      return fallback;
    }
  });

  const updateValue = (nextValue: number) => {
    setValue(nextValue);
    try {
      localStorage.setItem(key, String(nextValue));
    } catch {
      // Ignore storage failures and keep the in-memory setting.
    }
  };

  return [value, updateValue];
};

const getVisibleHourRange = (preset: VisibleHoursPreset, customStartHour: number, customEndHour: number) => {
  if (preset === '06-22') return { start: 6, end: 22 };
  if (preset === '08-22') return { start: 8, end: 22 };
  if (preset === 'custom') {
    const start = Math.min(22, Math.max(0, customStartHour));
    const end = Math.min(24, Math.max(start + 1, customEndHour));
    return { start, end };
  }
  return { start: 7, end: 22 };
};

const getMobileVisibleHourRange = (boardHeight: number) => {
  if (boardHeight >= 760) return { start: 8, end: 23 };
  if (boardHeight >= 640) return { start: 8, end: 22 };
  return { start: 8, end: 20 };
};

/** Current minute-of-day, ticking every 30s so the "now" marker stays live. */
const useNowMinute = (): number => {
  const [minute, setMinute] = useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setMinute(now.getHours() * 60 + now.getMinutes());
    };
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, []);

  return minute;
};

interface CurrentTimeMarkerProps {
  minute: number;
  minuteHeight: number;
  todayIndex: number;
  columnCount: number;
  showDot: boolean;
}

/**
 * A calm, week-wide "now" line. A soft accent hairline runs across the whole
 * week so you can read the time-of-day at a glance, a time chip sits in the
 * gutter, and a small dot marks today's column — together they place "now"
 * within the week without the alarm-red look of a typical calendar cursor.
 * Rendered behind events (low z-index) so it never slices through event text.
 */
const CurrentTimeMarker: React.FC<CurrentTimeMarkerProps> = ({ minute, minuteHeight, todayIndex, columnCount, showDot }) => {
  const top = minute * minuteHeight;
  const label = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  const dotLeft = columnCount > 0 ? ((todayIndex + 0.5) / columnCount) * 100 : 50;

  return (
    <div className="now-marker pointer-events-none absolute inset-x-0 z-[6]" style={{ top: `${top}px` }} aria-hidden="true">
      <div className="flex">
        <div className="week-time-gutter w-12 flex-shrink-0 flex justify-end pr-1">
          <span className="now-chip -translate-y-1/2">{label}</span>
        </div>
        <div className="relative flex-1">
          <div className="now-line -translate-y-1/2" />
          {showDot && todayIndex >= 0 && (
            <div className="now-dot -translate-y-1/2" style={{ left: `${dotLeft}%` }} />
          )}
        </div>
      </div>
    </div>
  );
};

interface AllDayCellProps {
  blocks: PlannerBlock[];
  isToday: boolean;
  onEditBlock: (blockId: string) => void;
  onSelectBlock: (blockId: string) => void;
}

/** One day's cell in the all-day lane: a few chips, then a "+N more" overflow. */
const AllDayCell: React.FC<AllDayCellProps> = ({ blocks, isToday, onEditBlock, onSelectBlock }) => (
  <div className={`all-day-cell flex-1 min-w-0 border-r border-border-default/35 last:border-r-0 px-1 py-1 flex flex-col gap-0.5 ${isToday ? 'bg-accent-primary/[0.04]' : ''}`}>
    {blocks.slice(0, 3).map(block => (
      <AllDayChip key={block.id} block={block} onEditBlock={onEditBlock} onSelectBlock={onSelectBlock} />
    ))}
    {blocks.length > 3 && (
      <div className="planner-scaled-small text-text-muted px-1">+{blocks.length - 3} more</div>
    )}
  </div>
);

const AllDayChip: React.FC<{ block: PlannerBlock; onEditBlock: (id: string) => void; onSelectBlock: (id: string) => void }> = ({ block, onEditBlock, onSelectBlock }) => (
  <button
    type="button"
    data-block-id={block.id}
    onClick={(e) => { e.stopPropagation(); onSelectBlock(block.id); onEditBlock(block.id); }}
    className="planner-scaled-small truncate rounded-[6px] border border-[#C9D3E1] bg-[#F3F6FB] px-1.5 py-0.5 text-left font-semibold text-text-primary hover:shadow-sm"
    title={block.title}
  >
    {block.title}
  </button>
);

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const handleChange = () => setIsMobile(query.matches);
    handleChange();
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
};
