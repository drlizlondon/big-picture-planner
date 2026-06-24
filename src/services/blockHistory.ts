/**
 * Undo/redo history for block *movements* (reschedule, move to/from the inbox,
 * change day, resize). Each entry stores the block's scheduling snapshot before
 * and after the change; undo restores "before", redo re-applies "after".
 *
 * Movement actions in plannerActions call recordMovement(); Cmd/Ctrl+Z and
 * Cmd/Ctrl+Y (or Shift+Cmd+Z) in the app shell call undo/redoMovement().
 */
import { db } from '../db/db';
import type { PlannerBlock } from '../types/models';
import { enqueueSyncChange } from './syncService';
import { getCalendarLinkType } from './calendarSyncCore';

export interface MovementSnapshot {
  date?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes: number;
  isScheduled: boolean;
  isAllDay?: boolean;
}

interface MovementEntry {
  blockId: string;
  before: MovementSnapshot;
  after: MovementSnapshot;
}

const MAX_HISTORY = 50;
const undoStack: MovementEntry[] = [];
let redoStack: MovementEntry[] = [];
let applying = false; // guards against re-recording while undo/redo writes

export const snapshotMovement = (block: PlannerBlock): MovementSnapshot => ({
  date: block.date,
  startTime: block.startTime,
  endTime: block.endTime,
  durationMinutes: block.durationMinutes,
  isScheduled: block.isScheduled,
  isAllDay: block.isAllDay,
});

const sameSnapshot = (a: MovementSnapshot, b: MovementSnapshot): boolean =>
  a.date === b.date && a.startTime === b.startTime && a.endTime === b.endTime &&
  a.durationMinutes === b.durationMinutes && a.isScheduled === b.isScheduled &&
  !!a.isAllDay === !!b.isAllDay;

/** Record a movement. No-ops while an undo/redo is being applied, or when nothing changed. */
export const recordMovement = (blockId: string, before: MovementSnapshot, after: MovementSnapshot): void => {
  if (applying || sameSnapshot(before, after)) return;
  undoStack.push({ blockId, before, after });
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = []; // a fresh action invalidates the redo branch
};

const applySnapshot = async (blockId: string, snapshot: MovementSnapshot): Promise<void> => {
  applying = true;
  try {
    const block = await db.blocks.get(blockId);
    if (!block) return;
    await db.blocks.update(blockId, { ...snapshot, updatedAt: Date.now() });
    // Local blocks sync to the cloud; external-calendar blocks are not stored
    // there and aren't auto-pushed on undo (the next calendar sync reconciles).
    const updated = await db.blocks.get(blockId);
    if (updated && getCalendarLinkType(updated.metadata?.source) === 'local_only') {
      await enqueueSyncChange('blocks', blockId, updated.deletedAt ? 'delete' : 'upsert', updated);
    }
  } finally {
    applying = false;
  }
};

export const canUndoMovement = (): boolean => undoStack.length > 0;
export const canRedoMovement = (): boolean => redoStack.length > 0;

export const undoMovement = async (): Promise<boolean> => {
  const entry = undoStack.pop();
  if (!entry) return false;
  await applySnapshot(entry.blockId, entry.before);
  redoStack.push(entry);
  return true;
};

export const redoMovement = async (): Promise<boolean> => {
  const entry = redoStack.pop();
  if (!entry) return false;
  await applySnapshot(entry.blockId, entry.after);
  undoStack.push(entry);
  return true;
};
