import { useState } from 'react';
import type { Project, Settings } from '../types';
import { TYPE_LABEL } from '../types';
import { pointsToCsv } from '../lib/csv';
import { buildDxf, hasCoords } from '../lib/dxf';
import { buildPdf } from '../lib/pdf';
import { saveFile, safeName } from '../lib/files';

interface Props {
  project: Project;
  settings: Settings;
  notify: (m: string) => void;
}

export function ExportScreen({ project, settings, notify }: Props) {
  const [scope, setScope] = useState<'toate' | 'selectie'>('toate');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [sep, setSep] = useState(settings.csvSeparator);
  const [dec, setDec] = useState(settings.csvDecimal);
  const [busy, setBusy] = useState('');
  const ids = scope === 'selectie' ? chosen : undefined;
  const pts = project.points.filter((p) => !ids || ids.has(p.id)).sort((a, b) => a.order - b.order);
  const base = safeName(project.name);

  const run = async (kind: string, fn: () => Promise<[Blob, string]>) => {
    if (!pts.length) return notify('Nu există puncte de exportat.');
    setBusy(kind);
    try {
      const [blob, filename] = await fn();
      const r = await saveFile(blob, filename);
      notify(r === 'partajat' ? `${filename} partajat.` : `${filename} descărcat.`);
    } catch (e) {
      notify(`Exportul a eșuat: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const toggle = (id: string) => setChosen((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="screen">
      <h2>Export</h2>
      <div className="card">
        <strong>Puncte incluse</strong>
        <div className="row gap wrap top">
          <button className={`chip ${scope === 'toate' ? 'chip-on' : ''}`} onClick={() => setScope('toate')}>Întregul proiect ({project.points.length})</button>
          <button className={`chip ${scope === 'selectie' ? 'chip-on' : ''}`} onClick={() => setScope('selectie')}>Puncte selectate ({chosen.size})</button>
        </div>
        {scope === 'selectie' && (
          <div className="checklist">
            <div className="row gap wrap">
              <button className="btn btn-light" onClick={() => setChosen(new Set(project.points.map((p) => p.id)))}>Toate</button>
              <button className="btn btn-light" onClick={() => setChosen(new Set())}>Niciunul</button>
            </div>
            {[...project.points].sort((a, b) => a.order - b.order).map((p) => (
              <label key={p.id} className="inline check">
                <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} /> {p.code} <span className="muted">· {TYPE_LABEL[p.type]}{p.status === 'masurat' ? ' · măsurat' : ''}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>PDF</h3>
        <p className="muted small">Raport cu fotografia marcată, tabelul punctelor, observații și sistemul de coordonate.</p>
        <button className="btn btn-primary block" disabled={!!busy} onClick={() => run('pdf', async () => [await buildPdf(project, ids), `${base}_raport.pdf`])}>
          {busy === 'pdf' ? 'Se generează…' : 'Export PDF'}
        </button>
      </div>

      <div className="card">
        <h3>CSV</h3>
        <div className="grid2">
          <label>Separator
            <select value={sep} onChange={(e) => setSep(e.target.value as Settings['csvSeparator'])}>
              <option value=";">Punct și virgulă ( ; )</option>
              <option value=",">Virgulă ( , )</option>
              <option value={'\t'}>Tab</option>
            </select>
          </label>
          <label>Format zecimal
            <select value={dec} onChange={(e) => setDec(e.target.value as Settings['csvDecimal'])}>
              <option value=".">Punct ( 123.456 )</option>
              <option value=",">Virgulă ( 123,456 )</option>
            </select>
          </label>
        </div>
        {sep === ',' && dec === ',' && <p className="warn small">Atenție: virgula ca separator și ca zecimal poate încurca citirea. Alegeți „punct și virgulă”.</p>}
        <button className="btn btn-primary block top" disabled={!!busy} onClick={() => run('csv', async () => [new Blob([pointsToCsv(pts, { sep, decimal: dec })], { type: 'text/csv;charset=utf-8' }), `${base}_puncte.csv`])}>
          Export CSV
        </button>
      </div>

      <div className="card">
        <h3>DXF (AutoCAD)</h3>
        <p className="muted small">Puncte 3D reale, layere separate, linii între punctele conectate, unități metri. X = Est, Y = Nord, Z = cotă. Se exportă doar punctele cu Nord, Est și Z ({pts.filter(hasCoords).length} din {pts.length}).</p>
        <button className="btn btn-primary block" disabled={!!busy} onClick={() => run('dxf', async () => [new Blob([buildDxf(project, ids)], { type: 'application/dxf' }), `${base}.dxf`])}>
          Export DXF
        </button>
      </div>
    </div>
  );
}
