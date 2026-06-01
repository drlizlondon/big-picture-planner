import Dexie, { type Table } from 'dexie';
import type { PlannerBlock, Category, FeatureDefinition, PlannerLabel, PlannerTemplate, PlannerViewDefinition, SyncMeta, SyncQueueItem } from '../types/models';

export class PlannerDatabase extends Dexie {
  blocks!: Table<PlannerBlock, string>;
  categories!: Table<Category, string>;
  features!: Table<FeatureDefinition, string>;
  templates!: Table<PlannerTemplate, string>;
  labels!: Table<PlannerLabel, string>;
  views!: Table<PlannerViewDefinition, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super('PlannerDB');
    
    // Define tables and indexes. 
    // Only properties that are queried upon need to be indexed in Dexie.
    this.version(4).stores({
      blocks: 'id, isScheduled, date, isBaseEvent, deletedAt',
      categories: 'id, isArchived',
      features: 'id, isArchived',
      templates: 'id, isArchived',
      syncQueue: 'id, entityType, entityId, updatedAt, nextAttemptAt',
      syncMeta: 'key'
    });

    this.version(5).stores({
      blocks: 'id, isScheduled, date, isBaseEvent, deletedAt',
      categories: 'id, isArchived',
      features: 'id, isArchived',
      templates: 'id, isArchived',
      syncQueue: 'id, [entityType+entityId], entityType, entityId, updatedAt, nextAttemptAt',
      syncMeta: 'key'
    });

    this.version(6).stores({
      blocks: 'id, isScheduled, date, isBaseEvent, deletedAt, metadata.source.provider, *metadata.labelIds, *metadata.systemTags, *metadata.viewIds',
      categories: 'id, isArchived',
      features: 'id, isArchived',
      templates: 'id, isArchived, metadata.source.provider, *metadata.labelIds, *metadata.systemTags, *metadata.viewIds',
      labels: 'id, name, isArchived',
      views: 'id, name, isArchived',
      syncQueue: 'id, [entityType+entityId], entityType, entityId, updatedAt, nextAttemptAt',
      syncMeta: 'key'
    });
  }
}

export const db = new PlannerDatabase();

// Helper for generating local-first unique IDs
export const createId = () => crypto.randomUUID();
