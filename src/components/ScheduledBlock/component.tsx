import React, { useEffect, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { PlannerBlock } from '../../types/models';
import { calculateEndTime, getBlockConflicts, getEffectiveMinuteRange, minutesToTime, timeToMinutes } from '../../utils/planningEngine';
import { useCategories, useFeatures } from '../../hooks/usePlannerData';
import { deleteBlock, duplicateBlock, moveBlockToSchedule, moveBlockToWeek } from '../../services/plannerActions';
import { BUILT_IN_CHILDCARE_FEATURE_ID } from '../../utils/plannerSetup';

interface Props {
  block: PlannerBlock;
  dailyBlocks: PlannerBlock[];
  onEditBlock: (blockId: string) => void;
  onSelectBlock: (blockId: string) => void;
  isSelected: boolean;
  minuteHeight: number;
  visibleStartMinute: number;
}

export const ScheduledBlock: React.FC<Props> = ({ block, dailyBlocks, onEditBlock, onSelectBlock, isSelected, minuteHeight, visibleStartMinute }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.id,
    data: block
  });

  const allFeatures = useFeatures() || [];
  const activeFeatures = allFeatures.filter(f => block.features?.[f.id]?.enabled);
  const categories = useCategories() || [];
  const category = block.categoryId ? categories.find(cat => cat.id === block.categoryId) : undefined;
  const childcare = block.features?.[BUILT_IN_CHILDCARE_FEATURE_ID];

  const wasDragging = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (isDragging) {
      wasDragging.current = true;
    } else {
      const timer = setTimeout(() => { wasDragging.current = false; }, 250);
      return () => clearTimeout(timer);
    }
  }, [isDragging]);

  const handleClick = (e: React.MouseEvent) => {
    if (wasDragging.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onSelectBlock(block.id);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    if (!pointerStart.current) return;

    const distance = Math.hypot(e.clientX - pointerStart.current.x, e.clientY - pointerStart.current.y);
    pointerStart.current = null;

    if (distance < 5) {
      e.preventDefault();
      e.stopPropagation();
      onSelectBlock(block.id);
    }
  };

  if (!block.startTime) return null;

  const [hours, minutes] = block.startTime.split(':').map(Number);
  const startMinutes = (hours * 60) + minutes;
  const topOffset = (startMinutes - visibleStartMinute) * minuteHeight;
  const isShortBlock = block.durationMinutes <= 30;
  const isLongBlock = block.durationMinutes >= 60;
  const titleLineClamp = block.durationMinutes < 45 ? 1 : block.durationMinutes < 90 ? 2 : 3;
  let endTime = block.endTime;
  if (!endTime) {
    try {
      endTime = calculateEndTime(block.startTime, block.durationMinutes);
    } catch {
      endTime = minutesToTime(Math.min(24 * 60 - 1, startMinutes + block.durationMinutes));
    }
  }
  const timeRange = `${block.startTime} - ${endTime}`;
  const visibleTimeLabel = isShortBlock ? block.startTime : timeRange;

  const conflicts = getBlockConflicts(block, dailyBlocks);
  const hasConflicts = conflicts.length > 0;
  
  const effectiveRange = getEffectiveMinuteRange(block);
  const isOutOfBounds = effectiveRange?.startOutOfBounds || effectiveRange?.endOutOfBounds;

  let secondaryTimeStr = '';
  if (block.additionalTimezone && block.date && block.startTime) {
    try {
      const [year, month, day] = block.date.split('-');
      const [h, m] = block.startTime.split(':');
      const d = new Date(Number(year), Number(month) - 1, Number(day), Number(h), Number(m));
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: block.additionalTimezone,
        hour: '2-digit',
        minute: '2-digit'
      });
      secondaryTimeStr = formatter.format(d);
    } catch (e) {
      // Fallback silently if timezone parsing fails
    }
  }

  const blockTone = getBlockTone(block, hasConflicts, category?.name);
  const style = {
    top: `${topOffset}px`,
    height: `${Math.max(block.durationMinutes * minuteHeight, isShortBlock ? 40 : 46)}px`,
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 50 : isSelected ? 22 : 10,
    backgroundColor: blockTone.background,
    borderColor: isSelected ? '#2563EB' : blockTone.border,
    borderLeftColor: blockTone.accent,
    boxShadow: isSelected ? '0 0 0 1px rgba(37,99,235,0.18), 0 8px 18px rgba(37,99,235,0.10)' : `0 2px 8px ${blockTone.accent}1F`,
  };
  const tooltip = [
    block.title,
    block.date ? `Date: ${block.date}` : undefined,
    `Time: ${timeRange}`,
    `Duration: ${block.durationMinutes} min`,
    block.reviewColour ? `Status: ${getReviewStatus(block.reviewColour)}` : undefined,
  ].filter(Boolean).join('\n');

  const handleMoveToSchedule = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await moveBlockToSchedule(block.id);
  };

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await duplicateBlock(block.id);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteBlock(block.id);
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (!block.date || !block.startTime) return;

    e.preventDefault();
    const delta = e.shiftKey ? 60 : 15;
    const direction = e.key === 'ArrowUp' ? -1 : 1;
    const nextStart = Math.max(0, Math.min(24 * 60 - 15, timeToMinutes(block.startTime) + direction * delta));
    const nextTime = minutesToTime(nextStart);

    try {
      calculateEndTime(nextTime, block.durationMinutes);
      await moveBlockToWeek(block.id, block.date, nextTime);
    } catch {
      // Keep the block in place if it would extend beyond the day.
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onPointerDown={(e) => {
        handlePointerDown(e);
        listeners?.onPointerDown?.(e);
      }}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className={`absolute left-0.5 right-0.5 rounded-small p-1.5 shadow-sm z-blocks cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-text-primary/10 transition-colors group flex flex-col border border-l-[3px] text-text-primary overflow-visible ${isDragging ? 'opacity-85 scale-[1.02] shadow-hover' : ''} ${isSelected ? 'scheduled-block-selected' : ''}`}
      title={tooltip}
    >
      {isSelected && <SelectionHandles />}

      <div className="flex justify-between items-start gap-1 min-w-0">
        <div className="min-w-0 flex-1 pr-0">
          <div className="text-[11px] font-semibold text-text-secondary leading-[1.15] truncate" style={{ wordBreak: 'normal', overflowWrap: 'normal', hyphens: 'none' }}>{visibleTimeLabel}{secondaryTimeStr && !isShortBlock && ` • ${secondaryTimeStr}`}</div>
          <div
            className="mt-0.5 text-[13px] font-semibold leading-[1.15]"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: titleLineClamp,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'normal',
              overflowWrap: 'normal',
              hyphens: 'none',
              textOverflow: 'ellipsis',
            }}
          >
            {block.title}
          </div>
        </div>
        <div className="hidden group-hover:flex absolute right-1 top-1 items-center gap-1 bg-surface-primary/95 px-1 rounded z-20 border border-border-default shadow-sm">
          <button onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onEditBlock(block.id); }} className="text-text-secondary hover:text-text-primary p-0.5" title="Edit">✎</button>
          <span className="text-text-secondary text-[11px] leading-[22px]" title="Move">↕</span>
          <button onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={handleMoveToSchedule} className="text-text-secondary hover:text-text-primary p-0.5" title="Move to Life Inbox">↰</button>
          <button onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={handleDuplicate} className="text-text-secondary hover:text-text-primary p-0.5" title="Duplicate">⧉</button>
          <button onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={handleDelete} className="text-semantic-danger hover:text-semantic-danger p-0.5" title="Delete">×</button>
        </div>
      </div>
      
      <div className="flex flex-wrap items-center gap-1 mt-0.5 overflow-hidden pointer-events-none">
        {childcare?.enabled && !childcare.isComplete && <div className="text-[10px] font-semibold bg-white/70 border border-border-default px-1 rounded flex items-center whitespace-nowrap" title="Childcare needed">Childcare?</div>}
        {childcare?.enabled && childcare.isComplete && <div className="text-[10px] font-semibold bg-white/60 border border-border-default px-1 rounded flex items-center whitespace-nowrap opacity-80" title="Childcare sorted">✓ childcare</div>}
        {hasConflicts && <div className="text-[10px] font-bold text-semantic-danger bg-white/75 border border-semantic-danger/30 px-1 rounded flex items-center whitespace-nowrap" title="Overlaps with another block">⚠ overlap</div>}
        {isOutOfBounds && <div className="text-[10px] font-bold text-semantic-danger bg-white/75 border border-semantic-danger/30 px-1 rounded flex items-center whitespace-nowrap" title="Travel extends outside day bounds">⚠ bounds</div>}
        {isLongBlock && <div className="text-[10px] text-text-secondary bg-white/55 border border-border-default px-1 rounded whitespace-nowrap">{block.durationMinutes}m</div>}
      </div>

      {activeFeatures.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5 pointer-events-none">
          {activeFeatures.map(f => (
            <span key={f.id} className="text-[10px] bg-white/70 border border-border-default px-1.5 py-0.5 rounded-sm text-text-secondary font-medium flex items-center gap-0.5 shadow-sm">
              {f.icon && <span>{f.icon}</span>}{f.name} {block.features?.[f.id]?.isComplete ? '✓' : '?'}
            </span>
          ))}
        </div>
      )}

    </div>
  );
};

const SelectionHandles: React.FC = () => (
  <>
    <span className="pointer-events-none absolute -left-1 -top-1 h-2 w-2 rounded-full border border-[#2563EB] bg-white shadow-sm" />
    <span className="pointer-events-none absolute -right-1 -top-1 h-2 w-2 rounded-full border border-[#2563EB] bg-white shadow-sm" />
    <span className="pointer-events-none absolute -bottom-1 -left-1 h-2 w-2 rounded-full border border-[#2563EB] bg-white shadow-sm" />
    <span className="pointer-events-none absolute -bottom-1 -right-1 h-2 w-2 rounded-full border border-[#2563EB] bg-white shadow-sm" />
  </>
);

const getBlockTone = (block: PlannerBlock, hasConflicts: boolean, categoryName?: string): { background: string; border: string; accent: string } => {
  if (hasConflicts || block.reviewColour === 'RED') {
    return { background: '#FFF1F3', border: '#FDA4AF', accent: '#E85D75' };
  }
  if (block.reviewColour === 'ORANGE' || block.isBaseEvent) {
    return { background: '#FFF7E6', border: '#F4B04F', accent: '#F59E0B' };
  }
  if (categoryName?.trim().toLowerCase() === 'personal') {
    return { background: '#F1EEFF', border: '#C4B5FD', accent: '#7C5CFC' };
  }
  return { background: '#F3F6FB', border: '#C9D3E1', accent: '#8A93A3' };
};

const getReviewStatus = (reviewColour: string): string => {
  if (reviewColour === 'ORANGE') return 'Needs review';
  if (reviewColour === 'RED') return 'Conflict or unclear';
  return 'Confirmed';
};
