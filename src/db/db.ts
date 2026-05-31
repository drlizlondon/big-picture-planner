import Dexie, { type Table } from 'dexie';
import type { PlannerBlock, Category, FeatureDefinition, PlannerTemplate } from '../types/models';

export class PlannerDatabase extends Dexie {
  blocks!: Table<PlannerBlock, string>;
  categories!: Table<Category, string>;
  features!: Table<FeatureDefinition, string>;
  templates!: Table<PlannerTemplate, string>;

  constructor() {
    super('PlannerDB');
    
    // Define tables and indexes. 
    // Only properties that are queried upon need to be indexed in Dexie.
    this.version(3).stores({
      blocks: 'id, isScheduled, date, isBaseEvent, deletedAt',
      categories: 'id, isArchived',
      features: 'id, isArchived',
      templates: 'id, isArchived'
    });
  }
}

export const db = new PlannerDatabase();

// Helper for generating local-first unique IDs
export const createId = () => crypto.randomUUID();