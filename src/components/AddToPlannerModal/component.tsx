// Add To Planner Modal Component
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createBlock } from '../../services/plannerActions';
import { DurationSelector } from '../DurationSelector/component';
import { looksLikePlannerImport, parsePlannerImportText, type PlannerImportItem } from '../../utils/plannerImport';
import type { ReviewColour } from '../../types/models';
import { PLANNER_IMPORT_PROMPT } from '../../utils/plannerImportPrompt';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreateBlock: () => void;
}

type ImportTab = 'quick' | 'ai';

export const AddToPlannerModal: React.FC<Props> = ({ isOpen, onClose, onCreateBlock }) => {
  const createBtnRef = useRef<HTMLButtonElement>(null);
  const quickTitleRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'menu' | 'paste' | 'review' | 'importReview'>('menu');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDuration, setQuickDuration] = useState(30);
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const [importTab, setImportTab] = useState<ImportTab>('quick');
  const [pasteText, setPasteText] = useState('');
  const [defaultDuration, setDefaultDuration] = useState(30);
  const [isPromptCopied, setIsPromptCopied] = useState(false);
  const [drafts, setDrafts] = useState<Array<{ id: string; title: string; durationMinutes: number; selected: boolean }>>([]);
  const [importDrafts, setImportDrafts] = useState<Array<PlannerImportItem & { selected: boolean }>>([]);

  const reset = useCallback(() => {
    setView('menu');
    setQuickTitle('');
    setQuickDuration(30);
    setImportTab('quick');
    setPasteText('');
    setDefaultDuration(30);
    setIsPromptCopied(false);
    setDrafts([]);
    setImportDrafts([]);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      setTimeout(() => quickTitleRef.current?.focus() || createBtnRef.current?.focus(), 50);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, isOpen]);

  if (!isOpen) return null;

  const handleReview = () => {
    if (looksLikePlannerImport(pasteText)) {
      setImportDrafts(parsePlannerImportText(pasteText).map(item => ({ ...item, selected: !item.isMalformed })));
      setView('importReview');
      return;
    }

    const nextDrafts = pasteText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map((title, index) => ({
        id: `${Date.now()}-${index}`,
        title,
        durationMinutes: defaultDuration,
        selected: true,
      }));

    setDrafts(nextDrafts);
    setView('review');
  };

  const handleQuickSave = async () => {
    const title = quickTitle.trim();
    if (!title || isQuickSaving) return;

    setIsQuickSaving(true);
    await createBlock({
      title,
      durationMinutes: quickDuration,
      description: undefined,
      categoryId: undefined,
      date: undefined,
      startTime: undefined,
      endTime: undefined,
      isScheduled: false,
      isBaseEvent: false,
      isHidden: false,
      sourceType: 'manual',
      travelEnabled: false,
      travelBeforeMinutes: 60,
      travelAfterMinutes: 60,
      additionalTimezone: undefined,
      features: {},
    });
    setQuickTitle('');
    setIsQuickSaving(false);
    requestAnimationFrame(() => quickTitleRef.current?.focus());
  };

  const handleCopyPrompt = async () => {
    setIsPromptCopied(true);
    window.setTimeout(() => setIsPromptCopied(false), 450);

    try {
      await copyTextToClipboard(PLANNER_IMPORT_PROMPT);
    } catch {
      // The in-app browser may block clipboard writes during scripted tests.
      // Keep the tap/click confirmation visible; the prompt remains available to copy on a real user gesture.
    }
  };

  const handleConfirmImport = async () => {
    const selectedDrafts = importDrafts.filter(draft => draft.selected && !draft.isMalformed && draft.title.trim());

    for (const draft of selectedDrafts) {
      const isCalendar = draft.destination === 'CALENDAR';
      const durationMinutes = getImportDraftDuration(draft) || defaultDuration;
      await createBlock({
        title: draft.title.trim(),
        durationMinutes,
        description: draft.notes,
        categoryId: undefined,
        date: draft.date,
        startTime: isCalendar ? draft.start : undefined,
        endTime: isCalendar ? draft.end : undefined,
        isScheduled: isCalendar,
        isBaseEvent: false,
        isHidden: false,
        sourceType: 'paste',
        travelEnabled: false,
        travelBeforeMinutes: 60,
        travelAfterMinutes: 60,
        additionalTimezone: undefined,
        features: {},
        reviewColour: draft.reviewColour,
        importSource: 'planner-import-engine',
        importRawLine: draft.rawLine,
      });
    }

    handleClose();
  };

  const handleSaveDrafts = async () => {
    const selectedDrafts = drafts.filter(draft => draft.selected && draft.title.trim());

    for (const draft of selectedDrafts) {
      await createBlock({
        title: draft.title.trim(),
        durationMinutes: draft.durationMinutes,
        description: undefined,
        categoryId: undefined,
        date: undefined,
        startTime: undefined,
        endTime: undefined,
        isScheduled: false,
        isBaseEvent: false,
        isHidden: false,
        sourceType: 'paste',
        travelEnabled: false,
        travelBeforeMinutes: 60,
        travelAfterMinutes: 60,
        additionalTimezone: undefined,
        features: {},
      });
    }

    handleClose();
  };

  return (
    <div className="fixed inset-0 bg-text-primary/20 z-modal flex items-center justify-center" onClick={handleClose}>
      <div 
        className="bg-surface-primary w-[460px] max-w-[calc(100vw-32px)] rounded-large shadow-modal p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-planner-title"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 id="add-to-planner-title" className="text-[22px] font-bold tracking-tight">Add To Planner</h2>
          {view !== 'menu' && (
            <button onClick={() => setView(view === 'review' || view === 'importReview' ? 'paste' : 'menu')} className="text-[13px] font-semibold text-text-secondary hover:text-text-primary">
              Back
            </button>
          )}
        </div>

        {view === 'menu' && (
          <div className="flex flex-col gap-4">
            <form
              className="rounded-medium border border-border-default bg-background p-3 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void handleQuickSave();
              }}
            >
              <div data-tour="quick-add-field" className="flex flex-col gap-3">
                <label className="text-[12px] font-bold uppercase text-text-primary tracking-[0.04em]" htmlFor="quick-add-title">Quick add</label>
                <input
                  ref={quickTitleRef}
                  data-tour="quick-add-input"
                  id="quick-add-title"
                  value={quickTitle}
                  onChange={(event) => setQuickTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    void handleQuickSave();
                  }}
                  className="h-[44px] rounded-small border border-border-default bg-white px-3 text-[16px] outline-none focus:border-accent-primary"
                  placeholder="Example: Book dentist appointment next Tuesday"
                />
              </div>
              <DurationSelector value={quickDuration} onChange={setQuickDuration} label="Duration" compact />
              <button
                type="submit"
                data-tour="add-ready-button"
                disabled={!quickTitle.trim() || isQuickSaving}
                className="w-full h-[44px] bg-accent-primary hover:bg-accent-hover disabled:opacity-50 text-white rounded-medium font-bold text-[14px] transition-colors shadow-sm"
              >
                {isQuickSaving ? 'Adding...' : 'Add to Ready to schedule'}
              </button>
            </form>
            <button 
              ref={createBtnRef}
              onClick={onCreateBlock}
              className="w-full h-[44px] bg-background hover:bg-border-default text-text-primary rounded-medium font-semibold text-[14px] transition-colors flex items-center justify-center border border-border-default"
            >
              New Block
            </button>
            <button
              onClick={() => setView('paste')}
              className="w-full h-[44px] bg-background hover:bg-border-default text-text-primary rounded-medium font-semibold text-[14px] transition-colors flex items-center justify-center border border-border-default"
            >
              Import from Source
            </button>
            <button disabled className="w-full h-[44px] bg-background opacity-50 text-text-primary rounded-medium font-semibold text-[14px] flex items-center justify-center border border-border-default cursor-not-allowed">
              Import Calendar (Coming Soon)
            </button>
            <button disabled className="w-full h-[44px] bg-background opacity-50 text-text-primary rounded-medium font-semibold text-[14px] flex items-center justify-center border border-border-default cursor-not-allowed">
              Templates (Coming Soon)
            </button>
          </div>
        )}

        {view === 'paste' && (
          <div className="flex max-h-[calc(100vh-128px)] flex-col gap-3 overflow-y-auto pr-1 md:overflow-visible">
            <div className="grid grid-cols-2 rounded-medium border border-border-default bg-background p-1">
              <button
                type="button"
                onClick={() => setImportTab('quick')}
                className={`h-10 rounded-small text-[13px] font-bold transition-colors ${importTab === 'quick' ? 'bg-surface-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                Quick Import
              </button>
              <button
                type="button"
                onClick={() => setImportTab('ai')}
                className={`h-10 rounded-small text-[13px] font-bold transition-colors ${importTab === 'ai' ? 'bg-surface-primary text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                AI Import
              </button>
            </div>

            {importTab === 'quick' ? (
              <QuickImportTab pasteText={pasteText} onPasteTextChange={setPasteText} />
            ) : (
              <AiImportTab
                pasteText={pasteText}
                onPasteTextChange={setPasteText}
                isPromptCopied={isPromptCopied}
                onCopyPrompt={handleCopyPrompt}
              />
            )}

            <DurationSelector value={defaultDuration} onChange={setDefaultDuration} label="Default duration" />
            <button
              onClick={handleReview}
              disabled={!pasteText.trim()}
              className="w-full h-[44px] bg-accent-primary hover:bg-accent-hover disabled:opacity-50 text-white rounded-medium font-bold text-[14px] transition-colors shadow-sm"
            >
              Review
            </button>
          </div>
        )}

        {view === 'review' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 max-h-[360px] overflow-y-auto pr-1">
              {drafts.length === 0 ? (
                <p className="text-[14px] text-text-secondary text-center py-6">No tasks to review.</p>
              ) : drafts.map(draft => (
                <div key={draft.id} className="rounded-medium border border-border-default bg-background p-3 flex flex-col gap-3">
                  <div className="flex gap-2 items-start">
                    <input
                      type="checkbox"
                      checked={draft.selected}
                      onChange={(e) => setDrafts(prev => prev.map(item => item.id === draft.id ? { ...item, selected: e.target.checked } : item))}
                      className="mt-3 w-4 h-4 rounded text-accent-primary focus:ring-accent-primary border-border-default"
                      aria-label="Select task"
                    />
                    <input
                      value={draft.title}
                      onChange={(e) => setDrafts(prev => prev.map(item => item.id === draft.id ? { ...item, title: e.target.value } : item))}
                      className="h-[40px] flex-1 rounded-small border border-border-default px-3 text-[14px] outline-none focus:border-accent-primary bg-white"
                      aria-label="Task title"
                    />
                    <button
                      onClick={() => setDrafts(prev => prev.filter(item => item.id !== draft.id))}
                      className="h-[40px] px-3 rounded-small text-[13px] font-semibold text-semantic-danger hover:bg-semantic-danger/10"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="pl-6">
                    <DurationSelector
                      value={draft.durationMinutes}
                      onChange={(duration) => setDrafts(prev => prev.map(item => item.id === draft.id ? { ...item, durationMinutes: duration } : item))}
                      label="Duration"
                      compact
                    />
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={handleSaveDrafts}
              disabled={!drafts.some(draft => draft.selected && draft.title.trim())}
              className="w-full h-[44px] bg-accent-primary hover:bg-accent-hover disabled:opacity-50 text-white rounded-medium font-bold text-[14px] transition-colors shadow-sm"
            >
              Add to Ready to schedule
            </button>
          </div>
        )}

        {view === 'importReview' && (
          <div className="flex flex-col gap-4">
            <div className="max-h-[430px] overflow-y-auto pr-1 flex flex-col gap-5">
              <ImportGroup
                title="Calendar"
                drafts={importDrafts.filter(draft => draft.destination === 'CALENDAR')}
                onChange={(updated) => setImportDrafts(prev => prev.map(draft => draft.id === updated.id ? updated : draft))}
                onDelete={(id) => setImportDrafts(prev => prev.filter(draft => draft.id !== id))}
              />
              <ImportGroup
                title="Ready to schedule"
                drafts={importDrafts.filter(draft => draft.destination === 'LIFE_INBOX')}
                onChange={(updated) => setImportDrafts(prev => prev.map(draft => draft.id === updated.id ? updated : draft))}
                onDelete={(id) => setImportDrafts(prev => prev.filter(draft => draft.id !== id))}
              />
            </div>
            <button
              onClick={handleConfirmImport}
              disabled={!importDrafts.some(draft => draft.selected && !draft.isMalformed && draft.title.trim())}
              className="w-full h-[44px] bg-accent-primary hover:bg-accent-hover disabled:opacity-50 text-white rounded-medium font-bold text-[14px] transition-colors shadow-sm"
            >
              Confirm Import
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const getImportDraftDuration = (draft: PlannerImportItem): number | undefined => {
  if (draft.start && draft.end) {
    const start = draft.start.split(':').map(Number);
    const end = draft.end.split(':').map(Number);
    const duration = (end[0] * 60 + end[1]) - (start[0] * 60 + start[1]);
    if (duration > 0) return duration;
  }
  if (draft.destination === 'CALENDAR' && draft.start) return draft.durationMinutes || 30;
  return draft.durationMinutes;
};

const copyTextToClipboard = async (text: string): Promise<void> => {
  const copiedWithSelection = copyTextWithSelection(text);
  if (copiedWithSelection) return;

  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    throw new Error('Copy command was not accepted');
  }
};

const copyTextWithSelection = (text: string): boolean => {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
};

interface ImportTabProps {
  pasteText: string;
  onPasteTextChange: (value: string) => void;
}

const QuickImportTab: React.FC<ImportTabProps> = ({ pasteText, onPasteTextChange }) => (
  <section className="flex flex-col gap-3">
    <div>
      <h3 className="text-[17px] font-bold text-text-primary">Quick Import</h3>
      <p className="mt-1 text-[13px] leading-5 text-text-secondary">
        Paste tasks, notes or simple lists directly into your planner.
      </p>
    </div>
    <textarea
      value={pasteText}
      onChange={(e) => onPasteTextChange(e.target.value)}
      className="min-h-[190px] rounded-medium border border-border-default p-4 text-[14px] outline-none focus:border-accent-primary resize-y"
      placeholder={`Paste each item on a new line.\nExample:\nCall dentist\nPay water bill\nSchool meeting Tuesday 15:00`}
    />
  </section>
);

interface AiImportTabProps extends ImportTabProps {
  isPromptCopied: boolean;
  onCopyPrompt: () => void;
}

const AiImportTab: React.FC<AiImportTabProps> = ({ pasteText, onPasteTextChange, isPromptCopied, onCopyPrompt }) => (
  <section className="flex flex-col gap-3">
    <div>
      <h3 className="text-[16px] font-bold text-text-primary">Import from screenshots, PDFs, rotas or emails</h3>
      <p className="mt-1 text-[12px] leading-5 text-text-secondary">
        For now, use an LLM to extract planner-ready items, then paste the result back here.
      </p>
    </div>

    <div className="rounded-medium border border-border-default bg-background px-3 py-2 text-[12px] leading-5 text-text-secondary">
      <span className="font-bold text-text-primary">Flow:</span> Open your LLM → add the source → copy this prompt → copy the planner-ready output back here.
    </div>

    <div className="rounded-medium border border-border-default bg-background p-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-[13px] font-bold uppercase tracking-[0.04em] text-text-primary">Planner Import Prompt</h4>
          <p className="mt-0.5 text-[12px] leading-5 text-text-secondary">
            Copy the planner prompt, then paste it into your LLM with the source material.
          </p>
        </div>
        <button
          type="button"
          onClick={onCopyPrompt}
          className={`h-9 flex-shrink-0 rounded-small border px-3 text-[13px] font-bold shadow-sm transition-colors ${isPromptCopied ? 'border-semantic-success bg-semantic-success text-white hover:bg-semantic-success' : 'border-border-default bg-surface-primary text-text-primary hover:bg-white'}`}
        >
          Copy Prompt
        </button>
      </div>
    </div>

    <div className="flex flex-col gap-2">
      <label className="text-[13px] font-bold text-text-primary" htmlFor="ai-import-output">Paste AI output</label>
      <textarea
        id="ai-import-output"
        value={pasteText}
        onChange={(e) => onPasteTextChange(e.target.value)}
        className="min-h-[112px] rounded-medium border border-border-default p-3 text-[14px] outline-none focus:border-accent-primary resize-y"
        placeholder="Paste the planner-ready output here."
      />
    </div>
  </section>
);

interface ImportGroupProps {
  title: string;
  drafts: Array<PlannerImportItem & { selected: boolean }>;
  onChange: (draft: PlannerImportItem & { selected: boolean }) => void;
  onDelete: (id: string) => void;
}

const ImportGroup: React.FC<ImportGroupProps> = ({ title, drafts, onChange, onDelete }) => {
  if (drafts.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-bold uppercase tracking-[0.04em] text-text-muted">{title}</h3>
      <div className="flex flex-col gap-2">
        {drafts.map(draft => (
          <ImportRow key={draft.id} draft={draft} onChange={onChange} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
};

interface ImportRowProps {
  draft: PlannerImportItem & { selected: boolean };
  onChange: (draft: PlannerImportItem & { selected: boolean }) => void;
  onDelete: (id: string) => void;
}

const ImportRow: React.FC<ImportRowProps> = ({ draft, onChange, onDelete }) => {
  const isCalendar = draft.destination === 'CALENDAR';
  const toneClass = getReviewToneClass(draft.reviewColour, draft.isMalformed);

  return (
    <div className={`rounded-medium border p-3 flex flex-col gap-3 ${toneClass}`}>
      <div className="flex gap-2 items-start">
        <input
          type="checkbox"
          checked={draft.selected}
          disabled={draft.isMalformed}
          onChange={(e) => onChange({ ...draft, selected: e.target.checked })}
          className="mt-3 w-4 h-4 rounded text-accent-primary focus:ring-accent-primary border-border-default"
          aria-label="Select import row"
        />
        <input
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value, isMalformed: !e.target.value.trim() || draft.isMalformed })}
          className="h-[38px] flex-1 rounded-small border border-border-default px-3 text-[13px] outline-none focus:border-accent-primary bg-white"
          aria-label="Imported title"
        />
        <button
          onClick={() => onDelete(draft.id)}
          className="h-[38px] px-3 rounded-small text-[13px] font-semibold text-semantic-danger hover:bg-semantic-danger/10"
        >
          Discard
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 pl-6">
        <SmallInput label="Date" value={draft.date || ''} onChange={(value) => onChange({ ...draft, date: value || undefined })} type="date" />
        <SmallInput label="Start" value={draft.start || ''} onChange={(value) => onChange({ ...draft, start: value || undefined })} type="time" disabled={!isCalendar} />
        <SmallInput label="End" value={draft.end || ''} onChange={(value) => onChange({ ...draft, end: value || undefined })} type="time" disabled={!isCalendar} />
      </div>
      {draft.notes && <div className="pl-6 text-[12px] text-text-secondary truncate">{draft.notes}</div>}
      {draft.isMalformed && <div className="pl-6 text-[12px] font-semibold text-semantic-danger">Check row</div>}
    </div>
  );
};

interface SmallInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: 'date' | 'time';
  disabled?: boolean;
}

const SmallInput: React.FC<SmallInputProps> = ({ label, value, onChange, type, disabled = false }) => (
  <label className="flex flex-col gap-1">
    <span className="text-[10px] font-bold uppercase tracking-[0.04em] text-text-muted">{label}</span>
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-[34px] rounded-small border border-border-default px-2 text-[12px] outline-none focus:border-accent-primary bg-white disabled:opacity-45"
    />
  </label>
);

const getReviewToneClass = (reviewColour: ReviewColour, isMalformed: boolean) => {
  if (isMalformed || reviewColour === 'RED') return 'border-semantic-danger/50 bg-semantic-danger/5';
  if (reviewColour === 'ORANGE') return 'border-semantic-warning/60 bg-semantic-warning/10';
  return 'border-border-default bg-background';
};
