import React, { useEffect, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { PlannerBlock } from '../../types/models';
import { calculateEndTime, getBlockConflicts, getEffectiveMinuteRange, minutesToTime, timeToMinutes } from '../../utils/planningEngine';
import { useCategories, useFeatures } from '../../hooks/usePlannerData';
import { deleteBlock, duplicateBlock, moveBlockToSchedule, moveBlockToWeek } from '../../services/plannerActions';
import { BUILT_IN_CHILDCARE_FEATURE_ID } from '../../utils/plannerSetup';
import { formatDurationLabel } from '../../utils/durationLabels';

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
  const [isActionsOpen, setIsActionsOpen] = useState(false);

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
  const usesCompactActions = block.durationMinutes <= 45;
  const isLongBlock = block.durationMinutes >= 60;
  const actionPlacement: ActionPlacement = topOffset < 34 ? 'below' : 'above';
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
    } catch {
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
    boxShadow: isSelected ? '0 0 0 1px rgba(37,99,235,0.18), 0 8px 18px rgba(37,99,235,0.10)' : `0 2px 7px ${blockTone.accent}18`,
  };
  const tooltip = [
    block.title,
    block.date ? `Date: ${block.date}` : undefined,
    `Time: ${timeRange}`,
    `Duration: ${formatDurationLabel(block.durationMinutes)}`,
    block.reviewColour ? `Status: ${getReviewStatus(block.reviewColour)}` : undefined,
  ].filter(Boolean).join('\n');

  const stopActionPointer = (e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleEditAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionsOpen(false);
    onEditBlock(block.id);
  };

  const handleMoveToSchedule = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionsOpen(false);
    await moveBlockToSchedule(block.id);
  };

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionsOpen(false);
    await duplicateBlock(block.id);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionsOpen(false);
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
      onMouseLeave={() => setIsActionsOpen(false)}
      tabIndex={0}
      className={`absolute left-1 right-1 rounded-small p-1.5 shadow-sm z-blocks cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-text-primary/10 transition-colors group flex flex-col border border-l-[3px] text-text-primary overflow-visible ${isDragging ? 'opacity-85 scale-[1.02] shadow-hover' : ''} ${isSelected ? 'scheduled-block-selected' : ''}`}
      title={tooltip}
    >
      {isSelected && <SelectionHandles />}

      <div className="flex justify-between items-start gap-1 min-w-0">
        <div className="min-w-0 flex-1 pr-0">
          <div className="text-[10px] font-bold text-text-secondary leading-[1.15] truncate" style={{ wordBreak: 'normal', overflowWrap: 'normal', hyphens: 'none' }}>{visibleTimeLabel}{secondaryTimeStr && !isShortBlock && ` • ${secondaryTimeStr}`}</div>
          <div
            className="mt-0.5 text-[12px] font-bold leading-[1.15]"
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
      </div>

      {usesCompactActions ? (
        <CompactActionMenu
          isOpen={isActionsOpen}
          onToggle={(e) => {
            e.stopPropagation();
            setIsActionsOpen(prev => !prev);
          }}
          onEdit={handleEditAction}
          onMoveToSchedule={handleMoveToSchedule}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onPointerStop={stopActionPointer}
        />
      ) : (
        <FloatingActionToolbar
          placement={actionPlacement}
          onEdit={handleEditAction}
          onMoveToSchedule={handleMoveToSchedule}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onPointerStop={stopActionPointer}
        />
      )}
      
      <div className="flex flex-wrap items-center gap-1 mt-0.5 overflow-hidden pointer-events-none">
        {childcare?.enabled && !childcare.isComplete && <div className="text-[10px] font-semibold bg-white/70 border border-border-default px-1 rounded flex items-center whitespace-nowrap" title="Childcare needed">Childcare?</div>}
        {childcare?.enabled && childcare.isComplete && <div className="text-[10px] font-semibold bg-white/60 border border-border-default px-1 rounded flex items-center whitespace-nowrap opacity-80" title="Childcare sorted">✓ childcare</div>}
        {hasConflicts && <div className="text-[10px] font-bold text-semantic-danger bg-white/75 border border-semantic-danger/30 px-1 rounded flex items-center whitespace-nowrap" title="Overlaps with another block">⚠ overlap</div>}
        {isOutOfBounds && <div className="text-[10px] font-bold text-semantic-danger bg-white/75 border border-semantic-danger/30 px-1 rounded flex items-center whitespace-nowrap" title="Travel extends outside day bounds">⚠ bounds</div>}
        {isLongBlock && <div className="text-[10px] font-semibold text-text-secondary bg-white/55 border border-border-default px-1 rounded whitespace-nowrap">{formatDurationLabel(block.durationMinutes)}</div>}
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

interface ActionControlsProps {
  onEdit: (e: React.MouseEvent) => void;
  onMoveToSchedule: (e: React.MouseEvent) => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onPointerStop: (e: React.PointerEvent | React.MouseEvent) => void;
}

type ActionPlacement = 'above' | 'below';

interface FloatingActionToolbarProps extends ActionControlsProps {
  placement: ActionPlacement;
}

const FloatingActionToolbar: React.FC<FloatingActionToolbarProps> = ({ placement, onEdit, onMoveToSchedule, onDuplicate, onDelete, onPointerStop }) => (
  <div className={`pointer-events-none absolute right-0 z-30 hidden items-center gap-1 rounded-small border border-border-default bg-surface-primary/95 px-1 py-1 shadow-sm backdrop-blur group-hover:flex group-focus-within:flex ${placement === 'above' ? '-top-8' : 'top-full mt-1'}`}>
    <ActionButton label="Edit" onClick={onEdit} onPointerStop={onPointerStop}>✎</ActionButton>
    <ActionButton label="Move to Ready to schedule" onClick={onMoveToSchedule} onPointerStop={onPointerStop}>↰</ActionButton>
    <ActionButton label="Duplicate" onClick={onDuplicate} onPointerStop={onPointerStop}>⧉</ActionButton>
    <ActionButton label="Delete" onClick={onDelete} onPointerStop={onPointerStop} danger>×</ActionButton>
  </div>
);

interface CompactActionMenuProps extends ActionControlsProps {
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
}

const CompactActionMenu: React.FC<CompactActionMenuProps> = ({ isOpen, onToggle, onEdit, onMoveToSchedule, onDuplicate, onDelete, onPointerStop }) => (
  <div className="pointer-events-none absolute -right-2 -top-2 z-30 flex items-start justify-end">
    <button
      type="button"
      aria-label="Block actions"
      aria-expanded={isOpen}
      onPointerDown={onPointerStop}
      onPointerUp={onPointerStop}
      onClick={onToggle}
      className="pointer-events-none h-6 w-6 rounded-full border border-border-default bg-surface-primary/95 text-[13px] font-bold leading-none text-text-secondary opacity-0 shadow-sm transition-opacity hover:text-text-primary group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      title="Block actions"
    >
      ⋯
    </button>

    {isOpen && (
      <div className="pointer-events-auto absolute right-0 top-7 flex items-center gap-1 rounded-small border border-border-default bg-surface-primary/95 px-1 py-1 shadow-sm backdrop-blur">
        <ActionButton label="Edit" onClick={onEdit} onPointerStop={onPointerStop}>✎</ActionButton>
        <ActionButton label="Move to Ready to schedule" onClick={onMoveToSchedule} onPointerStop={onPointerStop}>↰</ActionButton>
        <ActionButton label="Duplicate" onClick={onDuplicate} onPointerStop={onPointerStop}>⧉</ActionButton>
        <ActionButton label="Delete" onClick={onDelete} onPointerStop={onPointerStop} danger>×</ActionButton>
      </div>
    )}
  </div>
);

interface ActionButtonProps {
  children: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  onPointerStop: (e: React.PointerEvent | React.MouseEvent) => void;
  danger?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({ children, label, onClick, onPointerStop, danger = false }) => (
  <button
    type="button"
    onPointerDown={onPointerStop}
    onPointerUp={onPointerStop}
    onClick={onClick}
    className={`pointer-events-auto flex h-6 w-6 items-center justify-center rounded-[7px] text-[12px] font-bold transition-colors ${danger ? 'text-semantic-danger hover:bg-semantic-danger/10' : 'text-text-secondary hover:bg-background hover:text-text-primary'}`}
    title={label}
    aria-label={label}
  >
    {children}
  </button>
);

const getBlockTone = (block: PlannerBlock, hasConflicts: boolean, categoryName?: string): { background: string; border: string; accent: string } => {
  if (hasConflicts || block.reviewColour === 'RED') {
    return { background: '#FFF1F3', border: '#FDA4AF', accent: '#E85D75' };
  }
  if (block.reviewColour === 'ORANGE' || block.isBaseEvent) {
    return { background: '#FFF7E6', border: '#F4B04F', accent: '#F59E0B' };
  }
  if (categoryName?.trim().toLowerCase() === 'personal') {
    return { background: '#F3EFFF', border: '#CDBDFF', accent: '#7C5CFC' };
  }
  return { background: '#F4F7FB', border: '#CDD6E3', accent: '#8A93A3' };
};

const getReviewStatus = (reviewColour: string): string => {
  if (reviewColour === 'ORANGE') return 'Needs review';
  if (reviewColour === 'RED') return 'Conflict or unclear';
  return 'Confirmed';
};
