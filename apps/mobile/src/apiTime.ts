export function parseApiTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NaN;

  const raw = value.trim();
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return direct;

  let normalized = raw.replace(' ', 'T');
  // PostgreSQL often serializes UTC as +00, while Hermes is happiest with +00:00.
  normalized = normalized.replace(/([+-]\d{2})$/, '$1:00');
  normalized = normalized.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function countdownParts(startedAt: string, completesAt: string, now = Date.now()) {
  const start = parseApiTimestamp(startedAt);
  const end = parseApiTimestamp(completesAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { valid: false, remainingSeconds: 0, progress: 0, totalSeconds: 0 };
  }

  const totalMs = end - start;
  return {
    valid: true,
    remainingSeconds: Math.max(0, (end - now) / 1000),
    progress: Math.max(0, Math.min(1, (now - start) / totalMs)),
    totalSeconds: totalMs / 1000,
  };
}

export function formatResearchClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
