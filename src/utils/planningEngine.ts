/**
 * Pure functions for planner calculations.
 * Separates scheduling logic from UI and database layers.
 */
import type { PlannerBlock } from '../types/models';

/**
 * Converts a "HH:mm" time string into total minutes from start of day.
 */
export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Converts total minutes from start of day into a "HH:mm" time string.
 * Handles negative and out-of-bounds values by normalising them for display.
 */
export const minutesToTime = (minutes: number): string => {
  let normalizedMinutes = minutes % (24 * 60);
  if (normalizedMinutes < 0) {
    normalizedMinutes += 24 * 60;
  }
  const hours = Math.floor(normalizedMinutes / 60);
  const mins = normalizedMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

/**
 * Calculates the end time of a block based on start time and duration.
 * @param startTime format "HH:mm"
 * @param durationMinutes integer
 * @returns format "HH:mm"
 * @throws Error if the scheduled block extends past midnight.
 */
export const calculateEndTime = (startTime: string, durationMinutes: number): string => {
  const totalMinutes = timeToMinutes(startTime) + durationMinutes;
  
  if (totalMinutes > 24 * 60) {
    throw new Error("Validation Error: Block duration extends past midnight (00:00).");
  }
  
  return minutesToTime(totalMinutes);
};

/**
 * Detects if two numeric minute ranges overlap.
 * @returns boolean
 */
export const detectMinuteOverlap = (
  startA: number, endA: number,
  startB: number, endB: number
): boolean => {
  return startA < endB && endA > startB;
};

export interface EffectiveRange {
  startMinutes: number;
  endMinutes: number;
  startOutOfBounds: boolean;
  endOutOfBounds: boolean;
}

/**
 * Calculates the effective time range of a block, dynamically including generated travel time.
 * Keeps raw minutes internally for conflict detection so out-of-bounds travel doesn't overlap with same-day events.
 */
export const getEffectiveMinuteRange = (block: PlannerBlock): EffectiveRange | null => {
  if (!block.startTime || !block.endTime) return null;
  
  let startMinutes = timeToMinutes(block.startTime);
  let endMinutes = timeToMinutes(block.endTime);

  if (block.travelEnabled) {
    startMinutes -= block.travelBeforeMinutes;
    endMinutes += block.travelAfterMinutes;
  }
  
  return { 
    startMinutes, 
    endMinutes, 
    startOutOfBounds: startMinutes < 0, 
    endOutOfBounds: endMinutes > 24 * 60 
  };
};

/**
 * Checks if a block conflicts with any other scheduled block on the same day.
 * Does not prevent scheduling—only informs the UI layer.
 */
export const getBlockConflicts = (
  block: PlannerBlock,
  dailyBlocks: PlannerBlock[]
): PlannerBlock[] => {
  const blockRange = getEffectiveMinuteRange(block);
  if (!blockRange) return [];

  return dailyBlocks.filter(other => {
    if (other.id === block.id) return false;
    const otherRange = getEffectiveMinuteRange(other);
    if (!otherRange) return false;
    
    return detectMinuteOverlap(
      blockRange.startMinutes, blockRange.endMinutes,
      otherRange.startMinutes, otherRange.endMinutes
    );
  });
};

export type OverlapSeverity = 'none' | 'soft' | 'hard';

/**
 * Severity of a block's overlaps with the day's other blocks.
 * - 'none': no overlap.
 * - 'soft': overlaps, but the block (or every overlapping counterpart) has
 *   allowOverlap — an accepted overlay (e.g. a meeting inside a shift) → orange.
 * - 'hard': an unacknowledged clash → red.
 * Reuses getBlockConflicts so there is exactly one overlap detector.
 */
export const getOverlapSeverity = (
  block: PlannerBlock,
  dailyBlocks: PlannerBlock[]
): OverlapSeverity => {
  const conflicts = getBlockConflicts(block, dailyBlocks);
  if (conflicts.length === 0) return 'none';
  if (block.allowOverlap || conflicts.every(other => other.allowOverlap)) return 'soft';
  return 'hard';
};

export interface ImportValidationResult {
  isValid: boolean;
  requiresReview: boolean;
  reviewReason?: string;
}

export const validateImportedEvent = (startDate: string, endDate: string): ImportValidationResult => {
  if (startDate && endDate && startDate !== endDate) {
    return {
      isValid: true,
      requiresReview: true,
      reviewReason: 'Needs review: multi-day event'
    };
  }
  return { isValid: true, requiresReview: false };
};