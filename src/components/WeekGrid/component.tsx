// Week Canvas Component
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  onEditBlock: (blockId: string) => void;
  onSelectBlock: (blockId: string) => void;
  selectedBlockId: string | null;
  expandedDate?: string | null;
  isDraggingBlock?: boolean;
  activeFilters: PlannerFilterId[];
}

export const WeekGrid: React.FC<Props> = ({ currentDate, onEditBlock, onSelectBlock, selectedBlockId, expandedDate = null, isDraggingBlock = false, activeFilters }) => {
  const [viewMode, setViewMode] = usePersistedSetting<ViewMode>('planner.viewMode', 'week');
  const [zoomMode, setZoomMode] = usePersistedSetting<ZoomMode>('planner.zoomMode', 'comfortable');
  const [visibleHoursPreset, setVisibleHoursPreset] = usePersistedSetting<VisibleHoursPreset>('planner.visibleHoursPreset', '07-22');
  const [customStartHour, setCustomStartHour] = usePersistedNumberSetting('planner.visibleHoursCustomStart', 7);
  const [customEndHour, setCustomEndHour] = usePersistedNumberSetting('planner.visibleHoursCustomEnd', 22);
  const today = formatDate(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [boardHeight, setBoardHeight] = useState(640);
  const isMobile = useIsMobile();

  const selectedVisibleRange = useMemo(
    () => getVisibleHourRange(visibleHoursPreset, customStartHour, customEndHour),
    [visibleHoursPreset, customStartHour, customEndHour]
  );
  const visibleRange = useMemo(
    () => isMobile ? getMobileVisibleHourRange(boardHeight) : selectedVisibleRange,
    [boardHeight, isMobile, selectedVisibleRange]
  );
  const visibleHours = useMemo(
    () => Array.from({ length: visibleRange.end - visibleRange.start }, (_, index) => visibleRange.start + index),
    [visibleRange.end, visibleRange.start]
  );
  const fitHourHeight = Math.max(isMobile ? 22 : 32, (boardHeight - (isMobile ? 56 : 112)) / Math.max(1, visibleHours.length));
  const hourHeight = fitHourHeight * (isMobile ? 1 : ZOOM_SCALE[zoomMode]);

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
    <div ref={scrollRef} data-tour="week-grid" className={`week-grid-shell flex flex-col h-full overflow-auto bg-white ${expandedDate ? 'has-expanded-day' : ''} ${isDraggingBlock ? 'is-dragging-block' : ''}`}>
      <div className="sticky top-0 z-header bg-surface-primary/95 backdrop-blur border-b border-border-default/70 px-4 py-2">
        <div className="week-grid-toolbar flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-[230px] flex items-baseline gap-2">
            <div className="text-[15px] font-bold text-text-primary">Fit your life into the week</div>
            <div className="text-[12px] text-text-secondary">
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
        <MonthCanvas dates={monthDates} blocks={visibleBlocks} today={today} />
      ) : (
        <>
          <div className="week-days-header flex border-b border-border-default/70 h-10 sticky top-[53px] bg-surface-primary z-header shadow-sm">
            <div className="week-time-gutter w-12 flex-shrink-0 border-r border-border-default/60" />
            {visibleDates.map(day => {
              const isExpanded = expandedDate === day.value;
              return (
              <div key={day.value} className={`week-day-heading ${isExpanded ? 'expanded-day' : ''} flex-1 min-w-[120px] flex items-center justify-center border-r border-border-default/35 last:border-r-0 ${day.value === today ? 'bg-accent-primary/[0.06]' : ''}`}>
                <span className={`text-[13px] font-bold ${day.value === today ? 'text-accent-primary' : 'text-text-primary'}`}>{day.label}</span>
              </div>
              );
            })}
          </div>

          <div className="flex flex-1 relative min-h-max">
            <div className="week-time-gutter w-12 flex-shrink-0 border-r border-border-default/50 flex flex-col bg-surface-primary">
              {visibleHours.map(hour => (
                <div key={hour} className="flex justify-center text-text-muted text-[10px] font-semibold pt-2 border-b border-border-default/55 box-border" style={{ height: `${hourHeight}px` }}>
                  {`${String(hour).padStart(2, '0')}:00`}
                </div>
              ))}
              <div className="relative h-0 flex justify-center text-text-muted text-[11px] font-medium">
                <span className="-translate-y-1/2 text-[10px] font-semibold">{`${String(visibleRange.end).padStart(2, '0')}:00`}</span>
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
                visibleHours={visibleHours}
                visibleStartHour={visibleRange.start}
                visibleEndHour={visibleRange.end}
                isExpanded={expandedDate === day.value}
                activeFilters={activeFilters}
              />
            ))}
          </div>
          {!isMobile && <KeyboardHint selectedBlock={visibleBlocks.find(block => block.id === selectedBlockId)} />}
          <div className="h-4 flex-shrink-0 bg-white" />
        </>
      )}
    </div>
  );
};

const KeyboardHint: React.FC<{ selectedBlock?: PlannerBlock }> = ({ selectedBlock }) => (
  <div className="keyboard-hint sticky bottom-0 z-header border-t border-border-default/70 bg-surface-primary/95 px-4 py-2 shadow-sm backdrop-blur">
    <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-center gap-2 text-[11px] text-text-secondary">
      <span className="font-bold text-text-primary">Keyboard shortcuts</span>
      <span>{selectedBlock ? 'Selected block:' : 'Select a block:'}</span>
      <span className="rounded-small border border-border-default bg-white px-2 py-1 font-semibold">↑ / ↓ 15 min</span>
      <span className="rounded-small border border-border-default bg-white px-2 py-1 font-semibold">← / → day</span>
      <span className="rounded-small border border-border-default bg-white px-2 py-1 font-semibold">+ / - duration</span>
    </div>
  </div>
);

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
      title="Visible hours"
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
}

const MonthCanvas: React.FC<MonthCanvasProps> = ({ dates, blocks, today }) => {
  const blocksByDate = blocks.reduce<Record<string, PlannerBlock[]>>((acc, block) => {
    if (!block.date) return acc;
    acc[block.date] = [...(acc[block.date] || []), block];
    return acc;
  }, {});

  return (
    <div className="p-4">
      <div className="grid grid-cols-7 border border-border-default rounded-medium overflow-hidden bg-surface-primary">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <div key={day} className="h-9 flex items-center justify-center text-[12px] font-semibold text-text-secondary border-b border-border-default bg-background">
            {day}
          </div>
        ))}
        {dates.map(day => {
          const dayBlocks = blocksByDate[day.value] || [];
          return (
            <div key={day.value} className={`min-h-[108px] border-t border-r border-border-default/70 p-2 ${day.value === today ? 'bg-accent-primary/[0.055]' : 'bg-surface-primary'} ${day.inMonth ? '' : 'opacity-45'}`}>
              <div className="text-[12px] font-semibold text-text-secondary">{day.label}</div>
              <div className="mt-2 flex flex-col gap-1">
                {dayBlocks.slice(0, 3).map(block => (
                  <MonthBlock key={block.id} block={block} />
                ))}
                {dayBlocks.length > 3 && <div className="text-[11px] text-text-muted px-1">More placed here</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MonthBlock: React.FC<{ block: PlannerBlock }> = ({ block }) => {
  const tone = block.reviewColour === 'RED'
    ? 'border-[#FDA4AF] bg-[#FFF1F3]'
    : block.reviewColour === 'ORANGE' || block.isBaseEvent
      ? 'border-[#F4B04F] bg-[#FFF7E6]'
      : 'border-[#C9D3E1] bg-[#F3F6FB]';

  return (
    <div className={`truncate text-[12px] text-text-primary rounded-small border px-2 py-1 ${tone}`}>
      <span>{block.title}</span>
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
