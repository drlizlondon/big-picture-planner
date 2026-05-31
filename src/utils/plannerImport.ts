import type { ReviewColour } from '../types/models';

export type ImportDestination = 'CALENDAR' | 'LIFE_INBOX';

export interface PlannerImportItem {
  id: string;
  rawLine: string;
  destination: ImportDestination;
  title: string;
  date?: string;
  start?: string;
  end?: string;
  durationMinutes?: number;
  reviewColour: ReviewColour;
  notes?: string;
  isMalformed: boolean;
}

const REVIEW_COLOURS: ReviewColour[] = ['GREEN', 'ORANGE', 'RED'];

export const parsePlannerImportText = (text: string): PlannerImportItem[] => {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => parsePlannerImportLine(line, index));
};

export const looksLikePlannerImport = (text: string): boolean => {
  return text.split('\n').some(line => line.includes('|'));
};

export const parsePlannerImportLine = (line: string, index: number): PlannerImportItem => {
  const parts = line.split('|').map(part => part.trim());
  const [destinationRaw, titleRaw, dateRaw, startRaw, endRaw, durationRaw, reviewColourRaw, ...notesParts] = parts;
  const destination = normalizeDestination(destinationRaw);
  const reviewColour = normalizeReviewColour(reviewColourRaw);
  const date = normalizeDate(dateRaw);
  const start = normalizeTime(startRaw);
  const end = normalizeTime(endRaw);
  const durationFromText = parseDurationMinutes(durationRaw);
  const notes = notesParts.join(' | ').trim() || undefined;
  const durationFromTimes = start && end ? minutesBetween(start, end) : undefined;
  const durationMinutes = durationFromTimes || durationFromText || (destination === 'CALENDAR' && start ? 30 : durationFromText);

  const isMalformed =
    parts.length < 7 ||
    !destination ||
    !titleRaw?.trim() ||
    (destination === 'CALENDAR' && (!date || !start || !durationMinutes));

  return {
    id: `import-${Date.now()}-${index}`,
    rawLine: line,
    destination: destination || 'LIFE_INBOX',
    title: titleRaw?.trim() || 'Check row',
    date,
    start,
    end: end || (start && durationMinutes ? addMinutesToTime(start, durationMinutes) : undefined),
    durationMinutes,
    reviewColour,
    notes,
    isMalformed,
  };
};

export const parseDurationMinutes = (value?: string): number | undefined => {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) return undefined;

  const hourMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?$/);
  if (hourMatch) return Math.round(Number(hourMatch[1]) * 60);

  const minuteMatch = trimmed.match(/^(\d+)\s*m(?:in(?:ute)?s?)?$/);
  if (minuteMatch) return Number(minuteMatch[1]);

  const plainNumber = trimmed.match(/^(\d+)$/);
  if (plainNumber) return Number(plainNumber[1]);

  return undefined;
};

const normalizeDestination = (value?: string): ImportDestination | undefined => {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'CALENDAR' || normalized === 'LIFE_INBOX') return normalized;
  return undefined;
};

const normalizeReviewColour = (value?: string): ReviewColour => {
  const normalized = value?.trim().toUpperCase() as ReviewColour;
  return REVIEW_COLOURS.includes(normalized) ? normalized : 'RED';
};

const normalizeDate = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return trimmed;

  const ukMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!ukMatch) return undefined;

  const [, day, month, year] = ukMatch;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const normalizeTime = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const minutesBetween = (start: string, end: string): number | undefined => {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (endMinutes <= startMinutes) return undefined;
  return endMinutes - startMinutes;
};

const addMinutesToTime = (start: string, durationMinutes: number): string | undefined => {
  const next = timeToMinutes(start) + durationMinutes;
  if (next > 24 * 60) return undefined;
  const hours = Math.floor(next / 60);
  const minutes = next % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};
