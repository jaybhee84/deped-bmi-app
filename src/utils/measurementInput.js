// Older templates label heights as meters even when users enter centimeters.
export function parseMeasurementHeight(raw, unit = '') {
  if (raw == null || String(raw).trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  const meters = value > 3 ? value / 100
    : unit === 'cm' ? value / 100 : value;
  return meters >= 0.3 && meters <= 3 ? meters : null;
}

export function parseMeasurementWeight(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
