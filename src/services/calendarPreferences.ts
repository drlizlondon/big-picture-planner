/**
 * User preferences for how Big Planner interacts with external calendars.
 * Thin localStorage wrappers so the planner stays local-first.
 */

import type { CalendarWriteBackPreference } from '../types/models';

const WRITE_BACK_KEY = 'planner.calendarWriteBack';

const VALID: CalendarWriteBackPreference[] = ['ask', 'local_only', 'always'];

/**
 * How edits to a linked external event are written back.
 * Default 'ask': edits stay in Big Planner and the user is offered a clear
 * choice to also update the external calendar (never a silent overwrite).
 */
export const getCalendarWriteBackPreference = (): CalendarWriteBackPreference => {
  try {
    const stored = localStorage.getItem(WRITE_BACK_KEY) as CalendarWriteBackPreference | null;
    return stored && VALID.includes(stored) ? stored : 'ask';
  } catch {
    return 'ask';
  }
};

export const setCalendarWriteBackPreference = (preference: CalendarWriteBackPreference): void => {
  try {
    localStorage.setItem(WRITE_BACK_KEY, preference);
  } catch {
    // Ignore storage failures; the in-session default still applies.
  }
};
