import { db, createId } from '../db/db';
import type { PlannerBlock, PlannerTemplate } from '../types/models';
import { calculateEndTime } from '../utils/planningEngine';

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
  return id;
};

export const updateBlock = async (id: string, updates: Partial<PlannerBlock>): Promise<void> => {
  const now = Date.now();
  await db.blocks.update(id, {
    ...updates,
    updatedAt: now
  });
};

export const deleteBlock = async (id: string): Promise<void> => {
  // Soft delete as required by specification
  await db.blocks.update(id, {
    deletedAt: Date.now(),
    updatedAt: Date.now()
  });
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
  return id;
};

export const duplicateBlock = async (id: string, inPlace: boolean = false): Promise<string | null> => {
  const block = await db.blocks.get(id);
  if (!block) return null;

  const newId = createId();
  const now = Date.now();
  
  const { id: _oldId, ...blockData } = block;

  const duplicatedBlock: PlannerBlock = {
    ...blockData,
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
  return newId;
};

export const moveBlockToWeek = async (id: string, date: string, startTime: string): Promise<void> => {
  const block = await db.blocks.get(id);
  if (!block) return;

  const endTime = calculateEndTime(startTime, block.durationMinutes);

  await db.blocks.update(id, {
    isScheduled: true,
    date,
    startTime,
    endTime,
    updatedAt: Date.now()
  });
};

export const moveBlockByDays = async (id: string, days: number): Promise<void> => {
  const block = await db.blocks.get(id);
  if (!block?.date || !block.startTime) return;

  const nextDate = new Date(`${block.date}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + days);
  const date = nextDate.toISOString().slice(0, 10);

  await moveBlockToWeek(id, date, block.startTime);
};

export const moveBlockToSchedule = async (id: string): Promise<void> => {
  await db.blocks.update(id, {
    isScheduled: false,
    date: undefined,
    startTime: undefined,
    endTime: undefined,
    updatedAt: Date.now()
  });
};
