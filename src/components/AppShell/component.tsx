import React, { useEffect, useRef, useState } from 'react';
import { PlannerHeader } from '../PlannerHeader/component';
import { Sidebar } from '../Sidebar/component';
import { WeekGrid } from '../WeekGrid/component';
import { addDays } from '../../utils/dateUtils';
import { DndContext, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { moveBlockByDays, moveBlockByMinutes, moveBlockToSchedule, moveBlockToWeek, resizeBlockDuration } from '../../services/plannerActions';
import { AddToPlannerModal } from '../AddToPlannerModal/component';
import { BlockEditor } from '../BlockEditor/component';
import { PlannerSetupPanel } from '../PlannerSetupPanel/component';
import { ToSchedulePanel } from '../ToSchedulePanel/component';
import { useBlock } from '../../hooks/usePlannerData';
import { calculateEndTime } from '../../utils/planningEngine';

const MOBILE_INBOX_PREF_KEY = 'planner.mobileInboxExpanded';
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
};

// The main application shell layout
export const AppShell: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date()); // Boots into the user's actual week
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isBlockEditorOpen, setIsBlockEditorOpen] = useState(false);
  const [isPlannerSetupOpen, setIsPlannerSetupOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('planner.sidebarCollapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isDraggingBlock, setIsDraggingBlock] = useState(false);
  const [mobileExpandedDate, setMobileExpandedDate] = useState<string | null>(null);
  const [lastScheduledBlockId, setLastScheduledBlockId] = useState<string | null>(null);
  const [isMobileInboxExpanded, setIsMobileInboxExpanded] = useState(() => {
    try {
      return localStorage.getItem(MOBILE_INBOX_PREF_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const selectedBlock = useBlock(selectedBlockId);
  const weekSwitchTimer = useRef<number | null>(null);
  const dayExpandTimer = useRef<number | null>(null);
  const keyboardQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeHoverDate = useRef<string | null>(null);
  const activeEdgeId = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    })
  );

  const handleEditBlock = (blockId: string) => {
    setSelectedBlockId(null);
    setEditingBlockId(blockId);
    setIsBlockEditorOpen(true);
  };

  const handleSelectBlock = (blockId: string) => {
    setSelectedBlockId(blockId);
  };

  const handlePrevWeek = () => setCurrentDate(prev => addDays(prev, -7));
  const handleNextWeek = () => setCurrentDate(prev => addDays(prev, 7));
  const handleToday = () => setCurrentDate(new Date());

  const updateSidebarCollapsed = (isCollapsed: boolean) => {
    setIsSidebarCollapsed(isCollapsed);
    try {
      localStorage.setItem('planner.sidebarCollapsed', String(isCollapsed));
    } catch {
      // Keep the in-memory preference if storage is unavailable.
    }
  };

  const updateMobileInboxExpanded = (isExpanded: boolean) => {
    setIsMobileInboxExpanded(isExpanded);
    try {
      localStorage.setItem(MOBILE_INBOX_PREF_KEY, String(isExpanded));
    } catch {
      // Keep the in-memory preference if storage is unavailable.
    }
  };
  const isBlockingPanelOpen = isAddModalOpen || isBlockEditorOpen || isPlannerSetupOpen;

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      if (!selectedBlock || isBlockingPanelOpen) return;
      if (isTypingTarget(event.target)) return;
      if (!selectedBlock.date || !selectedBlock.startTime) return;

      const isMoveKey = event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      const isDurationKey = event.key === '+' || event.key === '=' || event.key === '-' || event.key === '_';
      if (!isMoveKey && !isDurationKey) return;

      event.preventDefault();
      const key = event.key;
      const blockId = selectedBlock.id;

      keyboardQueueRef.current = keyboardQueueRef.current.catch(() => undefined).then(async () => {
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          await moveBlockByDays(blockId, key === 'ArrowLeft' ? -1 : 1);
          return;
        }

        if (key === 'ArrowUp' || key === 'ArrowDown') {
          await moveBlockByMinutes(blockId, key === 'ArrowUp' ? -15 : 15);
          return;
        }

        try {
          await resizeBlockDuration(blockId, key === '-' || key === '_' ? -15 : 15);
        } catch {
          // Keep the current duration if the new end time would leave the day.
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBlockingPanelOpen, selectedBlock]);

  const clearWeekSwitchTimer = () => {
    if (weekSwitchTimer.current !== null) {
      window.clearTimeout(weekSwitchTimer.current);
      weekSwitchTimer.current = null;
    }
    activeEdgeId.current = null;
  };

  const clearDayExpandTimer = () => {
    if (dayExpandTimer.current !== null) {
      window.clearTimeout(dayExpandTimer.current);
      dayExpandTimer.current = null;
    }
    activeHoverDate.current = null;
  };

  const handleDragOver = (event: DragOverEvent) => {
    const dropData = event.over?.data.current as { edgeWeekOffset?: number, date?: string } | undefined;
    const edgeId = dropData?.edgeWeekOffset ? String(event.over?.id) : null;

    if (!dropData?.edgeWeekOffset || !edgeId) {
      clearWeekSwitchTimer();
    } else if (activeEdgeId.current !== edgeId) {
      clearWeekSwitchTimer();
      activeEdgeId.current = edgeId;
      weekSwitchTimer.current = window.setTimeout(() => {
        setCurrentDate(prev => addDays(prev, dropData.edgeWeekOffset! * 7));
        weekSwitchTimer.current = null;
      }, 650);
    }

    if (!dropData?.date) {
      clearDayExpandTimer();
      return;
    }

    if (activeHoverDate.current === dropData.date) return;

    clearDayExpandTimer();
    activeHoverDate.current = dropData.date;
    dayExpandTimer.current = window.setTimeout(() => {
      setMobileExpandedDate(dropData.date || null);
      dayExpandTimer.current = null;
    }, 360);
  };

  const handleDragStart = (event: DragStartEvent) => {
    clearDayExpandTimer();
    if (event.active.id) {
      // The active id is intentionally read here so dnd-kit initializes item data before touch movement.
    }
    setIsDraggingBlock(true);
  };

  // Handle drop from Life Inbox -> Week Canvas OR moving between days/times.
  const handleDragEnd = async (event: DragEndEvent) => {
    clearWeekSwitchTimer();
    clearDayExpandTimer();
    setIsDraggingBlock(false);
    setMobileExpandedDate(null);
    const { active, over } = event;
    if (!over) return;
    
    const blockId = active.id as string;
    const dropData = over.data.current as { date?: string, startTime?: string, edgeWeekOffset?: number, toLifeInbox?: boolean };
    
    if (dropData && dropData.date && dropData.startTime) {
      await moveBlockToWeek(blockId, dropData.date, dropData.startTime);
      setSelectedBlockId(blockId);
      setLastScheduledBlockId(blockId);
    } else if (dropData?.edgeWeekOffset) {
      setCurrentDate(prev => addDays(prev, dropData.edgeWeekOffset! * 7));
    } else if (dropData && dropData.toLifeInbox) {
      await moveBlockToSchedule(blockId);
      setSelectedBlockId(null);
    }
  };

  const handleDragCancel = () => {
    clearWeekSwitchTimer();
    clearDayExpandTimer();
    setIsDraggingBlock(false);
    setMobileExpandedDate(null);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
    <div className="relative flex flex-col h-screen overflow-hidden bg-white text-text-primary font-sans">
      <PlannerHeader currentDate={currentDate} onPrevWeek={handlePrevWeek} onNextWeek={handleNextWeek} onToday={handleToday} onOpenSetup={() => setIsPlannerSetupOpen(true)} />
      
      <div className={`planner-workspace flex flex-1 overflow-hidden p-3 gap-2 ${isMobileInboxExpanded ? 'mobile-inbox-expanded' : 'mobile-inbox-collapsed'} ${isDraggingBlock ? 'is-dragging-block' : ''}`}>
        {isSidebarCollapsed ? (
          <button
            onClick={() => updateSidebarCollapsed(false)}
            className="hidden md:block w-11 flex-shrink-0 rounded-medium border border-border-default bg-surface-primary shadow-sm text-accent-primary font-bold hover:bg-background transition-colors"
            title="Show Life Inbox"
          >
            »
          </button>
        ) : (
          <aside className="planner-sidebar w-[240px] flex-shrink-0 flex flex-col gap-3 overflow-hidden relative">
            <Sidebar onAddClick={() => setIsAddModalOpen(true)} onEditBlock={handleEditBlock} onViewToday={handleToday} />
            <button
              onClick={() => updateSidebarCollapsed(true)}
              className="absolute right-2 bottom-2 h-9 w-9 rounded-medium border border-accent-primary/30 bg-surface-primary text-accent-primary shadow-sm hover:bg-accent-primary/5 transition-colors"
              title="Collapse sidebar"
            >
              «
            </button>
          </aside>
        )}
        
        <WeekEdgeDropZone id="previous-week" title="Previous Week" helper="Drag here or click to view previous week" weekOffset={-1} isDraggingBlock={isDraggingBlock} onClick={handlePrevWeek} />
        <main className="flex-1 bg-surface-primary rounded-large shadow-sm border border-border-default overflow-hidden flex flex-col min-w-0">
          <WeekGrid currentDate={currentDate} onEditBlock={handleEditBlock} onSelectBlock={handleSelectBlock} selectedBlockId={selectedBlockId} expandedDate={mobileExpandedDate} isDraggingBlock={isDraggingBlock} />
        </main>
        <WeekEdgeDropZone id="next-week" title="Next Week" helper="Drag here or click to view next week" weekOffset={1} isDraggingBlock={isDraggingBlock} onClick={handleNextWeek} />
      </div>

      {!isBlockingPanelOpen && (
        <>
          <div className={`mobile-life-inbox-tray ${isMobileInboxExpanded ? 'expanded' : 'collapsed'} ${isDraggingBlock ? 'dragging' : ''}`}>
            <ToSchedulePanel
              onEditBlock={handleEditBlock}
              variant="tray"
              isExpanded={isMobileInboxExpanded}
              isDraggingBlock={isDraggingBlock}
              onTrayToggle={() => updateMobileInboxExpanded(!isMobileInboxExpanded)}
              onTrayExpandedChange={updateMobileInboxExpanded}
            />
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="mobile-add-fab fixed right-4 z-sidebar h-14 w-14 rounded-full bg-accent-primary text-white text-[26px] leading-none shadow-modal border border-white/30"
            title="Add item"
          >
            +
          </button>
        </>
      )}

      <DropConfirmationToast blockId={lastScheduledBlockId} onClose={() => setLastScheduledBlockId(null)} onEditBlock={handleEditBlock} />

      <AddToPlannerModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)}
        onCreateBlock={() => {
          setIsAddModalOpen(false);
          setEditingBlockId(null);
          setIsBlockEditorOpen(true);
        }}
      />
      <BlockEditor 
        isOpen={isBlockEditorOpen} 
        onClose={() => setIsBlockEditorOpen(false)} 
        blockId={editingBlockId}
      />
      <PlannerSetupPanel isOpen={isPlannerSetupOpen} onClose={() => setIsPlannerSetupOpen(false)} />
    </div>
    </DndContext>
  );
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
};

interface DropConfirmationToastProps {
  blockId: string | null;
  onClose: () => void;
  onEditBlock: (blockId: string) => void;
}

const DropConfirmationToast: React.FC<DropConfirmationToastProps> = ({ blockId, onClose, onEditBlock }) => {
  const block = useBlock(blockId);

  useEffect(() => {
    if (!blockId) return;
    const timer = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(timer);
  }, [blockId, onClose]);

  if (!blockId || !block?.date || !block.startTime) return null;

  const start = new Date(`${block.date}T00:00:00`);
  const dayLabel = start.toLocaleDateString('en-GB', { weekday: 'short' });
  const endTime = block.endTime || calculateEndTime(block.startTime, block.durationMinutes);
  const handleUndo = async () => {
    await moveBlockToSchedule(block.id);
    onClose();
  };

  return (
    <div className="fixed left-1/2 bottom-24 z-toast w-[min(420px,calc(100vw-32px))] -translate-x-1/2 rounded-medium border border-border-default bg-surface-primary shadow-modal p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-text-primary">{block.title}</div>
          <div className="mt-0.5 text-[13px] font-semibold text-text-secondary">{dayLabel} {block.startTime}-{endTime}</div>
        </div>
        <button onClick={handleUndo} className="h-9 px-3 rounded-small border border-border-default bg-background text-[13px] font-semibold text-text-primary">Undo</button>
        <button onClick={() => onEditBlock(block.id)} className="h-9 px-3 rounded-small bg-accent-primary text-white text-[13px] font-semibold">Edit</button>
      </div>
    </div>
  );
};

interface WeekEdgeDropZoneProps {
  id: string;
  title: string;
  helper: string;
  weekOffset: -1 | 1;
  isDraggingBlock: boolean;
  onClick: () => void;
}

const WeekEdgeDropZone: React.FC<WeekEdgeDropZoneProps> = ({ id, title, helper, weekOffset, isDraggingBlock, onClick }) => {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: { edgeWeekOffset: weekOffset },
  });

  return (
    <button
      type="button"
      ref={setNodeRef}
      onClick={onClick}
      className={`week-edge-drop-zone ${isDraggingBlock ? 'w-11' : 'w-9'} flex-shrink-0 rounded-medium border transition-all flex flex-col items-center justify-center gap-3 text-center px-0.5 ${isOver ? 'bg-accent-primary/10 border-accent-primary text-accent-primary shadow-sm' : isDraggingBlock ? 'bg-accent-primary/[0.045] border-border-default/80 text-text-secondary' : 'bg-surface-primary/45 border-border-default/60 text-text-muted'}`}
      aria-label={weekOffset < 0 ? 'Go to previous week from edge' : 'Go to next week from edge'}
    >
      <div className="text-[11px] font-bold leading-tight">{weekOffset < 0 ? '‹' : '›'}<br />{title}</div>
      <div className={`${isDraggingBlock ? 'block' : 'hidden'} text-[10px] leading-snug text-text-muted`}>{helper}</div>
    </button>
  );
};
