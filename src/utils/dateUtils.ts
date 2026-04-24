export const formatRelativeDate = (timestamp: number | null): string => {
  if (timestamp === null) return '';
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.round((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    const isSameYear = date.getFullYear() === now.getFullYear();
    if (isSameYear) {
      return date.toLocaleString(undefined, { month: 'short', day: 'numeric' });
    } else {
      return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }
  } catch (e) {
    return new Date(timestamp).toLocaleDateString(); // Fallback to a simple date string if parsing fails
  }
};

export const formatTranscriptTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const date = new Date(0);
  date.setSeconds(seconds);
  const timeString = date.toISOString().slice(11, 19);
  // Remove leading '00:' for hours if video is less than an hour
  if (timeString.startsWith('00:')) {
    return timeString.slice(3);
  }
  return timeString;
};

export const formatDuration = formatTranscriptTime;
