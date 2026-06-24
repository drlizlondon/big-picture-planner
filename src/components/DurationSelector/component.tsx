import React, { useState } from 'react';
import { formatDurationLong } from '../../utils/durationLabels';

const DURATION_OPTIONS = [
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '45 minutes', value: 45 },
  { label: '1 hour', value: 60 },
  { label: '1 hour 30 minutes', value: 90 },
  { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 },
  { label: '4 hours', value: 240 },
  { label: '6 hours', value: 360 },
  { label: '8 hours', value: 480 },
];

interface Props {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  compact?: boolean;
}

/**
 * Duration picker. Presets and the custom controls are all human-readable
 * (hours + minutes) — the user never edits a raw minute count like "600".
 * The component still emits a total minute value for internal storage.
 */
export const DurationSelector: React.FC<Props> = ({ value, onChange, label = 'Duration', compact = false }) => {
  const isPreset = DURATION_OPTIONS.some(option => option.value === value);
  const [manualCustomMode, setManualCustomMode] = useState(!isPreset);
  const customMode = manualCustomMode || !isPreset;
  const selectedValue = !customMode && isPreset ? String(value) : 'custom';

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === 'custom') {
      setManualCustomMode(true);
      onChange(isPreset ? value : Math.max(5, value || 15));
      return;
    }
    setManualCustomMode(false);
    onChange(Number(e.target.value));
  };

  const setParts = (nextHours: number, nextMinutes: number) => {
    const total = Math.max(5, nextHours * 60 + nextMinutes);
    onChange(total);
  };

  const inputClass = `${compact ? 'h-[36px] text-[13px]' : 'h-[44px] text-[14px]'} rounded-medium border border-border-default px-3 outline-none focus:border-accent-primary bg-white`;

  return (
    <div className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
      <label className="text-[12px] font-bold uppercase text-text-primary tracking-[0.04em]">{label}</label>
      <select value={selectedValue} onChange={handleSelectChange} className={inputClass}>
        {DURATION_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
        <option value="custom">Custom…</option>
      </select>
      {customMode && (
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold text-text-secondary">Hours</span>
            <input
              type="number" min="0" max="23" step="1" value={hours}
              onChange={(e) => setParts(Math.max(0, Number(e.target.value) || 0), minutes)}
              className={inputClass}
              aria-label="Duration hours"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] font-semibold text-text-secondary">Minutes</span>
            <select
              value={minutes}
              onChange={(e) => setParts(hours, Number(e.target.value))}
              className={inputClass}
              aria-label="Duration minutes"
            >
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <span data-testid="duration-readout" className="text-[12px] font-semibold text-text-secondary">{formatDurationLong(value)}</span>
    </div>
  );
};
