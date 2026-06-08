export type BlockSourceType = 'manual' | 'calendar_import' | 'paste' | 'template_instance';
export type PlannerSourceProvider = 'manual' | 'google_calendar' | 'apple_calendar' | 'outlook' | 'import' | 'template' | 'system';
export type PlannerSystemTag = 'travel' | 'recurring' | 'imported' | 'review' | 'conflict' | 'base_event' | 'template_instance';
export type ReviewColour = 'GREEN' | 'ORANGE' | 'RED';

export interface FeatureData {
  enabled: boolean;
  isComplete: boolean;
  status?: 'needed' | 'sorted';
  notes?: string;
}

export interface PlannerItemMetadata {
  source?: {
    provider: PlannerSourceProvider;
    name: string;
    externalId?: string;
    importedAt?: number;
  };
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
  
  // Type flags
  isBaseEvent: boolean;
  isHidden: boolean;
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

export type SyncEntityType = 'blocks' | 'templates';
export type SyncAction = 'upsert' | 'delete';
export type SyncStatusText = 'Saved on this device' | 'Sync pending' | 'Syncing' | 'Synced' | 'Sync failed, retrying';
export type ImportDecision = 'imported' | 'device-only' | 'later';

export interface SyncQueueItem {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  payload?: PlannerBlock | PlannerTemplate;
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
