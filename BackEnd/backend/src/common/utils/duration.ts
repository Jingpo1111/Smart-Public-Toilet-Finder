const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

/**
 * Parses durations such as "15m", "7d", "3600" (seconds) or "45s" into whole seconds.
 * Throws on invalid input so misconfiguration is caught at startup.
 */
export function parseDurationToSeconds(value: string): number {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = /^(\d+)\s*([smhdw])$/i.exec(trimmed);
  if (!match) throw new Error(`Invalid duration "${value}". Use e.g. 900, 15m, 12h or 7d.`);
  return Number(match[1]) * UNIT_SECONDS[match[2].toLowerCase()];
}
