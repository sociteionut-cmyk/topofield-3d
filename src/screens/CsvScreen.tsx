import { useMemo, useState } from 'react';
import type { GpsPoint, Project } from '../types';
import { detectSeparator, guessColumns, hasHeader, parseCsv, rowsToPoints, type ColumnMap, type Sep } from '../lib/csv';
import { mergeIntoPool } from '../lib/project';
import { uid } from '../lib/db';

interface Props {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  onDone: () => void;
  notify: (m: string) => void;
}

const FIELDS: Array<[keyof ColumnMap, string]> = [
  ['gpsNo', 'Număr punct'],
  ['n', 'Nord X'],
  ['e', 'Est Y'],
  ['z', 'Cotă Z'],
  ['code', 'Cod'],
];

export function CsvScreen({ project, update, onDone, notify }: Props) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [sep, setSep] = useState<Sep>(';');
  const [header, setHeader] = useState(true);
  const [map, setMap] = useState<ColumnMap>({ gpsNo: 0, n: 1, e: 2, z: 3, code: 4 });

  const rows = useMemo(() => (text ? parseCsv(text, sep) : []), [text, sep]);
  const cols = Math.max(0, ...rows.slice(0, 20).map((r) => r.length));
  const points = useMemo(() => (rows.length ? rowsToPoints(rows, map, header) : []), [rows, map, header]);

  const load = async (f: File | undefined) => {
    if (!f) return;
    const t = await f.text();
    const s = detectSeparator(t);
    const r = parseCsv(t, s);
    const h = hasHeader(r);
    setName(f.name);
    setText(t);
    setSep(s);
    setHeader(h);
    setMap(guessColumns(r, h));
  };

  const reguess = (s: Sep, h: boolean) => {
    const r = parseCsv(text, s);
    setMap(guessColumns(r, h));
  };

  const mapped = map.n >= 0 && map.e >= 0 && map.gpsNo >= 0;
  const noZ = points.filter((p) => !p.z).length;
  const bad = points.filter((p) => p.uncertain.length || !p.n || !p.e).length;

  const importNow = () => {
    if (!points.length) return notify('Nu există rânduri de importat.');
    if (map.n < 0 || map.e < 0) return notify('Alegeți coloanele pentru Nord și Est.');
    const items: GpsPoint[] = points.map((p) => ({ id: uid(), gpsNo: p.gpsNo, n: p.n, e: p.e, z: p.z, code: p.code, rtk: '', uncertain: p.uncertain, measuredAt: undefined, source: 'csv' }));
    update((pr) => ({
      ...pr,
      gpsPool: mergeIntoPool(pr.gpsPool, items),
      imports: [...pr.imports, { id: uid(), name, date: new Date().toISOString(), rows: items.length }],
    }));
    notify(`${items.length} puncte importate. Continuați cu asocierea.`);
    onDone();
  };

  const colOptions = Array.from({ length: cols }, (_, i) => (
    <option key={i} value={i}>
      Coloana {i + 1}{header && rows[0]?.[i] ? ` – ${rows[0][i]}` : ''}
    </option>
  ));

  return (
    <div className="screen">
      <h2>Import CSV</h2>
      <p className="muted">Importați punctele exportate din controllerul GPS (CSV cu virgulă, punct și virgulă sau tab; cu sau fără antet).</p>
      <label className="btn btn-primary filebtn">
        📂 Alege fișierul CSV
        <input data-testid="csv-input" type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
      </label>

      {text && (
        <>
          <div className="card">
            <strong>{name}</strong> · {rows.length} rânduri
            <div className="grid2 top">
              <label>
                Separator
                <select value={sep} onChange={(e) => { const s = e.target.value as Sep; setSep(s); reguess(s, header); }}>
                  <option value=";">Punct și virgulă ( ; )</option>
                  <option value=",">Virgulă ( , )</option>
                  <option value={'\t'}>Tab</option>
                </select>
              </label>
              <label className="inline">
                <input type="checkbox" checked={header} onChange={(e) => { setHeader(e.target.checked); reguess(sep, e.target.checked); }} /> Prima linie este antet
              </label>
            </div>
          </div>

          <div className="card">
            <h4>Previzualizare</h4>
            <div className="tablewrap">
              <table className="edit">
                <tbody>
                  {rows.slice(0, 8).map((r, i) => (
                    <tr key={i} className={header && i === 0 ? 'hdr' : ''}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h4>Ce reprezintă fiecare coloană?</h4>
            <div className="grid2">
              {FIELDS.map(([k, label]) => (
                <label key={k}>
                  {label}
                  <select aria-label={label} value={map[k]} onChange={(e) => setMap({ ...map, [k]: Number(e.target.value) })}>
                    <option value={-1}>— nu există —</option>
                    {colOptions}
                  </select>
                </label>
              ))}
            </div>
            <p className="muted small">Virgula sau punctul zecimal sunt recunoscute automat. Valorile se păstrează exact cum sunt în fișier.</p>
          </div>

          <div className="card">
            <h4>Rezultat: {points.length} puncte</h4>
            <div className="tablewrap">
              <table className="edit">
                <thead><tr><th>Nr.</th><th>Nord X</th><th>Est Y</th><th>Cotă Z</th><th>Cod</th></tr></thead>
                <tbody>
                  {points.slice(0, 50).map((p, i) => (
                    <tr key={i}><td>{p.gpsNo}</td><td className={!p.n ? 'miss' : ''}>{p.n || 'lipsă'}</td><td className={!p.e ? 'miss' : ''}>{p.e || 'lipsă'}</td><td className={!p.z ? 'unc' : ''}>{p.z || 'lipsă'}</td><td>{p.code}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bad > 0 && <p className="warn small">{bad} rânduri au Nord/Est lipsă sau necitibile.</p>}
            {noZ > 0 && <p className="warn small">{noZ} rânduri nu au cotă Z.</p>}
            <button className="btn btn-accent block big" disabled={!mapped || !points.length} onClick={importNow}>Importă și continuă la asociere</button>
          </div>
        </>
      )}
      {project.imports.length > 0 && (
        <div className="card">
          <h4>Fișiere importate anterior</h4>
          {project.imports.map((i) => <div key={i.id} className="muted small">{i.name} · {i.rows} puncte · {new Date(i.date).toLocaleString('ro-RO')}</div>)}
        </div>
      )}
    </div>
  );
}
