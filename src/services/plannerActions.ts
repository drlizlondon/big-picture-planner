import { db, createId } from '../db/db';
import type { PlannerBlock, PlannerTemplate } from '../types/models';
import { calculateEndTime, minutesToTime, timeToMinutes } from '../utils/planningEngine';
import { addDays, formatDate } from '../utils/dateUtils';
import { enqueueSyncChange } from './syncService';

export const createBlock = async (
  blockData: Omit<PlannerBlock, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const id = createId();
  const now = Date.now();
  
  const newBlock: PlannerBlock = {
    ...blockData,
    id,
    createdAt: now,
    updatedAt: now,
    endTime: blockData.startTime && blockData.durationMinutes 
      ? calculateEndTime(blockData.startTime, blockData.durationMinutes)
      : undefined
  };

  await db.blocks.add(newBlock);
  await enqueueSyncChange('blocks', id, 'upsert', newBlock);
  return id;
};

export const updateBlock = async (id: string, updates: Partial<PlannerBlock>): Promise<void> => {
  const now = Date.now();
  await db.blocks.update(id, {
    ...updates,
    updatedAt: now
  });
  const block = await db.blocks.get(id);
  if (block) await enqueueSyncChange('blocks', id, block.deletedAt ? 'delete' : 'upsert', block);
};

export const deleteBlock = async (id: string): Promise<void> => {
  const now = Date.now();
  // Soft delete as required by specification
  await db.blocks.update(id, {
    deletedAt: now,
    updatedAt: now
  });
  const block = await db.blocks.get(id);
  if (block) await enqueueSyncChange('blocks', id, 'delete', block);
};

export const createTemplate = async (
  templateData: Omit<PlannerTemplate, 'id' | 'createdAt' | 'updatedAt' | 'isArchived'>
): Promise<string> => {
  const id = createId();
  const now = Date.now();
  
  const newTemplate: PlannerTemplate = {
    ...templateData,
    id,
    createdAt: now,
    updatedAt: now,
    isArchived: false
  };

  await db.templates.add(newTemplate);
  await enqueueSyncChange('templates', id, 'upsert', newTemplate);
  return id;
};

export const archiveTemplate = async (id: string): Promise<void> => {
  const now = Date.now();
  await db.templates.update(id, {
    isArchived: true,
    updatedAt: now,
  });
  const template = await db.templates.get(id);
  if (template) await enqueueSyncChange('templates', id, 'delete', template);
};

export const duplicateBlock = async (id: string, inPlace: boolean = false): Promise<string | null> => {
  const block = await db.blocks.get(id);
  if (!block) return null;

  const newId = createId();
  const now = Date.now();
  
  const duplicatedBlock: PlannerBlock = {
    ...block,
    id: newId,
    createdAt: now,
    updatedAt: now,
    // Default behavior is to un-schedule duplicates so they appear in the Life Inbox.
    ...(inPlace ? {} : {
      isScheduled: false,
      date: undefined,
      startTime: undefined,
      endTime: undefined
    })
  };

  await db.blocks.add(duplicatedBlock);
  await enqueueSyncChange('blocks', newId, 'upsert', duplicatedBlock);
  return newId;
};

export const moveBlockToWeek = async (id: string, date: string, startTime: string): Promise<void> => {
  const block = await db.blocks.get(id);
  if (!block) return;

  const endTime = calculateEndTime(startTime, block.durationMinutes);

  const updates: Partial<PlannerBlock> = {
    isScheduled: true,
    date,
    startTime,
    endTime,
    updatedAt: Date.now()
  };

  await db.blocks.update(id, updates);
  const updatedBlock = await db.blocks.get(id);
  if (updatedBlock) await enqueueSyncChange('blocks', id, 'upsert', updatedBlock);
};

export const moveBlockByDays = async (id: string, days: number): Promise<void> => {
  const block = await db.blocks.get(id);
  if (!block?.date || !block.startTime) return;

  const nextDate = addDays(new Date(`${block.date}T12:00:00`), days);
  const date = formatDate(nextDate);

  await moveBlockToWeek(id, date, block.startTime);
};

export const moveBlockByMinutes = async (id: string, minutes: number): Promise<void> => {
  const block = await db.blocks.get(id);
  if (!block?.date || !block.startTime) return;

  const currentStart = timeToMinutes(block.startTime);
  const nextStart = Math.max(0, Math.min(24 * 60 - block.durationMinutes, currentStart + minutes));
  await moveBlockToWeek(id, block.date, minutesToTime(nextStart));
};

export const resizeBlockDuration = async (id: string, minutes: number): Promise<void> => {
  const block = await db.blocks.get(id);
  if (!block?.startTime) return;

  const nextDuration = Math.max(15, block.durationMinutes + minutes);
  await updateBlock(id, {
    durationMinutes: nextDuration,
    endTime: calculateEndTime(block.startTime, nextDuration),
  });
};

export const moveBlockToSchedule = async (id: string): Promise<void> => {
  await db.blocks.update(id, {
    isScheduled: false,
    date: undefined,
    startTime: undefined,
    endTime: undefined,
    updatedAt: Date.now()
  });
  const updatedBlock = await db.blocks.get(id);
  if (updatedBlock) await enqueueSyncChange('blocks', id, 'upsert', updatedBlock);
};
