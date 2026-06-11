import React, { useState } from 'react';
import { EDITOR_FIELDS, type EditorFieldLocation, usePlannerSetup } from '../../utils/plannerSetup';
import { useCategories } from '../../hooks/usePlannerData';
import { archiveCategory, createCategory, updateCategory } from '../../services/plannerActions';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const LOCATION_OPTIONS: Array<{ value: EditorFieldLocation; label: string }> = [
  { value: 'basic', label: 'Show in main editor' },
  { value: 'moreDetails', label: 'Keep under More Details' },
  { value: 'hidden', label: 'Hide' },
];

type SetupSection = 'general' | 'editorLayout' | 'categories' | 'sources' | 'filters' | 'appearance' | 'advanced';

const SECTIONS: Array<{ id: SetupSection; label: string; description: string }> = [
  { id: 'general', label: 'General', description: 'Everyday planner preferences.' },
  { id: 'editorLayout', label: 'Editor Layout', description: 'Choose what appears when editing a block.' },
  { id: 'categories', label: 'Categories', description: 'Colour accents for your blocks.' },
  { id: 'sources', label: 'Sources', description: 'Understand where planner items come from.' },
  { id: 'filters', label: 'Filters', description: 'Control what appears on the calendar.' },
  { id: 'appearance', label: 'Appearance', description: 'Keep the planner visually calm.' },
  { id: 'advanced', label: 'Advanced', description: 'Quiet power-user details.' },
];

export const PlannerSetupPanel: React.FC<Props> = ({ isOpen, onClose }) => {
  const { setup, updateField } = usePlannerSetup();
  const [activeSection, setActiveSection] = useState<SetupSection>('general');

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-text-primary/20 z-overlay" onClick={onClose} />
      <div
        className="fixed right-0 top-0 bottom-0 w-[min(720px,100vw)] bg-surface-primary shadow-drawer z-drawer flex flex-col border-l border-border-default"
        role="dialog"
        aria-modal="true"
        aria-labelledby="planner-setup-title"
      >
        <div className="h-[72px] flex items-center px-6 border-b border-border-default justify-between flex-shrink-0">
          <div>
            <h2 id="planner-setup-title" className="text-[17px] font-bold text-text-primary">Planner Setup</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">Keep the planner calm, useful and personal.</p>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary font-semibold text-[14px] transition-colors">
            Close
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] overflow-hidden md:grid-cols-[190px_1fr] md:grid-rows-none">
          <nav className="border-b border-border-default bg-background/70 p-3 md:border-b-0 md:border-r">
            <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
              {SECTIONS.map(section => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`min-w-[138px] rounded-small px-3 py-2 text-left transition-colors md:min-w-0 ${activeSection === section.id ? 'bg-surface-primary text-text-primary shadow-sm border border-border-default' : 'text-text-secondary hover:bg-surface-primary/70'}`}
                >
                  <span className="block text-[13px] font-bold">{section.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug">{section.description}</span>
                </button>
              ))}
            </div>
          </nav>

          <div className="overflow-y-auto p-6">
            {activeSection === 'general' && <GeneralSection onClose={onClose} />}
            {activeSection === 'editorLayout' && <EditorLayoutSection setup={setup} updateField={updateField} />}
            {activeSection === 'categories' && <CategoriesSection />}
            {activeSection === 'sources' && <SourcesSection />}
            {activeSection === 'filters' && <FutureSection title="Filters" body="The side panel filters show or hide matching calendar blocks. Full saved views and custom labels are not enabled yet." />}
            {activeSection === 'appearance' && <FutureSection title="Appearance" body="The launch theme is intentionally restrained: small type, light grid lines and clear block colours." />}
            {activeSection === 'advanced' && <FutureSection title="Advanced" body="Keyboard nudging, import metadata and local-first sync behaviour stay available without making setup the centre of the product." />}
          </div>
        </div>
      </div>
    </>
  );
};

const GeneralSection: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const replayTour = () => {
    onClose();
    // Let the drawer close before the spotlight starts
    setTimeout(() => window.dispatchEvent(new CustomEvent('planner:start-tour')), 250);
  };
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-[18px] font-bold text-text-primary">General</h3>
        <p className="mt-1 text-[13px] leading-6 text-text-secondary">
          The planner is local-first. You can plan without an account, and sync can be added when you want it.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SetupInfoCard title="Local-first planning" body="Your blocks are saved on this device before any cloud sync happens." />
        <SetupInfoCard title="Fine tuning" body="Select a scheduled block, then use arrow keys and +/- for precise changes." />
      </div>
      <div className="rounded-medium border border-border-default bg-background p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-[14px] font-bold text-text-primary">New here?</div>
          <p className="mt-0.5 text-[12px] leading-5 text-text-secondary">Replay the 60-second walkthrough: add a task, send it to Ready, place it, then move it.</p>
        </div>
        <button
          onClick={replayTour}
          className="flex-shrink-0 h-9 rounded-small bg-accent-primary px-4 text-[13px] font-bold text-white hover:bg-accent-hover transition-colors shadow-sm"
        >
          Replay walkthrough
        </button>
      </div>
    </section>
  );
};

interface EditorLayoutSectionProps {
  setup: ReturnType<typeof usePlannerSetup>['setup'];
  updateField: ReturnType<typeof usePlannerSetup>['updateField'];
}

const EditorLayoutSection: React.FC<EditorLayoutSectionProps> = ({ setup, updateField }) => (
  <section className="flex flex-col gap-4">
    <div>
      <h3 className="text-[18px] font-bold text-text-primary">Editor Layout</h3>
      <p className="mt-1 text-[13px] leading-6 text-text-secondary">
        Some advanced details are everyday details for different people. Move them where they make sense for you.
      </p>
    </div>

    <div className="rounded-medium border border-border-default overflow-hidden">
      <div className="grid grid-cols-[1fr_150px] bg-background border-b border-border-default px-3 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted sm:grid-cols-[1fr_190px]">
        <span>Field</span>
        <span>Where it appears</span>
      </div>
      {EDITOR_FIELDS.map(field => (
        <div key={field.id} className="grid grid-cols-1 gap-2 px-3 py-3 border-b border-border-default last:border-b-0 items-start sm:grid-cols-[1fr_190px] sm:items-center">
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
);

const CATEGORY_COLOR_PRESETS = ['#3B82F6', '#22C55E', '#F97316', '#8B5CF6', '#EC4899', '#64748B'];

const CategoriesSection: React.FC = () => {
  const categories = useCategories() || [];
  const [name, setName] = useState('');
  const [colorHex, setColorHex] = useState(CATEGORY_COLOR_PRESETS[0]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    await createCategory({ name: trimmedName, colorHex });
    setName('');
  };

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-[18px] font-bold text-text-primary">Categories</h3>
        <p className="mt-1 text-[13px] leading-6 text-text-secondary">
          Categories add a small colour dot to blocks without taking over the calendar.
        </p>
      </div>

      <form onSubmit={handleCreate} className="rounded-medium border border-border-default bg-background p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <label className="flex flex-col gap-2">
            <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-text-primary">New category</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-[38px] rounded-small border border-border-default bg-white px-3 text-[13px] outline-none focus:border-accent-primary"
              placeholder="e.g. Health, Work, Family"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-text-primary">Colour</span>
            <input
              type="color"
              value={colorHex}
              onChange={(event) => setColorHex(event.target.value)}
              className="h-[38px] w-full min-w-[64px] rounded-small border border-border-default bg-white p-1"
              aria-label="New category colour"
            />
          </label>
          <button
            type="submit"
            disabled={!name.trim()}
            className="h-[38px] rounded-small bg-accent-primary px-4 text-[13px] font-bold text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORY_COLOR_PRESETS.map(preset => (
            <button
              key={preset}
              type="button"
              onClick={() => setColorHex(preset)}
              className={`h-6 w-6 rounded-full border ${colorHex.toLowerCase() === preset.toLowerCase() ? 'border-text-primary ring-2 ring-text-primary/10' : 'border-border-default'}`}
              style={{ backgroundColor: preset }}
              aria-label={`Use colour ${preset}`}
            />
          ))}
        </div>
      </form>

      <div className="rounded-medium border border-border-default overflow-hidden">
        <div className="grid grid-cols-[1fr_76px_70px] bg-background border-b border-border-default px-3 py-2 text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted sm:grid-cols-[1fr_96px_90px]">
          <span>Category</span>
          <span>Colour</span>
          <span></span>
        </div>
        {categories.length === 0 ? (
          <div className="px-3 py-4 text-[13px] text-text-secondary">
            No categories yet. Add one above, then assign it from the block editor.
          </div>
        ) : (
          categories.map(category => (
            <div key={category.id} className="grid grid-cols-[1fr_76px_70px] gap-2 px-3 py-3 border-b border-border-default last:border-b-0 items-center sm:grid-cols-[1fr_96px_90px]">
              <input
                value={category.name}
                onChange={(event) => void updateCategory(category.id, { name: event.target.value })}
                className="h-[36px] min-w-0 rounded-small border border-border-default bg-white px-2 text-[13px] font-semibold text-text-primary outline-none focus:border-accent-primary"
                aria-label={`Name for ${category.name}`}
              />
              <input
                type="color"
                value={category.colorHex}
                onChange={(event) => void updateCategory(category.id, { colorHex: event.target.value })}
                className="h-[36px] w-full rounded-small border border-border-default bg-white p-1"
                aria-label={`Colour for ${category.name}`}
              />
              <button
                type="button"
                onClick={() => void archiveCategory(category.id)}
                className="h-[36px] rounded-small border border-border-default bg-surface-primary px-2 text-[12px] font-bold text-text-secondary hover:text-semantic-danger"
              >
                Archive
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

const SourcesSection: React.FC = () => (
  <section className="flex flex-col gap-4">
    <div>
      <h3 className="text-[18px] font-bold text-text-primary">Sources</h3>
      <p className="mt-1 text-[13px] leading-6 text-text-secondary">
        Planner items can now store where they came from. Calendar connections are not enabled yet.
      </p>
    </div>
    <div className="grid gap-3">
      <SetupInfoCard title="Manual Entry" body="Blocks created directly in the planner." />
      <SetupInfoCard title="Import" body="Blocks created from pasted lists or future imported sources." />
      <SetupInfoCard title="Template" body="Blocks created from reusable planning patterns." />
    </div>
  </section>
);

const FutureSection: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <section className="flex flex-col gap-4">
    <div>
      <h3 className="text-[18px] font-bold text-text-primary">{title}</h3>
      <p className="mt-1 text-[13px] leading-6 text-text-secondary">{body}</p>
    </div>
    <div className="rounded-medium border border-dashed border-border-strong bg-background p-4">
      <div className="text-[13px] font-bold text-text-primary">Prepared for later</div>
      <p className="mt-1 text-[12px] leading-5 text-text-secondary">
        Nothing to configure here yet. This keeps the launch product simple while leaving room to grow.
      </p>
    </div>
  </section>
);

const SetupInfoCard: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div className="rounded-medium border border-border-default bg-surface-primary p-4 shadow-sm">
    <div className="text-[13px] font-bold text-text-primary">{title}</div>
    <p className="mt-1 text-[12px] leading-5 text-text-secondary">{body}</p>
  </div>
);
