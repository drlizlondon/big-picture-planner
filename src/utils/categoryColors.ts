import type { Category } from '../types/models';

const CATEGORY_COLORS: Record<string, string> = {
  work: '#3B82F6',
  health: '#22C55E',
  family: '#F97316',
  admin: '#64748B',
  learning: '#8B5CF6',
  personal: '#EC4899',
};

const DEFAULT_CATEGORY_COLOR = '#98A2B3';

export const getCategoryColor = (category?: Category): string => {
  if (!category) return DEFAULT_CATEGORY_COLOR;
  return category.colorHex || CATEGORY_COLORS[category.name.trim().toLowerCase()] || DEFAULT_CATEGORY_COLOR;
};
