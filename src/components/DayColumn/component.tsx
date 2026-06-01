// Day Column Component
import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useWeekBlocks } from '../../hooks/usePlannerData';
import { ScheduledBlock } from '../ScheduledBlock/component';
import { formatDate } from '../../utils/dateUtils';
import type { PlannerBlock } from '../../types/models';
import { timeToMinutes } from '../../utils/planningEngine';
import { matchesPlannerFilters, type PlannerFilterId } from '../../utils/plannerFilters';
import { formatDurationLabel } from '../../utils/durationLabels';

const QUARTERS = [0, 15, 30, 45]; // 15-minute snap intervals

interface Props {
  date: string;
  onEditBlock: (blockId: string) => void;
  onSelectBlock: (blockId: string) => void;
  selectedBlockId: string | null;
  hourHeight: number;
  visibleHours: number[];
  visibleStartHour: number;
  visibleEndHour: number;
  isExpanded?: boolean;
  activeFilters: PlannerFilterId[];
}

export const DayColumn: React.FC<Props> = ({ date, onEditBlock, onSelectBlock, selectedBlockId, hourHeight, visibleHours, visibleStartHour, visibleEndHour, isExpanded = false, activeFilters }) => {
  const blocks = useWeekBlocks(date, date) || [];
  const isToday = date === formatDate(new Date());
  const now = new Date();
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const minuteHeight = hourHeight / 60;
  const visibleStartMinute = visibleStartHour * 60;
  const visibleEndMinute = visibleEndHour * 60;
  const visibleBlocks = blocks.filter(block => {
    if (!matchesPlannerFilters(block, activeFilters)) return false;
    if (!block.startTime) return false;
    const [hours, minutes] = block.startTime.split(':').map(Number);
    const start = hours * 60 + minutes;
    const end = start + block.durationMinutes;
    return end > visibleStartMinute && start < visibleEndMinute;
  });

  return (
    <div className={`day-column ${isExpanded ? 'expanded-day' : ''} flex-1 min-w-[120px] border-r border-border-default/25 last:border-r-0 relative flex flex-col z-grid ${isToday ? 'bg-accent-primary/[0.028]' : 'bg-surface-primary'}`}>
      
      {/* Render 15-min snap drop slots */}
      {visibleHours.map(hour => (
        <div key={hour} className="relative border-b border-border-default/45 box-border" style={{ height: `${hourHeight}px` }}>
          {QUARTERS.map(minute => {
            const startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            return <DropSlot key={startTime} date={date} startTime={startTime} topOffset={minute * minuteHeight} height={15 * minuteHeight} />;
          })}
        </div>
      ))}

      {isToday && currentMinute >= visibleStartMinute && currentMinute <= visibleEndMinute && (
        <div
          className="absolute left-0 right-0 h-px bg-semantic-danger/70 z-30 pointer-events-none"
          style={{ top: `${(currentMinute - visibleStartMinute) * minuteHeight}px` }}
        >
          <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-semantic-danger" />
        </div>
      )}

      {visibleBlocks.map(block => (
        <TravelSegments
          key={`${block.id}-travel`}
          block={block}
          minuteHeight={minuteHeight}
          visibleStartMinute={visibleStartMinute}
          visibleEndMinute={visibleEndMinute}
        />
      ))}

      {/* Render absolutely positioned blocks mapped on top of the drop grid */}
      {visibleBlocks.map(block => (
        <ScheduledBlock 
          key={block.id} 
          block={block} 
          dailyBlocks={blocks} 
          onEditBlock={onEditBlock} 
          onSelectBlock={onSelectBlock}
          isSelected={selectedBlockId === block.id}
          minuteHeight={minuteHeight}
          visibleStartMinute={visibleStartMinute}
        />
      ))}
    </div>
  );
};

interface DropSlotProps {
  date: string;
  startTime: string;
  topOffset: number;
  height: number;
}

const DropSlot: React.FC<DropSlotProps> = ({ date, startTime, topOffset, height }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot-${date}-${startTime}`,
    data: { date, startTime }
  });

  return (
    <div
      ref={setNodeRef}
      className={`absolute w-full transition-colors hover:bg-accent-primary/[0.045] ${isOver ? 'bg-accent-primary/10 ring-1 ring-inset ring-accent-primary/25' : ''}`}
      style={{ top: `${topOffset}px`, height: `${height}px` }}
    />
  );
};

interface TravelSegmentsProps {
  block: PlannerBlock;
  minuteHeight: number;
  visibleStartMinute: number;
  visibleEndMinute: number;
}

const TravelSegments: React.FC<TravelSegmentsProps> = ({ block, minuteHeight, visibleStartMinute, visibleEndMinute }) => {
  if (!block.travelEnabled || !block.startTime) return null;
  const start = timeToMinutes(block.startTime);
  const end = start + block.durationMinutes;

  return (
    <>
      {block.travelBeforeMinutes > 0 && (
        <TravelSegment
          startMinute={start - block.travelBeforeMinutes}
          durationMinutes={block.travelBeforeMinutes}
          label={`Travel ${formatDurationLabel(block.travelBeforeMinutes)}`}
          minuteHeight={minuteHeight}
          visibleStartMinute={visibleStartMinute}
          visibleEndMinute={visibleEndMinute}
        />
      )}
      {block.travelAfterMinutes > 0 && (
        <TravelSegment
          startMinute={end}
          durationMinutes={block.travelAfterMinutes}
          label={`Travel ${formatDurationLabel(block.travelAfterMinutes)}`}
          minuteHeight={minuteHeight}
          visibleStartMinute={visibleStartMinute}
          visibleEndMinute={visibleEndMinute}
        />
      )}
    </>
  );
};

interface TravelSegmentProps {
  startMinute: number;
  durationMinutes: number;
  label: string;
  minuteHeight: number;
  visibleStartMinute: number;
  visibleEndMinute: number;
}

const TravelSegment: React.FC<TravelSegmentProps> = ({ startMinute, durationMinutes, label, minuteHeight, visibleStartMinute, visibleEndMinute }) => {
  const segmentStart = Math.max(startMinute, visibleStartMinute);
  const segmentEnd = Math.min(startMinute + durationMinutes, visibleEndMinute);
  if (segmentEnd <= visibleStartMinute || segmentStart >= visibleEndMinute || segmentEnd <= segmentStart) return null;

  return (
    <div
      className="pointer-events-none absolute left-2 right-2 z-[6] rounded-small border border-[#8EC5FF]/45 bg-[#D8ECFF]/55 px-2 py-1 text-[10px] font-semibold leading-tight text-[#2877BD] shadow-sm"
      style={{
        top: `${(segmentStart - visibleStartMinute) * minuteHeight}px`,
        height: `${Math.max((segmentEnd - segmentStart) * minuteHeight, 22)}px`,
      }}
      title={label}
    >
      <span className="opacity-90">{label}</span>
    </div>
  );
};
