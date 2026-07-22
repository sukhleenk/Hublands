/* Small survey-chart flavor. */
export function chartCoords(x: number, y: number): string {
  const lat = Math.abs(y * 60).toFixed(1) + "°" + (y >= 0 ? "N" : "S");
  const lon = Math.abs(x * 120).toFixed(1) + "°" + (x >= 0 ? "E" : "W");
  return `${lat} ${lon}`;
}

export const SOUNDING_LINES = [
  "Sounding the depths…",
  "Calibrating the sextant…",
  "Consulting the tide tables…",
  "Waiting for fair weather…",
  "Taking bearings…",
];

export function soundingLine(): string {
  return SOUNDING_LINES[Math.floor(Math.random() * SOUNDING_LINES.length)];
}
