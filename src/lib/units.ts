// Unit conversion is a *display* concern. Every number in Postgres is kg / cm
// / m / s; these functions run at the edge of the UI, on the way in and out of
// an input. Nothing here should ever be persisted.

export type WeightUnit = 'kg' | 'lb';
export type LengthUnit = 'cm' | 'in';
export type DistanceUnit = 'km' | 'mi';

const LB_PER_KG = 2.2046226218;
const IN_PER_CM = 0.3937007874;
const MI_PER_KM = 0.6213711922;

export const kgTo = (kg: number, u: WeightUnit) => (u === 'kg' ? kg : kg * LB_PER_KG);
export const toKg = (v: number, u: WeightUnit) => (u === 'kg' ? v : v / LB_PER_KG);

export const cmTo = (cm: number, u: LengthUnit) => (u === 'cm' ? cm : cm * IN_PER_CM);
export const toCm = (v: number, u: LengthUnit) => (u === 'cm' ? v : v / IN_PER_CM);

export const mTo = (m: number, u: DistanceUnit) =>
  u === 'km' ? m / 1000 : (m / 1000) * MI_PER_KM;
export const toM = (v: number, u: DistanceUnit) =>
  u === 'km' ? v * 1000 : (v / MI_PER_KM) * 1000;

/**
 * Round for display only. Two decimals max, but trailing zeros dropped, so a
 * clean 60 kg reads "60" and an lb conversion reads "132.28".
 */
export function trim(n: number, places = 2): string {
  return String(Number(n.toFixed(places)));
}

export const showWeight = (kg: number | null, u: WeightUnit) =>
  kg == null ? '' : trim(kgTo(kg, u));

export const showLength = (cm: number | null, u: LengthUnit) =>
  cm == null ? '' : trim(cmTo(cm, u));

/** `3725` -> `"1:02:05"`, `125` -> `"2:05"`. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Short human form for durations shown in a list: `"1h 12m"`, `"45m"`. */
export function formatDurationShort(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/**
 * Accepts `"90"`, `"1:30"` or `"1:02:05"` and returns seconds. Anything
 * unparseable is null rather than 0, so a typo can't silently log a zero.
 */
export function parseDuration(input: string): number | null {
  const parts = input.trim().split(':');
  if (parts.some((p) => p === '' || !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return Math.round(nums[0]);
  if (nums.length === 2) return Math.round(nums[0] * 60 + nums[1]);
  if (nums.length === 3) return Math.round(nums[0] * 3600 + nums[1] * 60 + nums[2]);
  return null;
}

/** Pace as min/km or min/mi — the number runners actually look at. */
export function formatPace(durationS: number, distanceM: number | null, u: DistanceUnit): string {
  if (!distanceM || distanceM <= 0) return '—';
  const dist = mTo(distanceM, u);
  const secPerUnit = durationS / dist;
  if (!isFinite(secPerUnit)) return '—';
  return `${formatDuration(secPerUnit)} /${u}`;
}
