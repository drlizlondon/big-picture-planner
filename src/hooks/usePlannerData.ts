import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { PlannerBlock, Category, FeatureDefinition, PlannerTemplate } from '../types/models';

/**
 * Data Access Layer for the Planner.
 * These hooks encapsulate Dexie queries while preserving reactivity.
 */

export const useBlock = (id: string | null): PlannerBlock | undefined => {
  return useLiveQuery(() => id ? db.blocks.get(id) : undefined, [id]);
};

export const useToScheduleBlocks = (): PlannerBlock[] | undefined => {
  return useLiveQuery(() => 
    db.blocks
      .filter((block: PlannerBlock) => block.isScheduled === false && !block.deletedAt)
      .toArray()
  );
};

export const useWeekBlocks = (startDate: string, endDate: string): PlannerBlock[] | undefined => {
  return useLiveQuery(() => 
    db.blocks
      .where('date').between(startDate, endDate, true, true)
      .filter((block: PlannerBlock) => block.isScheduled === true && !block.deletedAt)
      .toArray()
  , [startDate, endDate]); // Dependencies trigger re-query
};

export const useCategories = (): Category[] | undefined => {
  return useLiveQuery(() => 
    db.categories
      .filter((category: Category) => !category.isArchived)
      .toArray()
  );
};

export const useFeatures = (): FeatureDefinition[] | undefined => {
  return useLiveQuery(() => 
    db.features
      .filter((feature: FeatureDefinition) => !feature.isArchived)
      .toArray()
  );
};

export const useTemplates = (): PlannerTemplate[] | undefined => {
  return useLiveQuery(() => 
    db.templates
      .filter((template: PlannerTemplate) => !template.isArchived)
      .toArray()
  );
};
