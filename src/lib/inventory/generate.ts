// Turns a tower's structure + series table into unit rows. Used by the admin structure screen and the seed.

export type TowerSpec = { code: string; floors: number; startFloor?: number; unitNumberFormat?: string };
export type SeriesSpec = {
  series: number;
  bhk?: string;
  typeLabel?: string;
  description?: string;
  facing?: string;
  direction?: string;
  view?: string;
  tier?: string;
  carpet?: number;
  balcony?: number;
  sbua?: number;
  uds?: number;
  corner?: boolean;
  tags?: string[];
  priceAttrs?: Record<string, number>;
};

/** "{tower}-{floor}{series:02}" with tower C, floor 14, series 1 → "C-1401"; floor 0 → "C-001". */
export function formatUnitNumber(format: string, tower: string, floor: number, series: number) {
  return format.replace(/\{(tower|floor|series)(?::(\d+))?\}/g, (_, key: string, pad?: string) => {
    const v = key === "tower" ? tower : String(key === "floor" ? floor : series);
    return pad ? v.padStart(Number(pad), "0") : v;
  });
}

export function generateUnits(tower: TowerSpec, series: SeriesSpec[]) {
  const format = tower.unitNumberFormat ?? "{tower}-{floor}{series:02}";
  const out = [];
  for (let floor = tower.startFloor ?? 0; floor <= tower.floors; floor++) {
    for (const s of series) out.push({ ...s, floor, number: formatUnitNumber(format, tower.code, floor, s.series) });
  }
  const seen = new Set<string>();
  for (const u of out) {
    if (seen.has(u.number)) throw new Error(`Unit number format produces duplicate "${u.number}"`);
    seen.add(u.number);
  }
  return out;
}

/** Floor label for display: 0 → "G", negatives → "B1", "B2". */
export const floorLabel = (f: number, ground = "G") => (f === 0 ? ground : f < 0 ? `B${-f}` : String(f));
