import React from 'react';
import { EDITOR_FIELDS, type EditorFieldLocation, usePlannerSetup } from '../../utils/plannerSetup';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const LOCATION_OPTIONS: Array<{ value: EditorFieldLocation; label: string }> = [
  { value: 'basic', label: 'Show in main editor' },
  { value: 'moreDetails', label: 'Keep under More Details' },
  { value: 'hidden', label: 'Hide' },
];

export const PlannerSetupPanel: React.FC<Props> = ({ isOpen, onClose }) => {
  const { setup, updateField } = usePlannerSetup();

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-text-primary/20 z-overlay" onClick={onClose} />
      <div
        className="fixed right-0 top-0 bottom-0 w-[460px] bg-surface-primary shadow-drawer z-drawer flex flex-col border-l border-border-default"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planner-setup-title"
      >
        <div className="h-[72px] flex items-center px-6 border-b border-border-default justify-between flex-shrink-0">
          <div>
            <h2 id="planner-setup-title" className="text-[16px] font-semibold text-text-primary">Planner Setup</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">Choose what belongs in your everyday block editor.</p>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary font-semibold text-[14px] transition-colors">
            Close
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-[14px] font-semibold text-text-primary">Editor Layout</h3>
              <p className="text-[12px] text-text-secondary mt-1">
                Some advanced details are everyday details for different people. Move them where they make sense for you.
              </p>
            </div>

            <div className="rounded-medium border border-border-default overflow-hidden">
              <div className="grid grid-cols-[1fr_180px] bg-background border-b border-border-default px-3 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted">
                <span>Field</span>
                <span>Where it appears</span>
              </div>
              {EDITOR_FIELDS.map(field => (
                <div key={field.id} className="grid grid-cols-[1fr_180px] gap-3 px-3 py-3 border-b border-border-default last:border-b-0 items-center">
                  <div className="text-[13px] font-semibold text-text-primary">{field.label}</div>
                  <select
                    value={setup[field.id]}
                    onChange={(e) => updateField(field.id, e.target.value as EditorFieldLocation)}
                    className="h-[36px] rounded-small border border-border-default bg-white px-2 text-[13px] outline-none focus:border-accent-primary"
                  >
                    {LOCATION_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="rounded-medium bg-background border border-border-default p-3 text-[12px] text-text-secondary">
              Title, duration, date, and time always stay in the main editor.
            </div>
          </section>
        </div>
      </div>
    </>
  );
};
