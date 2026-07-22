const GOLDEN = 0.61803398875;

function shadeParams(id: number): { h: number; s: number; t: number } {
  const t = (id * GOLDEN) % 1;
  return {
    h: 158 + t * 50, // sea green -> azure
    s: 40 + ((id * GOLDEN * 2) % 1) * 18,
    t,
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const UNMAPPED: Record<"deep" | "chart", [number, number, number]> = {
  deep: [110, 122, 120],
  chart: [150, 143, 128],
};

export function l1Color(id: number, theme: "deep" | "chart"): [number, number, number] {
  if (id === 0) return UNMAPPED[theme];
  const { h, s, t } = shadeParams(id);
  return theme === "deep"
    ? hslToRgb(h, s + 8, 66 + t * 22) // pale tints, 66..88% light
    : hslToRgb(h, s, 30 + t * 16); // ink shades, 30..46% light
}

export function l1Css(id: number, theme: "deep" | "chart"): string {
  const [r, g, b] = l1Color(id, theme);
  return `rgb(${r} ${g} ${b})`;
}
