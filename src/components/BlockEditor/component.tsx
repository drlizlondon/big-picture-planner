import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createBlock, createTemplate, deleteBlock, duplicateBlock, moveBlockToSchedule, updateBlock } from '../../services/plannerActions';
import { useBlock, useCategories } from '../../hooks/usePlannerData';
import { calculateEndTime } from '../../utils/planningEngine';
import type { FeatureData } from '../../types/models';
import { DurationSelector } from '../DurationSelector/component';
import { BUILT_IN_CHILDCARE_FEATURE_ID, EDITOR_FIELDS, usePlannerSetup, type EditorFieldId } from '../../utils/plannerSetup';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  blockId?: string | null;
}

const TIMEZONE_OPTIONS = [
  ['America/New_York', 'New York (EST/EDT)'],
  ['America/Chicago', 'Chicago (CST/CDT)'],
  ['America/Denver', 'Denver (MST/MDT)'],
  ['America/Los_Angeles', 'Los Angeles (PST/PDT)'],
  ['Europe/London', 'London (GMT/BST)'],
  ['Europe/Paris', 'Paris (CET/CEST)'],
  ['Asia/Tokyo', 'Tokyo (JST)'],
  ['Australia/Sydney', 'Sydney (AEST/AEDT)'],
  ['Pacific/Honolulu', 'Honolulu (HST)'],
  ['UTC', 'UTC'],
];

export const BlockEditor: React.FC<Props> = ({ isOpen, onClose, blockId }) => {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(15);
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [isBaseEvent, setIsBaseEvent] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [travelEnabled, setTravelEnabled] = useState(false);
  const [travelBeforeMinutes, setTravelBeforeMinutes] = useState(60);
  const [travelAfterMinutes, setTravelAfterMinutes] = useState(60);
  const [timezoneEnabled, setTimezoneEnabled] = useState(false);
  const [additionalTimezone, setAdditionalTimezone] = useState<string | undefined>(undefined);
  const [features, setFeatures] = useState<Record<string, FeatureData>>({});
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const categories = useCategories() || [];
  const block = useBlock(blockId || null);
  const { setup } = usePlannerSetup();

  const resetForm = useCallback(() => {
    setTitle('');
    setDuration(15);
    setDescription('');
    setCategoryId('');
    setDate('');
    setStartTime('');
    setIsBaseEvent(false);
    setShowMoreDetails(false);
    setTravelEnabled(false);
    setTravelBeforeMinutes(60);
    setTravelAfterMinutes(60);
    setAdditionalTimezone(undefined);
    setTimezoneEnabled(false);
    setFeatures({});
    setSaveAsTemplate(false);
    setError(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      setTimeout(() => titleRef.current?.focus(), 50);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  /* eslint-disable react-hooks/set-state-in-effect -- Form state is intentionally hydrated when the editor opens for a different block. */
  useEffect(() => {
    if (block && isOpen) {
      setError(null);
      setTitle(block.title);
      setDuration(block.durationMinutes);
      setDescription(block.description || '');
      setCategoryId(block.categoryId || '');
      setDate(block.date || '');
      setStartTime(block.startTime || '');
      setIsBaseEvent(block.isBaseEvent || false);
      setTravelEnabled(block.travelEnabled || false);
      setTravelBeforeMinutes(block.travelBeforeMinutes ?? 60);
      setTravelAfterMinutes(block.travelAfterMinutes ?? 60);
      setAdditionalTimezone(block.additionalTimezone);
      setTimezoneEnabled(!!block.additionalTimezone);
      setFeatures(block.features || {});
      setSaveAsTemplate(false);
    } else if (!blockId && isOpen) {
      resetForm();
    }
  }, [block, isOpen, blockId, resetForm]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!isOpen) return null;

  const setChildcareFeature = (updates: Partial<FeatureData>) => {
    setFeatures(prev => {
      const current = prev[BUILT_IN_CHILDCARE_FEATURE_ID] || { enabled: false, isComplete: false, status: 'needed' as const, notes: '' };
      const next = { ...current, ...updates };
      return { ...prev, [BUILT_IN_CHILDCARE_FEATURE_ID]: next };
    });
  };

  const handleSave = async () => {
    setError(null);

    if (!title.trim()) return setError('Title is required.');
    if (!duration || duration <= 0) return setError('Duration must be greater than 0.');
    if (duration % 5 !== 0) return setError('Duration must be in 5-minute increments.');

    const isScheduledLocal = !!(date && startTime);
    let endTimeToSave: string | undefined = undefined;

    if (isScheduledLocal) {
      try {
        endTimeToSave = calculateEndTime(startTime, duration);
      } catch (e: unknown) {
        return setError(e instanceof Error ? e.message : 'Invalid time. Block cannot cross midnight.');
      }
    } else if (date || startTime) {
      return setError('Both Date and Time are required to schedule a block.');
    }

    const additionalTzToSave = timezoneEnabled && additionalTimezone ? additionalTimezone : undefined;
    const blockData = {
      title: title.trim(),
      durationMinutes: duration,
      description: description.trim() || undefined,
      categoryId: categoryId || undefined,
      date: isScheduledLocal ? date : undefined,
      startTime: isScheduledLocal ? startTime : undefined,
      endTime: endTimeToSave,
      isScheduled: isScheduledLocal,
      isBaseEvent,
      travelEnabled,
      travelBeforeMinutes,
      travelAfterMinutes,
      additionalTimezone: additionalTzToSave,
      features,
    };

    if (blockId) {
      await updateBlock(blockId, blockData);
    } else {
      await createBlock({
        ...blockData,
        isHidden: false,
        sourceType: 'manual',
      });
    }

    if (saveAsTemplate) {
      await createTemplate({
        title: title.trim(),
        durationMinutes: duration,
        description: description.trim() || undefined,
        categoryId: categoryId || undefined,
        travelEnabled,
        travelBeforeMinutes,
        travelAfterMinutes,
        additionalTimezone: additionalTzToSave,
        features,
      });
    }

    if (isScheduledLocal) {
      ensureSavedBlockTimeVisible(startTime, duration);
    }

    resetForm();
    onClose();
  };

  const handleDelete = async () => {
    if (!blockId) return;
    await deleteBlock(blockId);
    onClose();
  };

  const handleDuplicate = async () => {
    if (!blockId) return;
    await duplicateBlock(blockId);
    onClose();
  };

  const handleMoveToSchedule = async () => {
    if (!blockId) return;
    await moveBlockToSchedule(blockId);
    onClose();
  };

  const childcare = features[BUILT_IN_CHILDCARE_FEATURE_ID] || { enabled: false, isComplete: false, status: 'needed' as const, notes: '' };

  const fields: Record<EditorFieldId, React.ReactNode> = {
    description: (
      <div className="flex flex-col gap-2">
        <label className="text-[12px] font-bold uppercase text-text-primary tracking-[0.04em]">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-[80px] rounded-medium border border-border-default p-4 text-[14px] outline-none focus:border-accent-primary resize-y"
          placeholder="Add details..."
        />
      </div>
    ),
    category: (
      <div className="flex flex-col gap-2">
        <label className="text-[12px] font-bold uppercase text-text-primary tracking-[0.04em]">Category</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-[44px] rounded-medium border border-border-default px-4 text-[14px] outline-none focus:border-accent-primary bg-white"
        >
          <option value="">No Category</option>
          {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
      </div>
    ),
    baseEvent: (
      <label className="flex items-center gap-3 cursor-pointer p-3 rounded-medium border border-border-default bg-surface-secondary hover:bg-background transition-colors">
        <input
          type="checkbox"
          checked={isBaseEvent}
          onChange={(e) => setIsBaseEvent(e.target.checked)}
          className="w-4 h-4 rounded text-accent-primary focus:ring-accent-primary border-border-default"
        />
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-text-primary">Base Calendar Event</span>
          <span className="text-[11px] text-text-secondary">Mark as a fixed commitment.</span>
        </div>
      </label>
    ),
    travelTime: (
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={travelEnabled}
            onChange={(e) => setTravelEnabled(e.target.checked)}
            className="w-4 h-4 rounded text-accent-primary focus:ring-accent-primary border-border-default"
          />
          <span className="text-[13px] font-semibold text-text-primary">Add Travel Time</span>
        </label>
        {travelEnabled && (
          <div className="flex gap-4 pl-6">
            <NumberField label="Before (mins)" value={travelBeforeMinutes} onChange={setTravelBeforeMinutes} />
            <NumberField label="After (mins)" value={travelAfterMinutes} onChange={setTravelAfterMinutes} />
          </div>
        )}
      </div>
    ),
    additionalTimezone: (
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={timezoneEnabled}
            onChange={(e) => setTimezoneEnabled(e.target.checked)}
            className="w-4 h-4 rounded text-accent-primary focus:ring-accent-primary border-border-default"
          />
          <span className="text-[13px] font-semibold text-text-primary">Additional Timezone</span>
        </label>
        {timezoneEnabled && (
          <div className="pl-6">
            <select
              value={additionalTimezone || ''}
              onChange={(e) => setAdditionalTimezone(e.target.value)}
              className="w-full h-[36px] rounded-small border border-border-default px-3 text-[13px] outline-none focus:border-accent-primary bg-white"
            >
              <option value="" disabled>Select Timezone...</option>
              {TIMEZONE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        )}
      </div>
    ),
    saveAsTemplate: (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={saveAsTemplate}
          onChange={(e) => setSaveAsTemplate(e.target.checked)}
          className="w-4 h-4 rounded text-accent-primary focus:ring-accent-primary border-border-default"
        />
        <span className="text-[13px] font-semibold text-text-primary">Save As Template</span>
      </label>
    ),
    childcare: (
      <div className="rounded-medium border border-border-default bg-surface-secondary p-3 flex flex-col gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!childcare.enabled}
            onChange={(e) => setChildcareFeature({ enabled: e.target.checked, status: e.target.checked ? (childcare.status || 'needed') : 'needed', isComplete: e.target.checked ? childcare.isComplete : false })}
            className="w-4 h-4 rounded text-accent-primary focus:ring-accent-primary border-border-default"
          />
          <span className="text-[13px] font-semibold text-text-primary">Childcare needed</span>
        </label>
        {childcare.enabled && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {(['needed', 'sorted'] as const).map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setChildcareFeature({ status, isComplete: status === 'sorted' })}
                  className={`h-[34px] rounded-small border text-[13px] font-semibold transition-colors ${childcare.status === status ? 'bg-accent-primary text-white border-accent-primary' : 'bg-white border-border-default text-text-primary hover:border-accent-primary/50'}`}
                >
                  {status === 'needed' ? 'Needed' : 'Sorted'}
                </button>
              ))}
            </div>
            <input
              value={childcare.notes || ''}
              onChange={(e) => setChildcareFeature({ notes: e.target.value })}
              className="h-[38px] rounded-small border border-border-default px-3 text-[13px] outline-none focus:border-accent-primary bg-white"
              placeholder="Optional note"
            />
          </>
        )}
      </div>
    ),
  };

  const renderLocationFields = (location: 'basic' | 'moreDetails') => (
    EDITOR_FIELDS
      .map(field => field.id)
      .filter(field => setup[field] === location)
      .map(field => <React.Fragment key={field}>{fields[field]}</React.Fragment>)
  );

  const moreDetailsFields = renderLocationFields('moreDetails');

  return (
    <>
      <div className="fixed inset-0 bg-text-primary/20 z-overlay" onClick={onClose} />
      <div
        className="fixed right-0 top-0 bottom-0 w-[400px] max-w-full bg-surface-primary shadow-drawer z-drawer flex flex-col border-l border-border-default"
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-editor-title"
      >
        <div className="h-[72px] flex items-center px-6 border-b border-border-default justify-between flex-shrink-0">
          <h2 id="block-editor-title" className="text-[16px] font-semibold text-text-primary">{blockId ? 'Edit Block' : 'Create Block'}</h2>
          <button aria-label="Close block editor" onClick={onClose} className="text-text-secondary hover:text-text-primary font-semibold text-[14px] transition-colors">
            Close
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-6">
          {error && (
            <div className="p-3 bg-semantic-danger/10 border border-semantic-danger/20 rounded-small text-semantic-danger text-[13px] font-semibold" role="alert">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-bold uppercase text-text-primary tracking-[0.04em]">Title</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-[44px] rounded-medium border border-border-default px-4 text-[14px] outline-none focus:border-accent-primary"
              placeholder="e.g. Gym, Read Book"
            />
          </div>

          <DurationSelector value={duration} onChange={setDuration} />

          <div className="flex gap-4">
            <div className="flex flex-col gap-2 flex-1">
              <label className="text-[12px] font-bold uppercase text-text-primary tracking-[0.04em]">Date (Optional)</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-[44px] rounded-medium border border-border-default px-4 text-[14px] outline-none focus:border-accent-primary bg-white"
              />
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <label className="text-[12px] font-bold uppercase text-text-primary tracking-[0.04em]">Time (Optional)</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-[44px] rounded-medium border border-border-default px-4 text-[14px] outline-none focus:border-accent-primary bg-white"
              />
            </div>
          </div>

          {renderLocationFields('basic')}

          {moreDetailsFields.length > 0 && (
            <div className="pt-4 border-t border-border-default">
              <button
                onClick={() => setShowMoreDetails(!showMoreDetails)}
                className="flex items-center gap-2 text-[13px] font-bold text-text-secondary hover:text-text-primary transition-colors"
              >
                <span>More Details</span>
                <span className={`transform transition-transform duration-200 ${showMoreDetails ? 'rotate-180' : ''}`}>▼</span>
              </button>

              {showMoreDetails && (
                <div className="mt-6 flex flex-col gap-6">
                  {moreDetailsFields}
                </div>
              )}
            </div>
          )}
        </div>

        {blockId && (
          <div className="px-6 pb-6 flex flex-col gap-3">
            <h3 className="text-[12px] font-bold uppercase text-text-muted tracking-[0.04em]">Actions</h3>
            <div className="flex flex-col gap-2">
              {block?.isScheduled && (
                <button onClick={handleMoveToSchedule} className="h-[36px] bg-surface-secondary border border-border-default hover:bg-background text-text-primary rounded-small font-semibold text-[13px] transition-colors">
                  Move back to Ready to schedule
                </button>
              )}
              <button onClick={handleDuplicate} className="h-[36px] bg-surface-secondary border border-border-default hover:bg-background text-text-primary rounded-small font-semibold text-[13px] transition-colors">
                Duplicate Block
              </button>
              <button onClick={handleDelete} className="h-[36px] bg-semantic-danger/10 text-semantic-danger hover:bg-semantic-danger/20 rounded-small font-semibold text-[13px] transition-colors mt-2">
                Delete Block
              </button>
            </div>
          </div>
        )}

        <div className="p-6 border-t border-border-default bg-surface-secondary flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="w-full h-[44px] bg-accent-primary hover:bg-accent-hover disabled:opacity-50 text-white rounded-medium font-bold text-[14px] transition-colors shadow-sm"
          >
            {blockId ? 'Save Changes' : 'Save to Ready to schedule'}
          </button>
        </div>
      </div>
    </>
  );
};

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

const NumberField: React.FC<NumberFieldProps> = ({ label, value, onChange }) => (
  <div className="flex flex-col gap-1 flex-1">
    <label className="text-[11px] font-bold text-text-secondary uppercase tracking-[0.04em]">{label}</label>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-[36px] rounded-small border border-border-default px-3 text-[13px] outline-none focus:border-accent-primary"
      min="0"
      step="5"
    />
  </div>
);

const ensureSavedBlockTimeVisible = (startTime: string, durationMinutes: number) => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + durationMinutes;
  const startHour = Math.floor(startMinutes / 60);
  const endHour = Math.min(24, Math.max(startHour + 1, Math.ceil(endMinutes / 60)));

  window.dispatchEvent(new CustomEvent('planner:ensure-time-visible', {
    detail: { startHour, endHour },
  }));
};
