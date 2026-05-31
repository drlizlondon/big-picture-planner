// Day Column Component
import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useWeekBlocks } from '../../hooks/usePlannerData';
import { ScheduledBlock } from '../ScheduledBlock/component';
import { formatDate } from '../../utils/dateUtils';

const QUARTERS = [0, 15, 30, 45]; // 15-minute snap intervals

interface Props {
  date: string;
  onEditBlock: (blockId: string) => void;
  hourHeight: number;
  visibleHours: number[];
  visibleStartHour: number;
  visibleEndHour: number;
  isExpanded?: boolean;
}

export const DayColumn: React.FC<Props> = ({ date, onEditBlock, hourHeight, visibleHours, visibleStartHour, visibleEndHour, isExpanded = false }) => {
  const blocks = useWeekBlocks(date, date) || [];
  const isToday = date === formatDate(new Date());
  const isSunday = new Date(`${date}T00:00:00`).getDay() === 0;
  const now = new Date();
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const minuteHeight = hourHeight / 60;
  const visibleStartMinute = visibleStartHour * 60;
  const visibleEndMinute = visibleEndHour * 60;
  const visibleBlocks = blocks.filter(block => {
    if (!block.startTime) return false;
    const [hours, minutes] = block.startTime.split(':').map(Number);
    const start = hours * 60 + minutes;
    const end = start + block.durationMinutes;
    return end > visibleStartMinute && start < visibleEndMinute;
  });

  return (
    <div className={`day-column ${isExpanded ? 'expanded-day' : ''} flex-1 min-w-[120px] border-r border-border-default/30 last:border-r-0 relative flex flex-col z-grid ${isToday ? 'bg-accent-primary/[0.035]' : isSunday ? 'bg-accent-primary/[0.025]' : 'bg-surface-primary'}`}>
      
      {/* Render 15-min snap drop slots */}
      {visibleHours.map(hour => (
        <div key={hour} className="relative border-b border-border-default box-border" style={{ height: `${hourHeight}px` }}>
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

      {/* Render absolutely positioned blocks mapped on top of the drop grid */}
      {visibleBlocks.map(block => (
        <ScheduledBlock 
          key={block.id} 
          block={block} 
          dailyBlocks={blocks} 
          onEditBlock={onEditBlock} 
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
      className={`absolute w-full transition-colors hover:bg-accent-primary/[0.06] ${isOver ? 'bg-accent-primary/10' : ''}`}
      style={{ top: `${topOffset}px`, height: `${height}px` }}
    />
  );
};
