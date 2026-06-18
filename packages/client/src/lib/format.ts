/** Format a millisecond duration as H:MM:SS (or M:SS under an hour). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Format a kbit/s bitrate with a Mb/s rollover. */
export function formatBitrate(kbits: number): string {
  if (kbits >= 1000) return `${(kbits / 1000).toFixed(1)} Mb/s`;
  return `${Math.round(kbits)} kb/s`;
}

/** Percentage of dropped frames, 0 when no frames yet. */
export function droppedPercent(skipped: number, total: number): number {
  if (total <= 0) return 0;
  return (skipped / total) * 100;
}
