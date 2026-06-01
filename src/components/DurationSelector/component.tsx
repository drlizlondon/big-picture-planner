import React, { useState } from 'react';

const DURATION_OPTIONS = [
  { label: '15 mins', value: 15 },
  { label: '30 mins', value: 30 },
  { label: '45 mins', value: 45 },
  { label: '1 hour', value: 60 },
  { label: '1.5 hours', value: 90 },
  { label: '2 hours', value: 120 },
  { label: '3 hours', value: 180 },
];

interface Props {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  compact?: boolean;
}

export const DurationSelector: React.FC<Props> = ({ value, onChange, label = 'Duration', compact = false }) => {
  const isPreset = DURATION_OPTIONS.some(option => option.value === value);
  const [manualCustomMode, setManualCustomMode] = useState(!isPreset);
  const customMode = manualCustomMode || !isPreset;
  const selectedValue = !customMode && isPreset ? String(value) : 'custom';

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === 'custom') {
      setManualCustomMode(true);
      onChange(isPreset ? value : Math.max(5, value || 15));
      return;
    }
    setManualCustomMode(false);
    onChange(Number(e.target.value));
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  return (
    <div className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
      <label className="text-[12px] font-bold uppercase text-text-primary tracking-[0.04em]">{label}</label>
      <select
        value={selectedValue}
        onChange={handleSelectChange}
        className={`${compact ? 'h-[36px] text-[13px]' : 'h-[44px] text-[14px]'} rounded-medium border border-border-default px-3 outline-none focus:border-accent-primary bg-white`}
      >
        {DURATION_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
        <option value="custom">Custom</option>
      </select>
      {customMode && (
        <input
          type="number"
          value={value}
          onChange={handleCustomChange}
          className={`${compact ? 'h-[36px] text-[13px]' : 'h-[44px] text-[14px]'} rounded-medium border border-border-default px-3 outline-none focus:border-accent-primary bg-white`}
          min="5"
          step="5"
          aria-label="Custom duration in minutes"
        />
      )}
    </div>
  );
};
