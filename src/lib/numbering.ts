import type { PointType, SurveyPoint } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

const PREFIX: Record<PointType, string> = {
  robinet: 'R',
  sudura: 'S',
  cot: 'C',
  flansa: 'F',
  conducta: 'T',
  alt: 'P',
};

export function prefixFor(type: PointType): string {
  return type === 'conducta' ? 'T' : PREFIX[type];
}

/** Extrage numărul din cod: R03 -> 3, R03-S07 -> 7 pentru suduri. */
function numberOf(code: string, type: PointType): number | undefined {
  if (type === 'sudura') {
    const m = code.match(/S(\d+)$/i);
    return m ? Number(m[1]) : undefined;
  }
  const m = code.match(new RegExp(`^${prefixFor(type)}(\\d+)$`, 'i'));
  return m ? Number(m[1]) : undefined;
}

export function nextNumber(points: SurveyPoint[], type: PointType): number {
  let max = 0;
  for (const p of points) {
    if (p.type !== type) continue;
    const n = numberOf(p.code, type);
    if (n && n > max) max = n;
  }
  return max + 1;
}

export function formatCode(type: PointType, n: number): string {
  return `${prefixFor(type)}${n}`;
}

export function nextCode(points: SurveyPoint[], type: PointType): string {
  return formatCode(type, nextNumber(points, type));
}

/** Cod pentru sudura unui robinet: R01-S03. */
export function weldCodeForValve(valveCode: string, weldNumber: number): string {
  return `${valveCode}-S${pad(weldNumber)}`;
}

export function findDuplicates(points: SurveyPoint[]): Set<string> {
  const seen = new Map<string, number>();
  for (const p of points) {
    const k = p.code.trim().toLowerCase();
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  const dup = new Set<string>();
  for (const p of points) if ((seen.get(p.code.trim().toLowerCase()) ?? 0) > 1) dup.add(p.id);
  return dup;
}

export function isCodeTaken(points: SurveyPoint[], code: string, exceptId?: string): boolean {
  const k = code.trim().toLowerCase();
  return points.some((p) => p.id !== exceptId && p.code.trim().toLowerCase() === k);
}

/** Face codul unic prin adăugarea unui sufix, dacă este deja folosit. */
export function uniqueCode(points: SurveyPoint[], code: string): string {
  if (!isCodeTaken(points, code)) return code;
  let i = 2;
  while (isCodeTaken(points, `${code}_${i}`)) i++;
  return `${code}_${i}`;
}

export function reorder(points: SurveyPoint[]): SurveyPoint[] {
  return [...points].sort((a, b) => a.order - b.order).map((p, i) => ({ ...p, order: i + 1 }));
}

export function moveBefore(points: SurveyPoint[], id: string, dir: -1 | 1): SurveyPoint[] {
  const sorted = reorder(points);
  const i = sorted.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return sorted;
  [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  return sorted.map((p, k) => ({ ...p, order: k + 1 }));
}

/**
 * Renumerotează codurile automate după ordinea curentă: robineții R01.., sudurile consecutiv
 * (R01-S01, R01-S02, R02-S03 ...), celelalte elemente cu prefixul lor. Codurile personalizate rămân.
 */
export function renumber(points: SurveyPoint[]): SurveyPoint[] {
  const sorted = reorder(points);
  const byId = new Map(sorted.map((p) => [p.id, { ...p }]));
  const counters: Record<PointType, number> = { robinet: 0, sudura: 0, cot: 0, flansa: 0, conducta: 0, alt: 0 };
  const taken = new Set(sorted.filter((p) => p.customCode).map((p) => p.code.toLowerCase()));
  const next = (type: PointType): number => {
    let n: number;
    do {
      n = ++counters[type];
    } while (type !== 'sudura' && taken.has(formatCode(type, n).toLowerCase()));
    return n;
  };
  // Robineții primii, pentru ca sudurile atașate să poată folosi codul lor.
  for (const p of sorted) {
    if (p.type === 'robinet' && !p.customCode) byId.get(p.id)!.code = formatCode('robinet', next('robinet'));
  }
  for (const p of sorted) {
    const q = byId.get(p.id)!;
    if (p.customCode || p.type === 'robinet') continue;
    const n = next(p.type);
    if (p.type === 'sudura' && p.valveId && byId.has(p.valveId)) q.code = weldCodeForValve(byId.get(p.valveId)!.code, n);
    else q.code = formatCode(p.type, n);
  }
  // Codurile derivate (suduri atașate unor robineți personalizați) se actualizează și ele.
  return sorted.map((p) => byId.get(p.id)!);
}
