export type BlockSourceType = 'manual' | 'calendar_import' | 'paste' | 'template_instance';
export type PlannerSourceProvider = 'manual' | 'google_calendar' | 'apple_calendar' | 'outlook' | 'import' | 'template' | 'system';
export type PlannerSystemTag = 'travel' | 'recurring' | 'imported' | 'review' | 'conflict' | 'base_event' | 'template_instance';
export type ReviewColour = 'GREEN' | 'ORANGE' | 'RED';

/**
 * How a block relates to an external calendar (Google / Apple):
 *  - 'local_only'    Created and lives only in Big Planner. Never touches an external calendar.
 *  - 'imported_copy' A one-way snapshot of an external event (e.g. Apple .ics). Edits stay local.
 *  - 'linked'        A two-way link to an external event (e.g. Google Calendar). Edits *may* be written back.
 *  - 'exported'      Created in Big Planner and pushed out to an external calendar.
 */
export type CalendarLinkType = 'local_only' | 'imported_copy' | 'linked' | 'exported';

/**
 * Live sync state of a linked/exported block, derived from local vs external edit times.
 * Drives the user-facing labels in {@link getCalendarSyncStatusLabel}.
 */
export type CalendarSyncStatus =
  | 'synced'              // local and external agree
  | 'local_only'         // not connected to any external calendar
  | 'changed_locally'    // edited in Big Planner since the last sync, not yet pushed
  | 'changed_externally' // changed in the external calendar since the last sync, not yet pulled
  | 'conflict';          // changed in BOTH since the last sync — needs a user decision

/** Where a calendar edit should be written. */
export type CalendarWriteScope = 'local_only' | 'external';

/** User preference for how linked-event edits are written back to the external calendar. */
export type CalendarWriteBackPreference = 'ask' | 'local_only' | 'always';

export interface FeatureData {
  enabled: boolean;
  isComplete: boolean;
  status?: 'needed' | 'sorted';
  notes?: string;
}

export interface CalendarSourceMetadata {
  provider: PlannerSourceProvider;
  /** Human-readable source name, e.g. "Work (Google)" or "Family (Apple Calendar)". */
  name: string;
  /** The external calendar this event belongs to (calendarId for Google, X-WR-CALNAME/UID host for .ics). */
  externalCalendarId?: string;
  /** The external event id (Google event id / iCal UID). */
  externalId?: string;
  /** When this event was first imported into Big Planner. */
  importedAt?: number;
  /** How this block relates to its external calendar (see {@link CalendarLinkType}). */
  link?: CalendarLinkType;
  /** Last time Big Planner reconciled this event with the external calendar. */
  lastSyncedAt?: number;
  /** The external event's last-modified time as of the last sync (used to detect external changes). */
  externalUpdatedAt?: number;
  /** When the user last edited this block locally (used to detect un-pushed local changes). */
  localEditedAt?: number;
  /** Cached sync status; recompute with deriveCalendarSyncStatus() rather than trusting blindly. */
  syncStatus?: CalendarSyncStatus;
}

export interface PlannerItemMetadata {
  source?: CalendarSourceMetadata;
  labelIds: string[];
  systemTags: PlannerSystemTag[];
  viewIds: string[];
}

export interface PlannerBlock {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  
  // Scheduling
  date?: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm (Calculated dynamically, but cached for queries)
  isScheduled: boolean;
  /** All-day / multi-day events: shown in the all-day lane, not the time grid.
      Multi-day events are expanded into one block per day, each flagged here. */
  isAllDay?: boolean;
  
  // Type flags
  isBaseEvent: boolean;
  isHidden: boolean;
  isPrioritised?: boolean;
  sourceType: BlockSourceType;
  metadata?: PlannerItemMetadata;
  
  // Relationships & Categorization
  categoryId?: string;
  templateId?: string;
  
  // Travel Time (Tethered to this parent block)
  travelEnabled: boolean;
  travelBeforeMinutes: number;
  travelAfterMinutes: number;
  
  // Features & Localization
  additionalTimezone?: string;
  features: Record<string, FeatureData>; // Key: Feature ID
  reviewColour?: ReviewColour;
  /** User accepted that this block overlaps others (e.g. a meeting inside a
      shift) — downgrades a red clash to an orange "overlap allowed". */
  allowOverlap?: boolean;
  importSource?: string;
  importRawLine?: string;
  
  // Metadata
  createdAt: number;
  updatedAt: number;
  deletedAt?: number; // Soft delete
}

export interface Category {
  id: string;
  name: string;
  colorHex: string;
  isArchived: boolean;
  /** Last-modified time (ms) — used for cloud sync conflict resolution. */
  updatedAt?: number;
}

export interface FeatureDefinition {
  id: string;
  name: string;
  icon?: string;
  displayLocation?: 'basic' | 'moreDetails' | 'hidden';
  displayMode: 'text' | 'icon' | 'text+icon';
  allowNotes: boolean;
  showOnCalendar: boolean;
  status?: 'needed' | 'sorted';
  note?: string;
  isArchived: boolean; // Soft delete for features
}

export interface PlannerTemplate {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  
  categoryId?: string;
  
  // Travel Settings
  travelEnabled: boolean;
  travelBeforeMinutes: number;
  travelAfterMinutes: number;
  
  // Features & Localization
  additionalTimezone?: string;
  features: Record<string, FeatureData>; 
  metadata?: PlannerItemMetadata;
  
  createdAt: number;
  updatedAt: number;
  isArchived: boolean; // Soft delete
}

export interface PlannerLabel {
  id: string;
  name: string;
  colorHex: string;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PlannerViewDefinition {
  id: string;
  name: string;
  labelIds: string[];
  sourceProviders: PlannerSourceProvider[];
  systemTags: PlannerSystemTag[];
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Where imported events land in Big Planner. */
export type ImportTarget = 'calendar' | 'inbox';

/**
 * Per-source-calendar import settings, remembered so future imports of the same
 * calendar reuse the chosen tag/category and destination automatically (req #8).
 */
export interface CalendarImportPreference {
  /** Stable key: `${provider}:${externalCalendarId}`. */
  key: string;
  provider: PlannerSourceProvider;
  externalCalendarId: string;
  /** Last-seen display name of the source calendar. */
  calendarName: string;
  /** Category to apply to imported events, if any. */
  categoryId?: string;
  /** Label/tag to apply to imported events, if any. */
  labelId?: string;
  /** Where imported events should land. */
  target: ImportTarget;
  updatedAt: number;
}

export type SyncEntityType = 'blocks' | 'templates' | 'categories';
export type SyncAction = 'upsert' | 'delete';
export type SyncStatusText = 'Saved on this device' | 'Offline' | 'Sync pending' | 'Syncing' | 'Synced' | 'Sync failed, retrying';
export type ImportDecision = 'imported' | 'device-only' | 'later';

export interface SyncQueueItem {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  payload?: PlannerBlock | PlannerTemplate | Category;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  nextAttemptAt?: number;
  lastError?: string;
}

export interface SyncMeta {
  key: string;
  value: string;
  updatedAt: number;
}
