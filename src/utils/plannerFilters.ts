import type { PlannerBlock, PlannerSourceProvider } from '../types/models';

export type PlannerFilterId = 'all' | 'imported' | 'planner' | 'manual' | 'travel';

export const FILTER_LABELS: Record<PlannerFilterId, string> = {
  all: 'All items',
  imported: 'Imported',
  planner: 'Planner-created',
  manual: 'Manual',
  travel: 'Travel',
};

export const DEFAULT_FILTERS: PlannerFilterId[] = ['all'];

export const matchesPlannerFilters = (block: PlannerBlock, activeFilters: PlannerFilterId[]): boolean => {
  if (activeFilters.length === 0 || activeFilters.includes('all')) return true;
  return activeFilters.some(filter => matchesPlannerFilter(block, filter));
};

const matchesPlannerFilter = (block: PlannerBlock, filter: PlannerFilterId): boolean => {
  if (filter === 'travel') {
    return Boolean(block.travelEnabled && ((block.travelBeforeMinutes || 0) > 0 || (block.travelAfterMinutes || 0) > 0));
  }

  const provider = block.metadata?.source?.provider;
  if (filter === 'imported') {
    return isImportedProvider(provider) || block.sourceType === 'calendar_import' || block.sourceType === 'paste' || Boolean(block.importSource);
  }

  if (filter === 'manual') {
    return provider === 'manual' || block.sourceType === 'manual';
  }

  if (filter === 'planner') {
    return provider === 'manual' || provider === 'template' || block.sourceType === 'manual' || block.sourceType === 'template_instance';
  }

  return true;
};

const isImportedProvider = (provider?: PlannerSourceProvider): boolean => {
  return provider === 'google_calendar' || provider === 'outlook' || provider === 'import';
};
