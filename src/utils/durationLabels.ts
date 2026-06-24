export const formatDurationLabel = (minutes: number): string => {
  if (minutes < 60) return `${minutes} mins`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const hourLabel = hours === 1 ? '1 hour' : `${hours} hours`;

  if (remainingMinutes === 0) return hourLabel;
  return `${hourLabel} ${remainingMinutes} mins`;
};

/**
 * Full human-readable duration for forms/labels: "30 minutes", "2 hours",
 * "8 hours 30 minutes", "10 hours". Never a raw minute count.
 */
export const formatDurationLong = (minutes: number): string => {
  if (!minutes || minutes <= 0) return '0 minutes';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (mins > 0) parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
  return parts.join(' ');
};
