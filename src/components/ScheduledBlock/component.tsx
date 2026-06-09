import React, { useEffect, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { PlannerBlock } from '../../types/models';
import { calculateEndTime, getBlockConflicts, getEffectiveMinuteRange, minutesToTime, timeToMinutes } from '../../utils/planningEngine';
import { useCategories, useFeatures } from '../../hooks/usePlannerData';
import { deleteBlock, duplicateBlock, moveBlockToSchedule, moveBlockToWeek } from '../../services/plannerActions';
import { BUILT_IN_CHILDCARE_FEATURE_ID } from '../../utils/plannerSetup';
import { formatDurationLabel } from '../../utils/durationLabels';
import { isGCalBlock } from '../../services/googleCalendarService';
import { isIcsBlock } from '../../services/icsImportService';

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

  const gcal = isGCalBlock(block);
  const ics = isIcsBlock(block);
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
      data-tour="scheduled-block"
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
          <div className="text-[10px] font-bold text-text-secondary leading-[1.15] truncate flex items-center gap-1" style={{ wordBreak: 'normal', overflowWrap: 'normal', hyphens: 'none' }}>
            {gcal && (
              <svg width="9" height="9" viewBox="0 0 18 18" aria-label="Google Calendar" className="flex-shrink-0 opacity-70">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
                <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z"/>
              </svg>
            )}
            {ics && (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-label="Apple Calendar" className="flex-shrink-0 opacity-70 text-red-500">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
            )}
            <span>{visibleTimeLabel}{secondaryTimeStr && !isShortBlock && ` • ${secondaryTimeStr}`}</span>
          </div>
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

      {gcal ? (
        // Google Calendar events: link out to Google Calendar + allow removal
        <GCalActionMenu
          block={block}
          isOpen={isActionsOpen}
          onToggle={(e) => { e.stopPropagation(); setIsActionsOpen(prev => !prev); }}
          onDelete={handleDelete}
          onPointerStop={stopActionPointer}
          isCompact={usesCompactActions}
          placement={actionPlacement}
        />
      ) : ics ? (
        // Apple Calendar .ics imports: just allow removal from view
        <IcsActionMenu
          onDelete={handleDelete}
          onPointerStop={stopActionPointer}
          isCompact={usesCompactActions}
          isOpen={isActionsOpen}
          onToggle={(e) => { e.stopPropagation(); setIsActionsOpen(prev => !prev); }}
          placement={actionPlacement}
        />
      ) : usesCompactActions ? (
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

// ─── Google Calendar action menu ──────────────────────────────────────────────

interface GCalActionMenuProps {
  block: PlannerBlock;
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onPointerStop: (e: React.PointerEvent | React.MouseEvent) => void;
  isCompact: boolean;
  placement: ActionPlacement;
}

const GCalActionMenu: React.FC<GCalActionMenuProps> = ({ block, isOpen, onToggle, onDelete, onPointerStop, isCompact, placement }) => {
  const gcalHref = block.importRawLine || 'https://calendar.google.com';

  const buttons = (
    <>
      <a
        href={gcalHref}
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={onPointerStop}
        onPointerUp={onPointerStop}
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto flex h-6 items-center justify-center gap-1 rounded-[7px] px-2 text-[11px] font-bold text-[#4285F4] hover:bg-[#E8F0FE] whitespace-nowrap"
        title="Open in Google Calendar"
      >
        <svg width="10" height="10" viewBox="0 0 18 18" aria-hidden="true">
          <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
          <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"/>
          <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z"/>
        </svg>
        Open
      </a>
      <ActionButton label="Remove from view" onClick={onDelete} onPointerStop={onPointerStop} danger>×</ActionButton>
    </>
  );

  if (isCompact) {
    return (
      <div className="pointer-events-none absolute -right-2 -top-2 z-30 flex items-start justify-end">
        <button
          type="button"
          aria-label="Calendar event options"
          aria-expanded={isOpen}
          onPointerDown={onPointerStop}
          onPointerUp={onPointerStop}
          onClick={onToggle}
          className="pointer-events-none h-6 w-6 rounded-full border border-[#A8C4FB] bg-[#E8F0FE]/95 text-[13px] font-bold leading-none text-[#4285F4] opacity-0 shadow-sm transition-opacity hover:text-[#1a73e8] group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        >
          ⋯
        </button>
        {isOpen && (
          <div className="pointer-events-auto absolute right-0 top-7 flex items-center gap-1 rounded-small border border-[#A8C4FB] bg-[#E8F0FE]/95 px-1 py-1 shadow-sm backdrop-blur">
            {buttons}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`pointer-events-none absolute right-0 z-30 hidden items-center gap-1 rounded-small border border-[#A8C4FB] bg-[#E8F0FE]/95 px-1 py-1 shadow-sm backdrop-blur group-hover:flex group-focus-within:flex ${placement === 'above' ? '-top-8' : 'top-full mt-1'}`}>
      {buttons}
    </div>
  );
};

// ─── Apple Calendar .ics action menu ─────────────────────────────────────────

interface IcsActionMenuProps {
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onPointerStop: (e: React.PointerEvent | React.MouseEvent) => void;
  isCompact: boolean;
  placement: ActionPlacement;
}

const IcsActionMenu: React.FC<IcsActionMenuProps> = ({ isOpen, onToggle, onDelete, onPointerStop, isCompact, placement }) => {
  const buttons = (
    <ActionButton label="Remove from view" onClick={onDelete} onPointerStop={onPointerStop} danger>×</ActionButton>
  );

  if (isCompact) {
    return (
      <div className="pointer-events-none absolute -right-2 -top-2 z-30 flex items-start justify-end">
        <button
          type="button"
          aria-label="Calendar event options"
          aria-expanded={isOpen}
          onPointerDown={onPointerStop}
          onPointerUp={onPointerStop}
          onClick={onToggle}
          className="pointer-events-none h-6 w-6 rounded-full border border-red-200 bg-red-50/95 text-[13px] font-bold leading-none text-red-500 opacity-0 shadow-sm transition-opacity hover:text-red-600 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        >
          ⋯
        </button>
        {isOpen && (
          <div className="pointer-events-auto absolute right-0 top-7 flex items-center gap-1 rounded-small border border-red-200 bg-red-50/95 px-1 py-1 shadow-sm backdrop-blur">
            {buttons}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`pointer-events-none absolute right-0 z-30 hidden items-center gap-1 rounded-small border border-red-200 bg-red-50/95 px-1 py-1 shadow-sm backdrop-blur group-hover:flex group-focus-within:flex ${placement === 'above' ? '-top-8' : 'top-full mt-1'}`}>
      {buttons}
    </div>
  );
};

const getBlockTone = (block: PlannerBlock, hasConflicts: boolean, categoryName?: string): { background: string; border: string; accent: string } => {
  if (hasConflicts || block.reviewColour === 'RED') {
    return { background: '#FFF1F3', border: '#FDA4AF', accent: '#E85D75' };
  }
  // Google Calendar events — distinct blue
  if (isGCalBlock(block)) {
    return { background: '#E8F0FE', border: '#A8C4FB', accent: '#4285F4' };
  }
  // Apple Calendar .ics imports — soft red/coral (matches Apple Calendar branding)
  if (isIcsBlock(block)) {
    return { background: '#FFF5F5', border: '#FECACA', accent: '#EF4444' };
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
