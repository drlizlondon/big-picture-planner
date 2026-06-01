export const formatDurationLabel = (minutes: number): string => {
  if (minutes < 60) return `${minutes} mins`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const hourLabel = hours === 1 ? '1 hour' : `${hours} hours`;

  if (remainingMinutes === 0) return hourLabel;
  return `${hourLabel} ${remainingMinutes} mins`;
};
