import { db, createId } from '../db/db';
import type { BlockSourceType, Category, PlannerBlock, PlannerItemMetadata, PlannerTemplate } from '../types/models';
import { calculateEndTime, minutesToTime, timeToMinutes } from '../utils/planningEngine';
import { addDays, formatDate } from '../utils/dateUtils';
import { enqueueSyncChange } from './syncService';
import { isGCalBlock, getGCalEventId, patchGoogleCalendarEvent } from './googleCalendarService';
import { decideWriteScope, getCalendarLinkType, markSourceChangedLocally, markSourcePushed, supportsWriteBack } from './calendarSyncCore';
import { getCalendarWriteBackPreference } from './calendarPreferences';
import { recordMovement, snapshotMovement } from './blockHistory';
import { track, trackOnce } from './analytics';

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

  // Activation/engagement: count user-authored tasks, but not synced calendar
  // cache entries (those are not "tasks the user created").
  if (blockData.sourceType !== 'calendar_import') {
    trackOnce('task_created', { type: 'first_task_created' });
    track({ type: 'task_created', scheduled: !!blockData.isScheduled });
  }
  return id;
};

export const updateBlock = async (id: string, updates: Partial<PlannerBlock>): Promise<void> => {
  const now = Date.now();
  const existing = await db.blocks.get(id);
  let metadata = updates.metadata || (existing ? normalizeBlockMetadata({ ...existing, ...updates }) : updates.metadata);

  // A local edit to an externally-linked/imported block must NOT silently push to
  // the external calendar — record it as "changed in Big Planner" instead (reqs #5, #6).
  if (metadata?.source && getCalendarLinkType(metadata.source) !== 'local_only') {
    metadata = { ...metadata, source: markSourceChangedLocally(metadata.source, now) };
  }

  await db.blocks.update(id, { ...updates, metadata, updatedAt: now });
  const block = await db.blocks.get(id);
  // External calendar blocks aren't stored in Supabase — skip the cloud sync queue.
  if (block && getCalendarLinkType(block.metadata?.source) === 'local_only') {
    await enqueueSyncChange('blocks', id, block.deletedAt ? 'delete' : 'upsert', block);
  }
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

export const createCategory = async (categoryData: Pick<Category, 'name' | 'colorHex'>): Promise<string> => {
  const id = createId();
  const category: Category = {
    id,
    name: categoryData.name.trim(),
    colorHex: categoryData.colorHex,
    isArchived: false,
    updatedAt: Date.now(),
  };
  await db.categories.add(category);
  await enqueueSyncChange('categories', id, 'upsert', category);
  return id;
};

export const updateCategory = async (id: string, updates: Partial<Pick<Category, 'name' | 'colorHex' | 'isArchived'>>): Promise<void> => {
  const normalizedUpdates = { ...updates, updatedAt: Date.now() };
  if (typeof updates.name === 'string') {
    normalizedUpdates.name = updates.name.trim();
  }
  await db.categories.update(id, normalizedUpdates);
  const category = await db.categories.get(id);
  if (category) await enqueueSyncChange('categories', id, category.isArchived ? 'delete' : 'upsert', category);
};

export const archiveCategory = async (id: string): Promise<void> => {
  await db.categories.update(id, { isArchived: true, updatedAt: Date.now() });
  const category = await db.categories.get(id);
  if (category) await enqueueSyncChange('categories', id, 'delete', category);
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
    // Default behavior is to un-schedule duplicates so they appear in Life Inbox.
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
  const now = Date.now();
  const before = snapshotMovement(block);
  const movedSnap = { ...before, date, startTime, endTime, isScheduled: true };

  if (isGCalBlock(block)) {
    // Linked external event. Decide whether this move should also touch Google
    // Calendar, honouring the user's write-back preference and never silently
    // overwriting an external change (reqs #5, #6).
    const decision = decideWriteScope(block, getCalendarWriteBackPreference());
    const source = block.metadata?.source;

    if (decision.scope === 'external' && source) {
      const eventId = getGCalEventId(block);
      if (eventId) {
        try {
          await patchGoogleCalendarEvent(eventId, date, startTime, endTime);
          await db.blocks.update(id, {
            isScheduled: true, date, startTime, endTime, updatedAt: now,
            metadata: { ...block.metadata!, source: markSourcePushed(source, now) },
          });
          recordMovement(id, before, movedSnap);
          return;
        } catch {
          // Push failed — fall through to a local-only update flagged as changed,
          // so the user can retry rather than lose the move.
        }
      }
    }

    // Local-only move (preference said so, push failed, or a choice is needed):
    // keep the change in Big Planner and mark it as not-yet-pushed.
    await db.blocks.update(id, {
      isScheduled: true, date, startTime, endTime, updatedAt: now,
      metadata: source ? { ...block.metadata!, source: markSourceChangedLocally(source, now) } : block.metadata,
    });
    recordMovement(id, before, movedSnap);
    // GCal events are not stored in Supabase — skip the sync queue.
    return;
  }

  await db.blocks.update(id, { isScheduled: true, date, startTime, endTime, updatedAt: now });
  recordMovement(id, before, movedSnap);
  const updatedBlock = await db.blocks.get(id);
  if (updatedBlock) await enqueueSyncChange('blocks', id, 'upsert', updatedBlock);
};

/**
 * Explicitly push a linked block's current local times to its external calendar
 * (the "also update Google Calendar" action). Refuses to overwrite when the
 * external copy has diverged unless `force` is passed (req #6).
 * Returns true on success.
 */
export const pushBlockToExternalCalendar = async (id: string, options: { force?: boolean } = {}): Promise<boolean> => {
  const block = await db.blocks.get(id);
  if (!block || !block.startTime || !block.date) return false;
  const source = block.metadata?.source;
  if (!supportsWriteBack(source) || !source) return false;

  const decision = decideWriteScope(block, 'always');
  if (decision.blockedByConflict && !options.force) return false;

  const eventId = getGCalEventId(block);
  if (!eventId) return false;
  const endTime = block.endTime ?? calculateEndTime(block.startTime, block.durationMinutes);

  try {
    await patchGoogleCalendarEvent(eventId, block.date, block.startTime, endTime);
    const now = Date.now();
    await db.blocks.update(id, {
      updatedAt: now,
      metadata: { ...block.metadata!, source: markSourcePushed(source, now) },
    });
    return true;
  } catch {
    return false;
  }
};

export const moveBlockByDays = async (id: string, days: number): Promise<string | undefined> => {
  const block = await db.blocks.get(id);
  if (!block?.date || !block.startTime) return undefined;

  const nextDate = addDays(new Date(`${block.date}T12:00:00`), days);
  const date = formatDate(nextDate);

  await moveBlockToWeek(id, date, block.startTime);
  return date;
};

/**
 * Move a block to a specific date while keeping its time of day (used by month
 * view, where you drag a block between days). Timed blocks keep their start time;
 * all-day / untimed blocks just change date.
 */
export const moveBlockToDate = async (id: string, date: string): Promise<void> => {
  const block = await db.blocks.get(id);
  if (!block) return;
  if (block.startTime) {
    await moveBlockToWeek(id, date, block.startTime); // records history itself
  } else {
    const before = snapshotMovement(block);
    await updateBlock(id, { date, isScheduled: true });
    recordMovement(id, before, { ...before, date, isScheduled: true });
  }
};

/** Minute span (from midnight) a block occupies after a move/resize. */
export interface BlockTimeSpan { startMin: number; endMin: number; }

export const moveBlockByMinutes = async (id: string, minutes: number): Promise<BlockTimeSpan | undefined> => {
  const block = await db.blocks.get(id);
  if (!block?.date || !block.startTime) return undefined;

  const currentStart = timeToMinutes(block.startTime);
  const nextStart = Math.max(0, Math.min(24 * 60 - block.durationMinutes, currentStart + minutes));
  await moveBlockToWeek(id, block.date, minutesToTime(nextStart));
  return { startMin: nextStart, endMin: nextStart + block.durationMinutes };
};

export const resizeBlockDuration = async (id: string, minutes: number): Promise<BlockTimeSpan | undefined> => {
  const block = await db.blocks.get(id);
  if (!block?.startTime) return undefined;

  const before = snapshotMovement(block);
  const nextDuration = Math.max(15, block.durationMinutes + minutes);
  const endTime = calculateEndTime(block.startTime, nextDuration);
  await updateBlock(id, { durationMinutes: nextDuration, endTime });
  recordMovement(id, before, { ...before, durationMinutes: nextDuration, endTime });
  const startMin = timeToMinutes(block.startTime);
  return { startMin, endMin: startMin + nextDuration };
};

export const moveBlockToSchedule = async (id: string): Promise<void> => {
  const existing = await db.blocks.get(id);
  const before = existing ? snapshotMovement(existing) : undefined;
  await db.blocks.update(id, {
    isScheduled: false,
    date: undefined,
    startTime: undefined,
    endTime: undefined,
    updatedAt: Date.now()
  });
  const updatedBlock = await db.blocks.get(id);
  if (updatedBlock) await enqueueSyncChange('blocks', id, 'upsert', updatedBlock);
  if (before) recordMovement(id, before, { ...before, isScheduled: false, date: undefined, startTime: undefined, endTime: undefined });
};
