import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PlannerHeader } from '../PlannerHeader/component';
import { Sidebar } from '../Sidebar/component';
import { WeekGrid } from '../WeekGrid/component';
import { addDays } from '../../utils/dateUtils';
import { DndContext, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDroppable, useSensor, useSensors, type Collision, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { createBlock, deleteBlock, moveBlockByDays, moveBlockByMinutes, moveBlockToDate, moveBlockToSchedule, moveBlockToWeek, resizeBlockDuration } from '../../services/plannerActions';
import { redoMovement, undoMovement } from '../../services/blockHistory';
import { AddToPlannerModal } from '../AddToPlannerModal/component';
import { BlockEditor } from '../BlockEditor/component';
import { PlannerSetupPanel } from '../PlannerSetupPanel/component';
import { ToSchedulePanel } from '../ToSchedulePanel/component';
import { useBlock, useWeekBlocks } from '../../hooks/usePlannerData';
import { calculateEndTime, detectMinuteOverlap, minutesToTime, timeToMinutes } from '../../utils/planningEngine';
import { DEFAULT_FILTERS, FILTER_LABELS, matchesPlannerFilters, type PlannerFilterId } from '../../utils/plannerFilters';
import { formatDate, getStartOfWeek } from '../../utils/dateUtils';
import { OnboardingTour } from '../OnboardingTour/component';
import type { PlannerBlock } from '../../types/models';

const MOBILE_INBOX_PREF_KEY = 'planner.mobileInboxExpanded';
const PLANNER_TEXT_SCALE_KEY = 'planner.textScale';

export type PlannerViewMode = 'day' | 'week' | 'month';

/** Add (or subtract) whole months, clamping the day to the target month's length. */
const addMonths = (date: Date, delta: number): Date => {
  const target = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
};
const PLANNER_TEXT_SCALE_MIN = 0.9;
const PLANNER_TEXT_SCALE_MAX = 1.3;
const PLANNER_TEXT_SCALE_STEP = 0.1;
const PASTE_DAY_START_MINUTE = 7 * 60;
const PASTE_DAY_END_MINUTE = 22 * 60;
const PASTE_SNAP_MINUTES = 15;
const collisionDetection: CollisionDetection = (args) => {
  const topEdgeCollisions = getTopEdgeSlotCollisions(args);
  if (topEdgeCollisions.length > 0) return topEdgeCollisions;

  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
};

const getTopEdgeSlotCollisions: CollisionDetection = ({ collisionRect, droppableContainers, droppableRects }) => {
  const topAnchor = {
    x: collisionRect.left + collisionRect.width / 2,
    y: collisionRect.top + 1,
  };
  const collisions: Collision[] = [];

  for (const droppableContainer of droppableContainers) {
    if (!String(droppableContainer.id).startsWith('slot-')) continue;
    const rect = droppableRects.get(droppableContainer.id);
    if (!rect) continue;

    const isInsideTopSlot = topAnchor.x >= rect.left
      && topAnchor.x <= rect.right
      && topAnchor.y >= rect.top
      && topAnchor.y <= rect.bottom;

    if (isInsideTopSlot) {
      collisions.push({
        id: droppableContainer.id,
        data: { droppableContainer, value: 0 },
      });
    }
  }

  return collisions;
};

// The main application shell layout
export const AppShell: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date()); // Boots into the user's actual week
  // View mode lives here (not inside WeekGrid) so the header range + prev/next
  // arrows can move by month / week / day to match what's on screen.
  const [viewMode, setViewMode] = useState<PlannerViewMode>(() => {
    try {
      const stored = localStorage.getItem('planner.viewMode');
      return stored === 'day' || stored === 'week' || stored === 'month' ? stored : 'week';
    } catch {
      return 'week';
    }
  });
  const updateViewMode = (mode: PlannerViewMode) => {
    setViewMode(mode);
    try { localStorage.setItem('planner.viewMode', mode); } catch { /* ignore */ }
  };
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalView, setAddModalView] = useState<'menu' | 'paste'>('menu');

  // The empty-week prompt asks us to open the Add modal straight on the
  // import view ("Import your to-do list").
  useEffect(() => {
    const onOpenImport = () => {
      setAddModalView('paste');
      setIsAddModalOpen(true);
    };
    window.addEventListener('planner:open-import', onOpenImport);
    return () => window.removeEventListener('planner:open-import', onOpenImport);
  }, []);
  const [isBlockEditorOpen, setIsBlockEditorOpen] = useState(false);
  const [isPlannerSetupOpen, setIsPlannerSetupOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('planner.sidebarCollapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(() => {
    try {
      return localStorage.getItem('planner.sidePanelCollapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isDraggingBlock, setIsDraggingBlock] = useState(false);
  const [mobileExpandedDate, setMobileExpandedDate] = useState<string | null>(null);
  const [lastScheduledBlockId, setLastScheduledBlockId] = useState<string | null>(null);
  const [isMobileInboxExpanded, setIsMobileInboxExpanded] = useState(() => {
    try {
      // Default to a slim collapsed handle so the calendar stays the priority;
      // the inbox is one tap away and that choice is remembered once changed.
      const stored = localStorage.getItem(MOBILE_INBOX_PREF_KEY);
      return stored === null ? false : stored === 'true';
    } catch {
      return false;
    }
  });
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<PlannerFilterId[]>(DEFAULT_FILTERS);
  const [plannerTextScale, setPlannerTextScale] = useState(() => {
    try {
      const storedRawValue = localStorage.getItem(PLANNER_TEXT_SCALE_KEY);
      if (storedRawValue === null) return 1;
      const storedValue = Number(storedRawValue);
      return clampTextScale(Number.isFinite(storedValue) ? storedValue : 1);
    } catch {
      return 1;
    }
  });
  const selectedBlock = useBlock(selectedBlockId);
  const visibleWeekStart = formatDate(getStartOfWeek(currentDate));
  const visibleWeekEnd = formatDate(addDays(getStartOfWeek(currentDate), 6));
  const visibleWeekBlocksRaw = useWeekBlocks(visibleWeekStart, visibleWeekEnd);
  const visibleWeekBlocks = useMemo(() => visibleWeekBlocksRaw || [], [visibleWeekBlocksRaw]);
  const plannerClipboardRef = useRef<PlannerClipboardBlock | null>(null);
  const lastClickedSlotRef = useRef<PlannerSlotPosition | null>(null);
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
      activationConstraint: { delay: 420, tolerance: 10 },
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

  const handleSlotClick = (position: PlannerSlotPosition) => {
    lastClickedSlotRef.current = position;
  };

  // Prev/next step by the active view: a month, a week, or a day at a time.
  const stepDate = (date: Date, direction: number): Date => {
    if (viewMode === 'month') return addMonths(date, direction);
    if (viewMode === 'day') return addDays(date, direction);
    return addDays(date, direction * 7);
  };
  const handlePrevWeek = () => setCurrentDate(prev => stepDate(prev, -1));
  const handleNextWeek = () => setCurrentDate(prev => stepDate(prev, 1));
  const handleToday = () => setCurrentDate(new Date());
  // Double-clicking a day in month view opens that day in day view.
  const handleOpenDay = (date: string) => {
    setCurrentDate(new Date(`${date}T12:00:00`));
    updateViewMode('day');
  };
  const handleFilterToggle = (filter: PlannerFilterId) => {
    setActiveFilters(prev => {
      if (filter === 'all') return ['all'];
      const withoutAll = prev.filter(item => item !== 'all');
      const next = withoutAll.includes(filter)
        ? withoutAll.filter(item => item !== filter)
        : [...withoutAll, filter];
      return next.length === 0 ? ['all'] : next;
    });
  };

  const updateSidebarCollapsed = (isCollapsed: boolean) => {
    setIsSidebarCollapsed(isCollapsed);
    try {
      localStorage.setItem('planner.sidebarCollapsed', String(isCollapsed));
    } catch {
      // Keep the in-memory preference if storage is unavailable.
    }
  };

  const updateSidePanelCollapsed = (isCollapsed: boolean) => {
    setIsSidePanelCollapsed(isCollapsed);
    try {
      localStorage.setItem('planner.sidePanelCollapsed', String(isCollapsed));
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

  const updatePlannerTextScale = (nextScale: number) => {
    const clampedScale = clampTextScale(nextScale);
    setPlannerTextScale(clampedScale);
    try {
      localStorage.setItem(PLANNER_TEXT_SCALE_KEY, String(clampedScale));
    } catch {
      // Keep the in-memory preference if storage is unavailable.
    }
  };

  const decreasePlannerText = () => updatePlannerTextScale(plannerTextScale - PLANNER_TEXT_SCALE_STEP);
  const increasePlannerText = () => updatePlannerTextScale(plannerTextScale + PLANNER_TEXT_SCALE_STEP);
  const isBlockingPanelOpen = isAddModalOpen || isBlockEditorOpen || isPlannerSetupOpen;

  useEffect(() => {
    // Flip the visible week to follow a block that moved out of it
    // (e.g. arrowing from Sunday into next Monday).
    const ensureWeekVisible = (dateStr: string) => {
      const weekStart = formatDate(getStartOfWeek(currentDate));
      const weekEnd = formatDate(addDays(getStartOfWeek(currentDate), 6));
      if (dateStr < weekStart || dateStr > weekEnd) {
        setCurrentDate(new Date(`${dateStr}T12:00:00`));
      }
    };

    // Ask the week grid to widen its visible hour range so a block that moved
    // above/below the current window comes back into view.
    const ensureTimeVisible = (span?: { startMin: number; endMin: number }) => {
      if (!span) return;
      window.dispatchEvent(new CustomEvent('planner:ensure-time-visible', {
        detail: { startHour: Math.floor(span.startMin / 60), endHour: Math.ceil(span.endMin / 60) },
      }));
    };

    // After a move, scroll the selected block into view so a time change that
    // pushes it past the visible area brings the calendar to it.
    const revealSelectedBlock = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document
            .querySelector('.scheduled-block-selected')
            ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        });
      });
    };

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (isBlockingPanelOpen) return;
      if (isTypingTarget(event.target)) return;

      const isCopyKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c';
      const isPasteKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v';
      const isUndoKey = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
      const isRedoKey = (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'));
      const isMoveKey = event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      const isDurationKey = event.key === '+' || event.key === '=' || event.key === '-' || event.key === '_';
      const isDeleteKey = event.key === 'Backspace' || event.key === 'Delete';
      const blockForShortcut = selectedBlock || visibleWeekBlocks.find(block => block.id === selectedBlockId);

      if (isCopyKey) {
        if (!blockForShortcut?.date || !blockForShortcut.startTime) return;
        event.preventDefault();
        plannerClipboardRef.current = copyBlockToPlannerClipboard(blockForShortcut);
        return;
      }

      if (isPasteKey) {
        const copiedBlock = plannerClipboardRef.current;
        if (!copiedBlock) return;
        event.preventDefault();
        keyboardQueueRef.current = keyboardQueueRef.current.catch(() => undefined).then(async () => {
          const placement = findPastePlacement({
            copiedBlock,
            blocks: visibleWeekBlocks,
            currentDate,
            preferredSlot: lastClickedSlotRef.current,
          });
          const blockId = await createBlock({
            ...copiedBlock,
            ...placement,
            isScheduled: true,
          });
          setSelectedBlockId(blockId);
          setLastScheduledBlockId(blockId);
          if (placement.date < visibleWeekStart || placement.date > visibleWeekEnd) {
            setCurrentDate(new Date(`${placement.date}T12:00:00`));
          }
          revealSelectedBlock();
        });
        return;
      }

      if (isUndoKey || isRedoKey) {
        event.preventDefault();
        keyboardQueueRef.current = keyboardQueueRef.current.catch(() => undefined).then(async () => {
          if (isRedoKey) await redoMovement();
          else await undoMovement();
        });
        return;
      }

      if (!blockForShortcut || (!isMoveKey && !isDurationKey && !isDeleteKey)) return;

      event.preventDefault();
      const key = event.key;
      const blockId = blockForShortcut.id;

      keyboardQueueRef.current = keyboardQueueRef.current.catch(() => undefined).then(async () => {
        if (isDeleteKey) {
          await deleteBlock(blockId);
          setSelectedBlockId(null);
          return;
        }

        if (!blockForShortcut.date || !blockForShortcut.startTime) return;

        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          const newDate = await moveBlockByDays(blockId, key === 'ArrowLeft' ? -1 : 1);
          if (newDate) ensureWeekVisible(newDate);
          revealSelectedBlock();
          return;
        }

        if (key === 'ArrowUp' || key === 'ArrowDown') {
          const span = await moveBlockByMinutes(blockId, key === 'ArrowUp' ? -15 : 15);
          ensureTimeVisible(span);
          revealSelectedBlock();
          return;
        }

        try {
          const span = await resizeBlockDuration(blockId, key === '-' || key === '_' ? -15 : 15);
          ensureTimeVisible(span);
          revealSelectedBlock();
        } catch {
          // Keep the current duration if the new end time would leave the day.
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isBlockingPanelOpen, selectedBlock, selectedBlockId, currentDate, visibleWeekBlocks, visibleWeekStart, visibleWeekEnd]);

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
    const activeBlock = active.data.current as { isAllDay?: boolean } | undefined;
    const dropData = over.data.current as { date?: string, startTime?: string, edgeWeekOffset?: number, toLifeInbox?: boolean, monthDrop?: boolean, allDayDrop?: boolean };

    if (activeBlock?.isAllDay && dropData?.date && !dropData.toLifeInbox) {
      // An all-day event always stays all-day — only its day changes, even if
      // dropped onto a time slot.
      await moveBlockToDate(blockId, dropData.date);
      setSelectedBlockId(blockId);
    } else if ((dropData?.monthDrop || dropData?.allDayDrop) && dropData.date) {
      // Month grid or the all-day lane: change the day, keep the time of day.
      await moveBlockToDate(blockId, dropData.date);
      setSelectedBlockId(blockId);
    } else if (dropData && dropData.date && dropData.startTime) {
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
    <div
      className="app-shell-root relative flex flex-col overflow-hidden bg-white text-text-primary font-sans"
      style={{ '--planner-text-scale': plannerTextScale } as React.CSSProperties}
    >
      <PlannerHeader
        currentDate={currentDate}
        viewMode={viewMode}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onToday={handleToday}
        onOpenSetup={() => setIsPlannerSetupOpen(true)}
        textScale={plannerTextScale}
        canDecreaseText={plannerTextScale > PLANNER_TEXT_SCALE_MIN}
        canIncreaseText={plannerTextScale < PLANNER_TEXT_SCALE_MAX}
        onDecreaseText={decreasePlannerText}
        onIncreaseText={increasePlannerText}
      />
      
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
          <WeekGrid
            currentDate={currentDate}
            viewMode={viewMode}
            onViewModeChange={updateViewMode}
            onOpenDay={handleOpenDay}
            onEditBlock={handleEditBlock}
            onSelectBlock={handleSelectBlock}
            selectedBlockId={selectedBlockId}
            expandedDate={mobileExpandedDate}
            isDraggingBlock={isDraggingBlock}
            activeFilters={activeFilters}
            onSlotClick={handleSlotClick}
            onToggleExpandDay={(date) => setMobileExpandedDate(prev => (prev === date ? null : date))}
          />
        </main>
        <WeekEdgeDropZone id="next-week" title="Next Week" helper="Drag here or click to view next week" weekOffset={1} isDraggingBlock={isDraggingBlock} onClick={handleNextWeek} />
        {isSidePanelCollapsed ? (
          <button
            onClick={() => updateSidePanelCollapsed(false)}
            className="hidden lg:block w-11 flex-shrink-0 rounded-medium border border-border-default bg-surface-primary shadow-sm text-accent-primary font-bold hover:bg-background transition-colors"
            title="Show month & filters"
          >
            «
          </button>
        ) : (
          <PlannerSidePanel
            currentDate={currentDate}
            activeFilters={activeFilters}
            onSelectDate={setCurrentDate}
            onFilterToggle={handleFilterToggle}
            onCollapse={() => updateSidePanelCollapsed(true)}
          />
        )}
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

          <MobileSelectedBlockControls
            blockId={selectedBlockId}
            onEditBlock={handleEditBlock}
            onClose={() => setSelectedBlockId(null)}
          />

          <button
            onClick={() => setIsAddModalOpen(true)}
            data-tour="add-button"
            className="mobile-add-fab fixed right-4 z-sidebar rounded-full bg-accent-primary text-white font-bold shadow-modal border border-white/30"
            title="Add task"
            aria-label="Add task"
          >
            <span className="mobile-add-fab-plus" aria-hidden="true">+</span>
            <span className="mobile-add-fab-label">Add Task</span>
          </button>
        </>
      )}

      <DropConfirmationToast blockId={lastScheduledBlockId} onClose={() => setLastScheduledBlockId(null)} onEditBlock={handleEditBlock} />

      <AddToPlannerModal
        isOpen={isAddModalOpen}
        initialView={addModalView}
        onClose={() => {
          setIsAddModalOpen(false);
          setAddModalView('menu');
        }}
        onCreateBlock={() => {
          setIsAddModalOpen(false);
          setAddModalView('menu');
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
      <OnboardingTour
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onCloseAddModal={() => setIsAddModalOpen(false)}
      />
    </div>
    </DndContext>
  );
};

const clampTextScale = (scale: number) => (
  Math.min(PLANNER_TEXT_SCALE_MAX, Math.max(PLANNER_TEXT_SCALE_MIN, Number(scale.toFixed(2))))
);

type PlannerSlotPosition = Pick<PlannerBlock, 'date' | 'startTime'> & { date: string; startTime: string };
type PlannerClipboardBlock = Omit<PlannerBlock, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'date' | 'startTime' | 'endTime' | 'isScheduled'>;

interface PastePlacementOptions {
  copiedBlock: PlannerClipboardBlock;
  blocks: PlannerBlock[];
  currentDate: Date;
  preferredSlot: PlannerSlotPosition | null;
}

const copyBlockToPlannerClipboard = (block: PlannerBlock): PlannerClipboardBlock => ({
  title: block.title,
  description: block.description,
  durationMinutes: block.durationMinutes,
  isBaseEvent: block.isBaseEvent,
  isHidden: false,
  sourceType: block.sourceType === 'calendar_import' ? 'manual' : block.sourceType,
  metadata: cloneValue(block.metadata),
  categoryId: block.categoryId,
  templateId: block.templateId,
  travelEnabled: block.travelEnabled,
  travelBeforeMinutes: block.travelBeforeMinutes,
  travelAfterMinutes: block.travelAfterMinutes,
  additionalTimezone: block.additionalTimezone,
  features: resetCopiedFeatureCompletion(block.features),
  reviewColour: block.reviewColour,
  importSource: block.importSource,
  importRawLine: block.importRawLine,
});

const resetCopiedFeatureCompletion = (features: PlannerBlock['features']) => (
  Object.fromEntries(Object.entries(cloneValue(features)).map(([id, feature]) => [
    id,
    { ...feature, isComplete: false },
  ]))
);

const findPastePlacement = ({ copiedBlock, blocks, currentDate, preferredSlot }: PastePlacementOptions): PlannerSlotPosition => {
  const weekStart = getStartOfWeek(currentDate);
  const weekDates = Array.from({ length: 7 }).map((_, index) => formatDate(addDays(weekStart, index)));
  const visibleBlocks = blocks.filter(block => block.date && block.startTime && !block.deletedAt);

  if (preferredSlot) {
    const preferredStart = timeToMinutes(preferredSlot.startTime);
    const sameDaySlot = findFreeSlotOnDate(preferredSlot.date, preferredStart, copiedBlock.durationMinutes, visibleBlocks);
    if (sameDaySlot) return sameDaySlot;
  }

  const now = new Date();
  const today = formatDate(now);
  const todayStart = snapMinute(now.getHours() * 60 + now.getMinutes());
  const orderedDates = getPasteDateOrder(weekDates, preferredSlot?.date, today);

  for (const date of orderedDates) {
    const startMinute = date === today ? Math.max(PASTE_DAY_START_MINUTE, todayStart) : PASTE_DAY_START_MINUTE;
    const slot = findFreeSlotOnDate(date, startMinute, copiedBlock.durationMinutes, visibleBlocks);
    if (slot) return slot;
  }

  const fallbackDate = preferredSlot?.date || (weekDates.includes(today) ? today : weekDates[0]);
  return {
    date: fallbackDate,
    startTime: minutesToTime(PASTE_DAY_START_MINUTE),
  };
};

const getPasteDateOrder = (weekDates: string[], preferredDate: string | undefined, today: string) => {
  const dates = [...weekDates];
  const firstChoice = preferredDate && dates.includes(preferredDate)
    ? preferredDate
    : dates.includes(today)
      ? today
      : dates[0];
  return [firstChoice, ...dates.filter(date => date !== firstChoice)];
};

const findFreeSlotOnDate = (date: string, startMinute: number, durationMinutes: number, blocks: PlannerBlock[]): PlannerSlotPosition | null => {
  const latestStart = Math.max(PASTE_DAY_START_MINUTE, PASTE_DAY_END_MINUTE - durationMinutes);
  const firstStart = Math.min(latestStart, Math.max(PASTE_DAY_START_MINUTE, snapMinute(startMinute)));

  for (let minute = firstStart; minute <= latestStart; minute += PASTE_SNAP_MINUTES) {
    if (!hasPasteOverlap(date, minute, durationMinutes, blocks)) {
      return { date, startTime: minutesToTime(minute) };
    }
  }

  return null;
};

const hasPasteOverlap = (date: string, startMinute: number, durationMinutes: number, blocks: PlannerBlock[]) => (
  blocks.some(block => {
    if (block.date !== date || !block.startTime) return false;
    const otherStart = timeToMinutes(block.startTime);
    return detectMinuteOverlap(startMinute, startMinute + durationMinutes, otherStart, otherStart + block.durationMinutes);
  })
);

const snapMinute = (minute: number) => {
  const snapped = Math.ceil(minute / PASTE_SNAP_MINUTES) * PASTE_SNAP_MINUTES;
  return Math.min(PASTE_DAY_END_MINUTE - PASTE_SNAP_MINUTES, Math.max(PASTE_DAY_START_MINUTE, snapped));
};

const cloneValue = <T,>(value: T): T => {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
};

interface MobileSelectedBlockControlsProps {
  blockId: string | null;
  onEditBlock: (blockId: string) => void;
  onClose: () => void;
}

const MobileSelectedBlockControls: React.FC<MobileSelectedBlockControlsProps> = ({ blockId, onEditBlock, onClose }) => {
  const block = useBlock(blockId);

  if (!blockId || !block?.date || !block.startTime) return null;

  const handleMoveToInbox = async () => {
    await moveBlockToSchedule(block.id);
    onClose();
  };

  return (
    <div className="mobile-selected-sheet">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold text-text-primary">{block.title}</div>
        <div className="text-[11px] font-semibold text-text-secondary">{block.startTime} · {block.durationMinutes}m</div>
      </div>
      <button type="button" onClick={() => onEditBlock(block.id)} className="h-8 rounded-small border border-border-default bg-background px-3 text-[12px] font-bold text-text-primary">Edit</button>
      <button type="button" onClick={handleMoveToInbox} className="h-8 rounded-small border border-border-default bg-background px-3 text-[12px] font-bold text-text-primary">Inbox</button>
      <button type="button" onClick={onClose} className="h-8 w-8 rounded-small border border-border-default bg-background text-[14px] font-bold text-text-secondary" aria-label="Close selected block controls">×</button>
    </div>
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

interface PlannerSidePanelProps {
  currentDate: Date;
  activeFilters: PlannerFilterId[];
  onSelectDate: (date: Date) => void;
  onFilterToggle: (filter: PlannerFilterId) => void;
  onCollapse: () => void;
}

const PlannerSidePanel: React.FC<PlannerSidePanelProps> = ({ currentDate, activeFilters, onSelectDate, onFilterToggle, onCollapse }) => {
  const [displayMonth, setDisplayMonth] = useState(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));

  /* eslint-disable react-hooks/set-state-in-effect -- Keep the side-panel month aligned when the active planner week changes. */
  useEffect(() => {
    setDisplayMonth(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  }, [currentDate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const monthDays = getMonthPanelDays(displayMonth);
  const selectedDate = formatDate(currentDate);
  const weekStartDate = getStartOfWeek(currentDate);
  const weekStart = formatDate(weekStartDate);
  const weekEnd = formatDate(addDays(weekStartDate, 6));
  const monthBlocks = useWeekBlocks(monthDays[0].value, monthDays[monthDays.length - 1].value) || [];
  const activeBlockCount = monthBlocks.filter(block => matchesPlannerFilters(block, activeFilters)).length;

  return (
    <aside className="planner-side-panel hidden lg:flex w-[220px] flex-shrink-0 flex-col gap-3 overflow-y-auto">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onCollapse}
          className="h-8 w-8 rounded-medium border border-accent-primary/30 bg-surface-primary text-accent-primary shadow-sm hover:bg-accent-primary/5 transition-colors"
          title="Collapse month & filters"
        >
          »
        </button>
      </div>
      <section className="rounded-medium border border-border-default bg-surface-primary p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setDisplayMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            className="h-8 w-8 rounded-small border border-border-default bg-background text-[13px] font-bold text-text-secondary hover:text-text-primary"
            aria-label="Previous month"
          >
            ‹
          </button>
          <div className="text-center text-[13px] font-bold text-text-primary">
            {displayMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </div>
          <button
            type="button"
            onClick={() => setDisplayMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            className="h-8 w-8 rounded-small border border-border-default bg-background text-[13px] font-bold text-text-secondary hover:text-text-primary"
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
            <div key={`${day}-${index}`} className="text-[10px] font-bold text-text-muted">{day}</div>
          ))}
          {monthDays.map(day => {
            const isSelected = day.value === selectedDate;
            const isInWeek = day.value >= weekStart && day.value <= weekEnd;
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => onSelectDate(new Date(`${day.value}T12:00:00`))}
                className={`h-7 rounded-[8px] text-[11px] font-semibold transition-colors ${isSelected ? 'bg-accent-primary text-white' : isInWeek ? 'bg-accent-primary/10 text-accent-primary' : day.inMonth ? 'text-text-primary hover:bg-background' : 'text-text-muted/55 hover:bg-background/70'}`}
                title={`Go to ${day.value}`}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-medium border border-border-default bg-surface-primary p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold text-text-primary">Filters</h2>
          <span className="text-[11px] font-semibold text-text-muted">{activeBlockCount}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {(Object.keys(FILTER_LABELS) as PlannerFilterId[]).map(filter => (
            <button
              key={filter}
              type="button"
              onClick={() => onFilterToggle(filter)}
              className={`flex h-8 items-center justify-between rounded-small border px-2 text-left text-[12px] font-semibold transition-colors ${activeFilters.includes(filter) ? 'border-accent-primary/45 bg-accent-primary/[0.07] text-accent-primary' : 'border-border-default bg-background text-text-secondary hover:text-text-primary'}`}
            >
              <span>{FILTER_LABELS[filter]}</span>
              <span className={`h-2 w-2 rounded-full ${activeFilters.includes(filter) ? 'bg-accent-primary' : 'bg-border-strong'}`} />
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
};

const getMonthPanelDays = (date: Date) => {
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
