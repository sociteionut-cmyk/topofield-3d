import type { SurveyPoint } from '../types';
import { TYPE_LABEL } from '../types';

export type Sep = ';' | ',' | '\t';

export function detectSeparator(text: string): Sep {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  const score = (sep: string) => {
    const counts = lines.map((l) => l.split(sep).length - 1);
    if (!counts.length || counts[0] === 0) return -1;
    const consistent = counts.every((c) => c === counts[0]);
    return counts[0] + (consistent ? 100 : 0);
  };
  const cands: Sep[] = [';', '\t', ','];
  let best: Sep = ';';
  let bestScore = -2;
  for (const c of cands) {
    const s = score(c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

export function parseCsv(text: string, sep: Sep): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQ) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

/** Normalizează un număr cu virgulă sau punct zecimal la text cu punct, fără a modifica cifrele. */
export function normalizeDecimal(s: string): string {
  const t = s.trim().replace(/\s/g, '');
  if (/^-?\d+,\d+$/.test(t)) return t.replace(',', '.');
  if (/^-?\d+(\.\d+)?$/.test(t)) return t;
  return '';
}

export function looksNumeric(s: string): boolean {
  return normalizeDecimal(s) !== '';
}

export function hasHeader(rows: string[][]): boolean {
  if (!rows.length) return false;
  const first = rows[0];
  const numericCells = first.filter(looksNumeric).length;
  return numericCells < Math.max(2, Math.ceil(first.length / 2));
}

export interface ColumnMap {
  gpsNo: number;
  n: number;
  e: number;
  z: number;
  code: number;
}

export function guessColumns(rows: string[][], header: boolean): ColumnMap {
  const map: ColumnMap = { gpsNo: 0, n: 1, e: 2, z: 3, code: 4 };
  const cols = rows[0]?.length ?? 0;
  if (header) {
    const names = rows[0].map((h) => h.toLowerCase().replace(/[^a-zăâîșşțţ0-9]/g, ''));
    const find = (re: RegExp) => names.findIndex((h) => re.test(h));
    const set = (key: keyof ColumnMap, idx: number) => {
      if (idx >= 0) map[key] = idx;
    };
    set('gpsNo', find(/^(nr|no|num|numar|numarpunct|punct|point|pointid|pointname|id|name|nume|pt)$/));
    set('n', find(/^(n|nord|north|northing|x)$/));
    set('e', find(/^(e|est|east|easting|y)$/));
    set('z', find(/^(z|cota|cot|h|elev|elevation|altitudine|height)$/));
    set('code', find(/^(cod|code|desc|descriere|description|feature)$/));
  }
  const used = new Set<number>();
  for (const k of Object.keys(map) as (keyof ColumnMap)[]) {
    if (map[k] >= cols) map[k] = -1;
    else used.add(map[k]);
  }
  return map;
}

export interface CsvPoint {
  gpsNo: string;
  n: string;
  e: string;
  z: string;
  code: string;
  uncertain: Array<'n' | 'e' | 'z'>;
}

export function rowsToPoints(rows: string[][], map: ColumnMap, header: boolean): CsvPoint[] {
  const out: CsvPoint[] = [];
  const get = (r: string[], i: number) => (i >= 0 && i < r.length ? r[i] : '');
  for (const r of header ? rows.slice(1) : rows) {
    const n = normalizeDecimal(get(r, map.n));
    const e = normalizeDecimal(get(r, map.e));
    const z = normalizeDecimal(get(r, map.z));
    const gpsNo = get(r, map.gpsNo).trim();
    if (!gpsNo && !n && !e && !z) continue;
    const uncertain: CsvPoint['uncertain'] = [];
    if (get(r, map.n) && !n) uncertain.push('n');
    if (get(r, map.e) && !e) uncertain.push('e');
    if (get(r, map.z) && !z) uncertain.push('z');
    out.push({ gpsNo, n, e, z, code: get(r, map.code), uncertain });
  }
  return out;
}

export interface ExportOptions {
  sep: Sep;
  decimal: '.' | ',';
}

function esc(v: string, sep: string): string {
  if (v.includes(sep) || /["\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export const CSV_HEADER = ['Număr GPS', 'Cod topografic', 'Tip punct', 'Nord X', 'Est Y', 'Cotă Z', 'Observații'];

export function pointsToCsv(points: SurveyPoint[], opt: ExportOptions): string {
  const dec = (s: string) => (opt.decimal === ',' ? s.replace('.', ',') : s);
  const lines = [CSV_HEADER.map((h) => esc(h, opt.sep)).join(opt.sep)];
  for (const p of [...points].sort((a, b) => a.order - b.order)) {
    lines.push(
      [p.gpsNo ?? '', p.code, TYPE_LABEL[p.type], dec(p.n), dec(p.e), dec(p.z), p.notes.replace(/\r?\n/g, ' ')]
        .map((v) => esc(v, opt.sep))
        .join(opt.sep),
    );
  }
  // BOM pentru ca Excel să recunoască diacriticele.
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
