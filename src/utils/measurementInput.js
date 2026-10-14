// Older templates label heights as meters even when users enter centimeters.
export function parseMeasurementHeight(raw, unit = '') {
  if (raw == null || String(raw).trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  // Four-digit whole numbers are heights with three implied decimal places
  // in meters (1025 -> 1.025), used by existing measurement workbooks.
  const impliedMeters = /^\d{3,4}$/.test(String(raw).trim()) && value >= 300 && value <= 3000;
  const meters = impliedMeters ? value / 1000 : value > 3 ? value / 100
    : unit === 'cm' ? value / 100 : value;
  return meters >= 0.3 && meters <= 3 ? meters : null;
}

export function parseMeasurementWeight(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
