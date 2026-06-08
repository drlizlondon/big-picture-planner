import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useToScheduleBlocks, useCategories, useFeatures } from '../../hooks/usePlannerData';
import type { PlannerBlock, Category } from '../../types/models';
import { deleteBlock, duplicateBlock } from '../../services/plannerActions';
import { getCategoryColor } from '../../utils/categoryColors';

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
    if (!normalizedQuery) return blocks;
    return blocks.filter(block => {
      const category = block.categoryId ? categoryMap[block.categoryId] : undefined;
      return [
        block.title,
        block.description || '',
        category?.name || '',
      ].some(value => value.toLowerCase().includes(normalizedQuery));
    });
  }, [unscheduledBlocks, query, categoryMap]);

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
          <h2 className="text-[15px] font-bold">{inboxTitle} <span className="text-[12px] text-text-muted font-semibold">({unscheduledBlocks?.length || 0})</span></h2>
          {!isTray && <p className="text-[12px] text-text-secondary mt-0.5">Things waiting for a place.</p>}
        </div>
        {isTray && <div className="ml-auto text-[12px] font-semibold text-text-secondary">{isDraggingBlock ? 'Place it in the week' : 'Long press to pick up'}</div>}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={`${isTray ? 'sr-only' : 'h-[36px]'} rounded-small border border-border-default bg-background px-3 text-[13px] outline-none focus:border-accent-primary mb-3`}
        placeholder="Search ready items..."
      />
      
      <div
        className={isTray ? 'mobile-inbox-rail' : 'flex flex-col gap-1.5 overflow-y-auto min-h-0 pr-1'}
        style={isTray ? { gridTemplateRows: gridRows } : undefined}
      >
        {unscheduledBlocks === undefined ? (
          <p className="text-[14px] text-text-muted text-center mt-4">Loading...</p>
        ) : visibleBlocks.length === 0 ? (
          <p className={`${isTray ? 'mobile-inbox-empty' : 'text-center mt-4'} text-[13px] text-text-secondary`}>
            {query.trim() ? 'Nothing matching that search.' : isTray ? 'Nothing to schedule.' : 'Nothing waiting for a place right now.'}
          </p>
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

  return (
    <div 
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onPointerDown={(e) => {
        handlePointerDown(e);
        listeners?.onPointerDown?.(e);
      }}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
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
          <div className={`${isTray ? 'mobile-inbox-card-title' : 'truncate'} text-[12px] font-bold text-text-primary`}>{block.title}</div>
          <div className="ml-auto flex-shrink-0 rounded-[999px] border border-border-default bg-background px-2 py-0.5 text-[10px] font-bold text-text-secondary">{block.durationMinutes} min</div>
        </div>
        {!isTray && block.description && (
          <div className="text-[11px] text-text-secondary mt-0.5 truncate leading-tight">
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
      <div className="absolute right-2 top-1.5 hidden group-hover:flex gap-1 z-20">
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

const getReviewColor = (reviewColour?: string): string | undefined => {
  if (reviewColour === 'ORANGE') return '#F4B04F';
  if (reviewColour === 'RED') return '#E85D75';
  return undefined;
};
