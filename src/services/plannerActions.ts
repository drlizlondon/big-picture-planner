import { db, createId } from '../db/db';
import type { BlockSourceType, PlannerBlock, PlannerItemMetadata, PlannerTemplate } from '../types/models';
import { calculateEndTime, minutesToTime, timeToMinutes } from '../utils/planningEngine';
import { addDays, formatDate } from '../utils/dateUtils';
import { enqueueSyncChange } from './syncService';
import { isGCalBlock, getGCalEventId, patchGoogleCalendarEvent } from './googleCalendarService';

export const createBlock = async (
  blockData: Omit<PlannerBlock, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const id = createId();
  const now = Date.now();
  
  const newBlock: PlannerBlock = {
    ...blockData,
    id,
    metadata: normalizeBlockMetadata(blockData),
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
  const existing = await db.blocks.get(id);
  await db.blocks.update(id, {
    ...updates,
    metadata: updates.metadata || (existing ? normalizeBlockMetadata({ ...existing, ...updates }) : updates.metadata),
    updatedAt: now
  });
  const block = await db.blocks.get(id);
  if (block) await enqueueSyncChange('blocks', id, block.deletedAt ? 'delete' : 'upsert', block);
};

export const deleteBlock = async (id: string): Promise<void> => {
  const block = await db.blocks.get(id);
  if (!block) return;

  if (isGCalBlock(block)) {
    // Hard-delete GCal cache entries from Dexie — they are not user data and
    // are not stored in Supabase. They will reappear on the next calendar sync
    // unless the user also deletes the event in Google Calendar.
    await db.blocks.delete(id);
  } else {
    const now = Date.now();
    // Soft delete as required by specification
    await db.blocks.update(id, { deletedAt: now, updatedAt: now });
    const updated = await db.blocks.get(id);
    if (updated) await enqueueSyncChange('blocks', id, 'delete', updated);
  }
};

export const createTemplate = async (
  templateData: Omit<PlannerTemplate, 'id' | 'createdAt' | 'updatedAt' | 'isArchived'>
): Promise<string> => {
  const id = createId();
  const now = Date.now();
  
  const newTemplate: PlannerTemplate = {
    ...templateData,
    id,
    metadata: normalizeTemplateMetadata(templateData),
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
    metadata: normalizeBlockMetadata({ ...block, sourceType: 'template_instance' }),
    createdAt: now,
    updatedAt: now,
    // Default behavior is to un-schedule duplicates so they appear in Ready to schedule.
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

const normalizeBlockMetadata = (block: Pick<PlannerBlock, 'sourceType'> & Partial<PlannerBlock>): PlannerItemMetadata => {
  return {
    source: block.metadata?.source || getSourceForBlock(block.sourceType, block.importSource),
    labelIds: block.metadata?.labelIds || [],
    systemTags: block.metadata?.systemTags || getSystemTagsForBlock(block),
    viewIds: block.metadata?.viewIds || [],
  };
};

const normalizeTemplateMetadata = (template: Partial<PlannerTemplate>): PlannerItemMetadata => {
  return {
    source: template.metadata?.source || { provider: 'template', name: 'Template' },
    labelIds: template.metadata?.labelIds || [],
    systemTags: template.metadata?.systemTags || [],
    viewIds: template.metadata?.viewIds || [],
  };
};

const getSourceForBlock = (sourceType: BlockSourceType, importSource?: string): PlannerItemMetadata['source'] => {
  if (sourceType === 'calendar_import') return { provider: 'import', name: importSource || 'Calendar import' };
  if (sourceType === 'paste') return { provider: 'import', name: importSource || 'Import' };
  if (sourceType === 'template_instance') return { provider: 'template', name: 'Template' };
  return { provider: 'manual', name: 'Manual Entry' };
};

const getSystemTagsForBlock = (block: Partial<PlannerBlock>): PlannerItemMetadata['systemTags'] => {
  const tags: PlannerItemMetadata['systemTags'] = [];
  if (block.travelEnabled && ((block.travelBeforeMinutes || 0) > 0 || (block.travelAfterMinutes || 0) > 0)) tags.push('travel');
  if (block.importSource || block.sourceType === 'paste' || block.sourceType === 'calendar_import') tags.push('imported');
  if (block.reviewColour && block.reviewColour !== 'GREEN') tags.push('review');
  if (block.isBaseEvent) tags.push('base_event');
  if (block.sourceType === 'template_instance') tags.push('template_instance');
  return tags;
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
    updatedAt: Date.now(),
  });

  if (isGCalBlock(block)) {
    // Write the new time back to Google Calendar.
    // Fire-and-forget: Dexie is already updated so the UI stays snappy.
    // On next calendar sync Google's version will confirm the change.
    const eventId = getGCalEventId(block);
    if (eventId) {
      void patchGoogleCalendarEvent(eventId, date, startTime, endTime).catch(() => {
        // Silent failure — the user will see the move in the grid and Google
        // Calendar will be retried on the next periodic sync.
      });
    }
    // GCal events are not stored in Supabase — skip the sync queue.
  } else {
    const updatedBlock = await db.blocks.get(id);
    if (updatedBlock) await enqueueSyncChange('blocks', id, 'upsert', updatedBlock);
  }
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
