export type Field = 'gpsNo' | 'n' | 'e' | 'z';
export type ExtractMode = 'complet' | 'ne' | 'z';

export interface Extracted {
  gpsNo: string;
  n: string;
  e: string;
  z: string;
  code: string;
  rtk: string;
  uncertain: Field[];
}

export interface OcrLine {
  text: string;
  confidence?: number;
}

const DEC_RE = /^-?\d+[.,]\d+$/;
const RTK_RE = /\b(fixed|fix|float|single|dgps|sbas|autonom[a-z]*|rtk)\b/i;
const NOT_CODE = new Set(['rtk', 'fix', 'fixed', 'float', 'single', 'dgps', 'sbas', 'gps', 'nord', 'est', 'cota', 'punct', 'north', 'east', 'elev', 'name', 'point']);

/** Corectează confuziile uzuale ale OCR în token-uri numerice (O→0, l→1 ...). */
export function fixNumericToken(tok: string): { value: string; fixed: boolean } {
  const base = tok.replace(/^[^\w-]+|[^\w]+$/g, '');
  if (!/[\d]/.test(base)) return { value: base, fixed: false };
  const mapped = base.replace(/[OoDQ]/g, '0').replace(/[lI|]/g, '1').replace(/[Ss]/g, '5').replace(/B/g, '8');
  if (/^-?\d+([.,]\d+)?$/.test(mapped) && mapped !== base && /^-?[\d.,OoDQlI|SsB]+$/.test(base)) {
    const realDigits = (base.match(/\d/g) ?? []).length;
    if (realDigits >= Math.ceil(base.length / 2)) return { value: mapped, fixed: true };
  }
  return { value: base, fixed: false };
}

const dot = (s: string) => s.replace(',', '.');

const HEADER_WORDS: Array<[Field | 'code', RegExp]> = [
  ['gpsNo', /^(punct|point|pct|nr|name|nume|id)$/i],
  ['n', /^(nord|north|northing|n|x)$/i],
  ['e', /^(est|east|easting|e|y)$/i],
  ['z', /^(z|cota|cotă|elev|elevation|h|height|alt)$/i],
  ['code', /^(cod|code|desc|descriere|feature)$/i],
];

function headerOrder(line: string): Array<Field | 'code'> | null {
  if (/\d/.test(line)) return null;
  const words = line.split(/[\s|;:]+/).filter(Boolean);
  const order: Array<Field | 'code'> = [];
  for (const w of words) {
    for (const [f, re] of HEADER_WORDS) {
      if (re.test(w) && !order.includes(f)) order.push(f);
    }
  }
  return order.length >= 3 && order.includes('n') && order.includes('e') ? order : null;
}

interface Tok {
  raw: string;
  value: string;
  fixed: boolean;
}

function tokenize(line: string): Tok[] {
  return line
    .split(/[\s|;]+/)
    .filter(Boolean)
    .map((raw) => {
      const f = fixNumericToken(raw);
      return { raw, value: f.value, fixed: f.fixed };
    });
}

function parseTabular(lines: OcrLine[], mode: ExtractMode): Extracted[] {
  const rows: Extracted[] = [];
  let order: Array<Field | 'code'> | null = null;
  const needed = mode === 'z' ? 1 : 2;
  for (const line of lines) {
    const text = line.text.trim().replace(/(\d)\s+([.,]\d)/g, '$1$2').replace(/(\d[.,])\s+(\d)/g, '$1$2');
    if (!text) continue;
    const h = headerOrder(text);
    if (h) {
      order = h;
      continue;
    }
    const toks = tokenize(text);
    const decIdx = toks.map((t, i) => (DEC_RE.test(t.value) ? i : -1)).filter((i) => i >= 0);
    if (decIdx.length < needed) continue;
    const dec = decIdx.map((i) => toks[i]);
    const uncertain = new Set<Field>();
    const lowConf = line.confidence !== undefined && line.confidence < 60;

    const row: Extracted = { gpsNo: '', n: '', e: '', z: '', code: '', rtk: '', uncertain: [] };
    const fieldsFromOrder = order ? order.filter((f): f is Field => f === 'n' || f === 'e' || f === 'z') : null;
    const assign = (f: Field, t: Tok | undefined) => {
      if (!t) return;
      row[f] = dot(t.value);
      if (t.fixed || lowConf) uncertain.add(f);
    };
    if (mode === 'z') {
      if (fieldsFromOrder && fieldsFromOrder.includes('z') && dec.length >= fieldsFromOrder.length) {
        assign('z', dec[fieldsFromOrder.indexOf('z')]);
      } else assign('z', dec.length >= 3 ? dec[2] : dec[dec.length - 1]);
    } else if (fieldsFromOrder && dec.length >= fieldsFromOrder.length) {
      fieldsFromOrder.forEach((f, i) => {
        if (mode === 'complet' || f !== 'z') assign(f, dec[i]);
      });
    } else {
      assign('n', dec[0]);
      assign('e', dec[1]);
      if (mode === 'complet') assign('z', dec[2]);
    }

    const firstDec = decIdx[0];
    const before = toks.slice(0, firstDec);
    const idTok = before.find((t) => /^[A-Za-z]{0,4}\d+[A-Za-z]?$/.test(t.value)) ?? before.find((t) => /^[\w-]+$/.test(t.value) && /\d/.test(t.value));
    if (idTok) {
      row.gpsNo = idTok.value;
      if (idTok.fixed || lowConf) uncertain.add('gpsNo');
    } else uncertain.add('gpsNo');

    const rtk = text.match(RTK_RE);
    if (rtk && !/^rtk$/i.test(rtk[1])) row.rtk = rtk[1][0].toUpperCase() + rtk[1].slice(1).toLowerCase();
    else if (rtk) row.rtk = 'RTK';
    const codeTok = toks.find(
      (t) => /^[A-Za-zĂÂÎȘȚăâîșț_-]{2,12}$/.test(t.value) && !NOT_CODE.has(t.value.toLowerCase()) && !/^\d/.test(t.value),
    );
    if (codeTok) row.code = codeTok.value;
    row.uncertain = [...uncertain];
    rows.push(row);
  }
  return rows;
}

const LABELS: Array<[Field, RegExp]> = [
  ['gpsNo', /(?:^|\s)(?:punct|point(?:\s*(?:id|name))?|pct|name|nume|nr\.?|id)\s*[:=]\s*([A-Za-z0-9_-]+)/i],
  ['n', /(?:^|\s)(?:nord|north(?:ing)?|n|x)\s*[:=]?\s*(-?[\dOolI|]+[.,][\dOolI|]+)/i],
  ['e', /(?:^|\s)(?:est|east(?:ing)?|e|y)\s*[:=]?\s*(-?[\dOolI|]+[.,][\dOolI|]+)/i],
  ['z', /(?:^|\s)(?:z|cot[aă]|elev(?:ation)?|h(?:eight)?|alt(?:itudine)?)\s*[:=]?\s*(-?[\dOolI|]+[.,][\dOolI|]+)/i],
];

function parseLabelled(lines: OcrLine[], mode: ExtractMode): Extracted[] {
  const rows: Extracted[] = [];
  let cur: Extracted | null = null;
  const have = new Set<Field>();
  const flush = () => {
    if (cur && (cur.n || cur.e || cur.z)) {
      if (!cur.gpsNo && !cur.uncertain.includes('gpsNo')) cur.uncertain.push('gpsNo');
      rows.push(cur);
    }
    cur = null;
    have.clear();
  };
  for (const line of lines) {
    const text = line.text;
    const lowConf = line.confidence !== undefined && line.confidence < 60;
    for (const [f, re] of LABELS) {
      if (mode === 'z' && (f === 'n' || f === 'e')) continue;
      if (mode === 'ne' && f === 'z') continue;
      const m = text.match(re);
      if (!m) continue;
      if (f === 'gpsNo' || have.has(f)) flush();
      if (!cur) cur = { gpsNo: '', n: '', e: '', z: '', code: '', rtk: '', uncertain: [] };
      const fx = f === 'gpsNo' ? { value: m[1], fixed: false } : fixNumericToken(m[1]);
      cur[f] = dot(fx.value);
      have.add(f);
      if ((fx.fixed || lowConf) && !cur.uncertain.includes(f)) cur.uncertain.push(f);
    }
    const rtk = text.match(RTK_RE);
    if (cur && rtk && !(cur as Extracted).rtk) (cur as Extracted).rtk = /^rtk$/i.test(rtk[1]) ? 'RTK' : rtk[1][0].toUpperCase() + rtk[1].slice(1).toLowerCase();
  }
  flush();
  return rows;
}

/** Marchează valorile cu număr de zecimale diferit de cel dominant (probabil citite greșit). */
function flagOddDecimals(rows: Extracted[]) {
  for (const f of ['n', 'e', 'z'] as const) {
    const counts = new Map<number, number>();
    for (const r of rows) {
      if (!r[f]) continue;
      const d = (r[f].split('.')[1] ?? '').length;
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    if (counts.size < 2) continue;
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    for (const r of rows) {
      if (r[f] && (r[f].split('.')[1] ?? '').length !== dominant && !r.uncertain.includes(f)) r.uncertain.push(f);
    }
  }
}

export function parseControllerText(lines: OcrLine[] | string, mode: ExtractMode): Extracted[] {
  const ls: OcrLine[] = typeof lines === 'string' ? lines.split(/\r?\n/).map((text) => ({ text })) : lines;
  const labelHits = ls.filter((l) => LABELS[1][1].test(l.text) || LABELS[2][1].test(l.text)).length;
  const rows = labelHits >= 2 && !ls.some((l) => headerOrder(l.text)) ? parseLabelled(ls, mode) : parseTabular(ls, mode);
  const seen = new Map<string, number>();
  for (const r of rows) if (r.gpsNo) seen.set(r.gpsNo, (seen.get(r.gpsNo) ?? 0) + 1);
  for (const r of rows) if (r.gpsNo && (seen.get(r.gpsNo) ?? 0) > 1 && !r.uncertain.includes('gpsNo')) r.uncertain.push('gpsNo');
  flagOddDecimals(rows);
  return rows;
}

const keyOf = (s: string) => s.trim().toLowerCase().replace(/^0+(?=\d)/, '');

/** Combină rezultatele mai multor fotografii după numărul original al punctului GPS (nu după poziția rândului). */
export function mergeByGpsNo(batches: Extracted[][]): Extracted[] {
  const map = new Map<string, Extracted>();
  const order: string[] = [];
  let anon = 0;
  for (const batch of batches) {
    for (const r of batch) {
      const k = r.gpsNo ? keyOf(r.gpsNo) : `__anon${anon++}`;
      const ex = map.get(k);
      if (!ex) {
        map.set(k, { ...r, uncertain: [...r.uncertain] });
        order.push(k);
        continue;
      }
      for (const f of ['n', 'e', 'z'] as const) {
        if (!ex[f] && r[f]) ex[f] = r[f];
        else if (ex[f] && r[f] && ex[f] !== r[f] && !ex.uncertain.includes(f)) ex.uncertain.push(f);
        if (r.uncertain.includes(f) && ex[f] === r[f] && !ex.uncertain.includes(f)) ex.uncertain.push(f);
      }
      if (!ex.code && r.code) ex.code = r.code;
      if (!ex.rtk && r.rtk) ex.rtk = r.rtk;
    }
  }
  return order.map((k) => map.get(k)!);
}
