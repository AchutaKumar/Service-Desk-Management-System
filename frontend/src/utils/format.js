/** Date, time and number formatting helpers. */

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function relativeTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const seconds = Math.round(abs / 1000);
  if (seconds < 60) return rtf.format(diffMs > 0 ? seconds : -seconds, 'second');
  const minutes = Math.round(abs / 60000);
  if (minutes < 60) return rtf.format(diffMs > 0 ? minutes : -minutes, 'minute');
  const hours = Math.round(abs / 3600000);
  if (hours < 24) return rtf.format(diffMs > 0 ? hours : -hours, 'hour');
  const days = Math.round(abs / 86400000);
  if (days < 30) return rtf.format(diffMs > 0 ? days : -days, 'day');
  return formatDate(value);
}

/** Remaining time until due date, e.g. "5h 20m left" or "3d left". */
export function timeUntil(value) {
  if (!value) return '';
  const diff = new Date(value).getTime() - Date.now();
  if (Number.isNaN(diff)) return '';
  if (diff <= 0) return 'past due';
  const minutes = Math.floor(diff / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}
