import { useEffect, useState } from 'react';

export type EditorFieldId =
  | 'description'
  | 'category'
  | 'baseEvent'
  | 'travelTime'
  | 'additionalTimezone'
  | 'saveAsTemplate'
  | 'childcare';

export type EditorFieldLocation = 'basic' | 'moreDetails' | 'hidden';

export type PlannerSetup = Record<EditorFieldId, EditorFieldLocation>;

export const BUILT_IN_CHILDCARE_FEATURE_ID = 'childcare-needed';

export const EDITOR_FIELDS: Array<{ id: EditorFieldId; label: string }> = [
  { id: 'travelTime', label: 'Travel Time' },
  { id: 'category', label: 'Category' },
  { id: 'description', label: 'Description' },
  { id: 'baseEvent', label: 'Base Calendar Event' },
  { id: 'additionalTimezone', label: 'Additional Timezone' },
  { id: 'childcare', label: 'Childcare Needed' },
  { id: 'saveAsTemplate', label: 'Save As Template' },
];

export const DEFAULT_PLANNER_SETUP: PlannerSetup = {
  description: 'moreDetails',
  category: 'moreDetails',
  baseEvent: 'moreDetails',
  travelTime: 'moreDetails',
  additionalTimezone: 'moreDetails',
  saveAsTemplate: 'moreDetails',
  childcare: 'moreDetails',
};

const STORAGE_KEY = 'planner.setup.editorLayout.v1';

export const readPlannerSetup = (): PlannerSetup => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_PLANNER_SETUP;
    return { ...DEFAULT_PLANNER_SETUP, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_PLANNER_SETUP;
  }
};

export const writePlannerSetup = (setup: PlannerSetup) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
  window.dispatchEvent(new CustomEvent('planner-setup-change', { detail: setup }));
};

export const usePlannerSetup = () => {
  const [setup, setSetup] = useState<PlannerSetup>(() => readPlannerSetup());

  useEffect(() => {
    const handleChange = () => setSetup(readPlannerSetup());
    window.addEventListener('planner-setup-change', handleChange);
    window.addEventListener('storage', handleChange);
    return () => {
      window.removeEventListener('planner-setup-change', handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, []);

  const updateField = (field: EditorFieldId, location: EditorFieldLocation) => {
    const nextSetup = { ...setup, [field]: location };
    setSetup(nextSetup);
    writePlannerSetup(nextSetup);
  };

  return { setup, updateField };
};
