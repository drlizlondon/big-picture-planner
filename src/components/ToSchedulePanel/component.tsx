import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useToScheduleBlocks, useCategories, useFeatures } from '../../hooks/usePlannerData';
import type { PlannerBlock, Category } from '../../types/models';
import { deleteBlock, duplicateBlock, updateBlock } from '../../services/plannerActions';
import { getCategoryColor } from '../../utils/categoryColors';

type InboxSortMode = 'last-added' | 'prioritised';

interface Props {
  onEditBlock: (blockId: string) => void;
  variant?: 'sidebar' | 'tray';
  isExpanded?: boolean;
  isDraggingBlock?: boolean;
  onTrayToggle?: () => void;
  onTrayExpandedChange?: (isExpanded: boolean) => void;
}

export const ToSchedulePanel: React.FC<Props> = ({
  onEditBlock,
  variant = 'sidebar',
  isExpanded = false,
  isDraggingBlock = false,
  onTrayToggle,
  onTrayExpandedChange,
}) => {
  const unscheduledBlocks = useToScheduleBlocks();
  const categories = useCategories();
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<InboxSortMode>('last-added');
  const trayPointerStart = useRef<{ x: number; y: number } | null>(null);
  const { isOver, setNodeRef } = useDroppable({
    id: 'ready-to-schedule-drop',
    data: { toLifeInbox: true },
  });
  
  const categoryMap = useMemo(() => categories?.reduce((acc: Record<string, Category>, cat: Category) => {
    acc[cat.id] = cat;
    return acc;
  }, {} as Record<string, Category>) || {}, [categories]);

  const visibleBlocks = useMemo(() => {
    const blocks = unscheduledBlocks || [];
    const normalizedQuery = query.trim().toLowerCase();
    const matchingBlocks = normalizedQuery ? blocks.filter(block => {
      const category = block.categoryId ? categoryMap[block.categoryId] : undefined;
      return [
        block.title,
        block.description || '',
        category?.name || '',
      ].some(value => value.toLowerCase().includes(normalizedQuery));
    }) : blocks;

    return sortLifeInboxBlocks(matchingBlocks, sortMode);
  }, [unscheduledBlocks, query, categoryMap, sortMode]);

  const handleTrayPointerDown = (event: React.PointerEvent) => {
    trayPointerStart.current = { x: event.clientX, y: event.clientY };
  };

  const handleTrayPointerUp = (event: React.PointerEvent) => {
    if (!trayPointerStart.current || !onTrayExpandedChange) return;
    const deltaY = event.clientY - trayPointerStart.current.y;
    trayPointerStart.current = null;
    if (Math.abs(deltaY) < 18) return;
    onTrayExpandedChange(deltaY < 0);
  };

  const isTray = variant === 'tray';
  const gridRows = isTray ? 'repeat(1, minmax(58px, 1fr))' : undefined;
  const inboxTitle = isTray ? 'Life Inbox' : 'Ready to schedule';

  return (
    <div ref={setNodeRef} data-tour={isTray ? undefined : 'ready-to-schedule'} className={`${isTray ? 'mobile-tray-panel' : 'flex flex-col bg-surface-primary rounded-medium border p-3 flex-1 shadow-sm overflow-hidden min-h-0'} transition-colors ${isOver ? 'border-accent-primary bg-accent-primary/[0.035]' : 'border-border-default'}`}>
      <div
        className={`${isTray ? 'mobile-tray-header' : 'mb-3'}`}
        onPointerDown={isTray ? handleTrayPointerDown : undefined}
        onPointerUp={isTray ? handleTrayPointerUp : undefined}
      >
        <button
          type="button"
          onClick={onTrayToggle}
          className={`${isTray ? 'mobile-tray-handle' : 'hidden'}`}
          aria-label={isExpanded ? 'Collapse Ready to schedule' : 'Expand Ready to schedule'}
        >
          <span className={isExpanded ? 'rotate-180' : ''}>▲</span>
        </button>
        <div className="min-w-0">
          <h2 className="text-[13px] font-bold">{inboxTitle} <span className="text-[11px] text-text-muted font-semibold">({unscheduledBlocks?.length || 0})</span></h2>
          {!isTray && <p className="text-[11px] text-text-secondary mt-0.5">Things waiting for a place.</p>}
        </div>
        {isTray && (isDraggingBlock ? (
          <div className="ml-auto text-[11px] font-semibold text-text-secondary">Place it in the week</div>
        ) : (
          <button
            type="button"
            onClick={() => setSortMode(sortMode === 'last-added' ? 'prioritised' : 'last-added')}
            className="ml-auto h-7 rounded-small border border-border-default bg-background px-2 text-[11px] font-bold text-text-secondary transition-colors hover:border-accent-primary/35 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
            aria-label={`Sort Life Inbox. Current sort: ${sortMode === 'last-added' ? 'Last added' : 'Prioritised'}`}
          >
            {sortMode === 'last-added' ? 'Last added' : 'Prioritised'}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={`${isTray ? 'sr-only' : 'h-[36px]'} rounded-small border border-border-default bg-background px-3 text-[13px] outline-none focus:border-accent-primary mb-3`}
        placeholder="Search ready items..."
      />
      {!isTray && (
        <div className="mb-3 grid grid-cols-2 rounded-small border border-border-default bg-background p-1" role="group" aria-label="Sort Life Inbox">
          <button
            type="button"
            onClick={() => setSortMode('last-added')}
            className={`h-8 rounded-[8px] text-[12px] font-bold transition-colors ${sortMode === 'last-added' ? 'bg-surface-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            aria-pressed={sortMode === 'last-added'}
          >
            Last added
          </button>
          <button
            type="button"
            onClick={() => setSortMode('prioritised')}
            className={`h-8 rounded-[8px] text-[12px] font-bold transition-colors ${sortMode === 'prioritised' ? 'bg-surface-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            aria-pressed={sortMode === 'prioritised'}
          >
            Prioritised
          </button>
        </div>
      )}
      
      <div
        className={isTray ? 'mobile-inbox-rail' : 'flex flex-col gap-1.5 overflow-y-auto min-h-0 pr-1'}
        style={isTray ? { gridTemplateRows: gridRows } : undefined}
      >
        {unscheduledBlocks === undefined ? (
          <p className="text-[14px] text-text-muted text-center mt-4">Loading...</p>
        ) : visibleBlocks.length === 0 ? (
          <div className={`${isTray ? 'mobile-inbox-empty' : 'text-center mt-4'} text-[13px] text-text-secondary`}>
            <p>{query.trim() ? 'Nothing matching that search.' : isTray ? 'Nothing to schedule.' : 'Nothing waiting for a place right now.'}</p>
            {!isTray && !query.trim() && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('planner:start-tour'))}
                className="mt-2 text-[12px] font-semibold text-accent-primary hover:underline"
              >
                ▶ Replay the 60-second demo
              </button>
            )}
          </div>
        ) : (
          visibleBlocks.map((block: PlannerBlock) => (
            <DraggableBlockItem 
              key={block.id} 
              block={block} 
              categoryMap={categoryMap} 
              onEditBlock={onEditBlock}
              variant={variant}
            />
          ))
        )}
      </div>
    </div>
  );
};

interface DraggableBlockProps {
  block: PlannerBlock;
  categoryMap: Record<string, Category>;
  onEditBlock: (id: string) => void;
  variant?: 'sidebar' | 'tray';
}

const DraggableBlockItem: React.FC<DraggableBlockProps> = ({ block, categoryMap, onEditBlock, variant = 'sidebar' }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.id,
    data: block
  });

  const allFeatures = useFeatures() || [];
  const activeFeatures = allFeatures.filter(f => block.features?.[f.id]?.enabled);
  const category = block.categoryId ? categoryMap[block.categoryId] : undefined;
  const categoryColor = getCategoryColor(category);
  const reviewColor = getReviewColor(block.reviewColour);

  const wasDragging = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (isDragging) {
      wasDragging.current = true;
      window.navigator.vibrate?.(8);
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
    onEditBlock(block.id);
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
      onEditBlock(block.id);
    }
  };

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: 50,
  } : undefined;

  const isTray = variant === 'tray';
  const isPrioritised = block.isPrioritised === true;

  return (
    <div
      ref={setNodeRef}
      data-tour={isTray ? undefined : 'ready-item'}
      {...listeners}
      {...attributes}
      onPointerDown={(e) => {
        handlePointerDown(e);
        listeners?.onPointerDown?.(e);
      }}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      aria-label={`Edit ${block.title}`}
      className={`${isTray ? 'mobile-inbox-card' : 'min-h-[46px] px-2.5 py-2 touch-none'} bg-surface-primary rounded-small border border-border-default cursor-grab active:cursor-grabbing hover:shadow-hover hover:-translate-y-[1px] hover:border-accent-primary/35 transition-all group relative overflow-hidden flex gap-2 shadow-sm ${isDragging ? 'opacity-90 scale-[1.04] shadow-hover ring-2 ring-accent-primary/20' : ''}`}
      style={{ ...style, borderColor: reviewColor ? `${reviewColor}99` : `${categoryColor}33`, backgroundColor: reviewColor ? `${reviewColor}0D` : undefined }}
      title="Edit block"
    >
      {(category || reviewColor) && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: reviewColor || categoryColor }} />
      )}
      <div className="w-5 flex-shrink-0 flex items-center justify-center rounded-[7px] border border-border-default/70 bg-background text-text-muted text-[12px] opacity-80 group-hover:border-accent-primary/35 group-hover:text-accent-primary group-hover:opacity-100" title="Drag into your week">⋮⋮</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {category && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColor }} title={category.name} />}
          <div className={`${isTray ? 'mobile-inbox-card-title' : 'ready-item-title'} text-[11px] font-bold text-text-primary`}>{block.title}</div>
          <div className="ml-auto flex-shrink-0 rounded-[999px] border border-border-default bg-background px-1.5 py-0.5 text-[9px] font-bold text-text-secondary">{block.durationMinutes} min</div>
        </div>
        {!isTray && block.description && (
          <div className="ready-item-description text-[10px] text-text-secondary mt-0.5 leading-tight">
            {block.description}
          </div>
        )}
        {!isTray && activeFeatures.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {activeFeatures.map(f => (
              <span key={f.id} className="text-[10px] bg-background border border-border-default px-1.5 py-0.5 rounded-sm text-text-secondary font-medium flex items-center gap-0.5">
                {f.icon && <span>{f.icon}</span>}{f.name} {block.features?.[f.id]?.isComplete ? '✓' : '?'}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={async (e) => {
          e.stopPropagation();
          await updateBlock(block.id, { isPrioritised: !isPrioritised });
        }}
        className={`priority-toggle h-7 w-7 flex-shrink-0 self-start rounded-[8px] border text-[17px] font-black leading-none transition-all focus:outline-none focus:ring-2 focus:ring-[#F8A6B8]/50 ${isPrioritised ? 'border-[#F8A6B8] bg-[#FFF1F5] text-[#C74368] shadow-[0_0_14px_rgba(232,93,117,0.24)]' : 'border-border-default/80 bg-background text-text-muted/70 opacity-75 hover:border-[#F8A6B8]/70 hover:bg-[#FFF7F9] hover:text-[#C74368] hover:opacity-100'}`}
        aria-label={isPrioritised ? `Remove priority from ${block.title}` : `Mark ${block.title} as prioritised`}
        aria-pressed={isPrioritised}
        title={isPrioritised ? 'Remove priority' : 'Mark as prioritised'}
      >
        *
      </button>
      <div className="absolute right-11 top-1.5 hidden group-hover:flex gap-1 z-20">
        <span className="text-text-muted bg-surface-primary rounded shadow-sm border border-border-default px-1.5 text-[11px] leading-[22px]" title="Edit block">✎</span>
        <button 
          onPointerDown={(e) => e.stopPropagation()} 
          onPointerUp={(e) => e.stopPropagation()}
          onClick={async (e) => {
            e.stopPropagation();
            await duplicateBlock(block.id);
          }} 
          className="text-text-muted hover:text-text-primary p-1 bg-surface-primary rounded shadow-sm border border-border-default" 
          title="Duplicate"
        >
          ⧉
        </button>
        <button 
          onPointerDown={(e) => e.stopPropagation()} 
          onPointerUp={(e) => e.stopPropagation()}
          onClick={async (e) => {
            e.stopPropagation();
            await deleteBlock(block.id);
          }} 
          className="text-semantic-danger hover:text-semantic-danger p-1 bg-surface-primary rounded shadow-sm border border-border-default" 
          title="Delete"
        >
          ×
        </button>
      </div>
    </div>
  );
};

const sortLifeInboxBlocks = (blocks: PlannerBlock[], sortMode: InboxSortMode): PlannerBlock[] => {
  return [...blocks].sort((a, b) => {
    if (sortMode === 'prioritised') {
      const priorityDelta = Number(b.isPrioritised === true) - Number(a.isPrioritised === true);
      if (priorityDelta !== 0) return priorityDelta;
    }

    return getCreatedAt(b) - getCreatedAt(a);
  });
};

const getCreatedAt = (block: PlannerBlock): number => block.createdAt || block.updatedAt || 0;

const getReviewColor = (reviewColour?: string): string | undefined => {
  if (reviewColour === 'ORANGE') return '#F4B04F';
  if (reviewColour === 'RED') return '#E85D75';
  return undefined;
};
