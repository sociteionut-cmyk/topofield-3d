import { useEffect, useRef, useState } from 'react';
import type { GpsPoint, Project } from '../types';
import { DEFAULT_PRE, loadBitmap, preprocess, type PreOptions } from '../lib/imaging';
import { ocrPhoto } from '../lib/ocr';
import { mergeByGpsNo, type Extracted } from '../lib/ocrParse';
import { putBlob, uid } from '../lib/db';
import { mergeIntoPool } from '../lib/project';
import { demoControllerImage } from '../lib/demo';
import { useOnline } from '../hooks';

interface Props {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  onDone: () => void;
  notify: (m: string) => void;
}

interface Shot {
  id: string;
  blob: Blob;
  name: string;
  role: 'complet' | 'ne' | 'z';
  pre: PreOptions;
  status: 'idle' | 'run' | 'done' | 'err';
  progress: string;
  text?: string;
  count?: number;
  takenAt: string;
}

export function OcrScreen({ project, update, onDone, notify }: Props) {
  const [mode, setMode] = useState<'unu' | 'multi' | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [rows, setRows] = useState<Extracted[]>([]);
  const rowShot = useRef<Record<string, string>>({});
  const online = useOnline();

  const patchShot = (id: string, p: Partial<Shot>) => setShots((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const addFiles = (files: FileList | null, role: Shot['role']) => {
    if (!files) return;
    const added: Shot[] = Array.from(files).map((f) => ({
      id: uid(),
      blob: f,
      name: f.name,
      role,
      pre: DEFAULT_PRE,
      status: 'idle',
      progress: '',
      takenAt: new Date(f.lastModified || Date.now()).toISOString(),
    }));
    setShots((s) => [...s, ...added]);
  };

  const run = async (shot: Shot) => {
    patchShot(shot.id, { status: 'run', progress: 'se pregătește…' });
    try {
      const mdl = shot.role;
      const res = await ocrPhoto(shot.blob, shot.pre, mdl, (st, p) => patchShot(shot.id, { progress: `${st} ${Math.round(p * 100)}%` }));
      patchShot(shot.id, { status: 'done', text: res.text, count: res.rows.length, progress: '', pre: { ...shot.pre, rotate: res.rotation as PreOptions['rotate'] } });
      for (const r of res.rows) if (r.gpsNo) rowShot.current[r.gpsNo.trim().toLowerCase()] ??= shot.id;
      setRows((cur) => mergeByGpsNo([cur, res.rows]));
      if (!res.rows.length) notify('Nu am găsit puncte în această fotografie. Ajustați decuparea/contrastul sau adăugați rândurile manual.');
    } catch (e) {
      patchShot(shot.id, { status: 'err', progress: '' });
      notify(online ? `Eroare OCR: ${(e as Error).message}` : 'OCR-ul nu a putut porni offline: motorul nu a fost încă salvat pe acest dispozitiv. Conectați-vă la internet o singură dată.');
    }
  };

  const setCell = (i: number, k: keyof Extracted, v: string) =>
    setRows((r) =>
      r.map((x, j) => {
        if (j !== i) return x;
        const unc = x.uncertain.filter((f) => f !== k);
        return { ...x, [k]: v, uncertain: unc as Extracted['uncertain'] };
      }),
    );

  const problems = (() => {
    const out: string[] = [];
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const k = r.gpsNo.trim().toLowerCase();
      if (!k) out.push(`Rândul ${i + 1}: lipsește numărul punctului GPS.`);
      else if (seen.has(k)) out.push(`Număr GPS duplicat: ${r.gpsNo}.`);
      seen.add(k);
    });
    return out;
  })();

  const save = async () => {
    if (!rows.length) return notify('Nu există puncte de salvat.');
    if (problems.length) return notify(problems[0]);
    const used = new Set(Object.values(rowShot.current));
    const photoMeta = [] as Project['controllerPhotos'];
    for (const s of shots.filter((x) => used.has(x.id))) {
      await putBlob(s.id, s.blob);
      photoMeta.push({ id: s.id, name: s.name, kind: 'Controller', addedAt: s.takenAt, role: s.role });
    }
    const takenAt = Object.fromEntries(shots.map((s) => [s.id, s.takenAt]));
    const items: GpsPoint[] = rows.map((r) => {
      const sid = rowShot.current[r.gpsNo.trim().toLowerCase()];
      return { id: uid(), gpsNo: r.gpsNo.trim(), n: r.n, e: r.e, z: r.z, code: r.code, rtk: r.rtk, uncertain: r.uncertain, controllerPhotoId: sid, measuredAt: sid ? takenAt[sid] : undefined, source: 'ocr' };
    });
    const clash = items.filter((g) => project.gpsPool.some((x) => x.gpsNo.trim().toLowerCase() === g.gpsNo.toLowerCase()));
    if (clash.length && !confirm(`Punctele GPS ${clash.map((c) => c.gpsNo).join(', ')} există deja în proiect. Le înlocuiți cu valorile din tabel?`)) return;
    update((p) => ({ ...p, controllerPhotos: [...p.controllerPhotos, ...photoMeta], gpsPool: mergeIntoPool(p.gpsPool, items) }));
    notify(`${items.length} puncte GPS salvate. Continuați cu asocierea.`);
    onDone();
  };

  const demo = async () => {
    const blob = await demoControllerImage();
    setMode('unu');
    setShots((s) => [...s, { id: uid(), blob, name: 'exemplu-controller.png', role: 'complet', pre: DEFAULT_PRE, status: 'idle', progress: '', takenAt: new Date().toISOString() }]);
  };

  if (!mode) {
    return (
      <div className="screen">
        <h2>Preia puncte</h2>
        <p className="muted">Fotografiați ecranul controllerului GPS. Aplicația citește (OCR) punctele și coordonatele direct pe telefon.</p>
        <button className="btn btn-primary block big" onClick={() => setMode('unu')}>
          Dintr-o fotografie
          <small>Numărul punctului, Nord, Est și Z apar pe același ecran</small>
        </button>
        <button className="btn btn-primary block big" onClick={() => setMode('multi')}>
          Din două sau mai multe fotografii
          <small>Nord și Est pe un ecran, cota Z pe altul</small>
        </button>
        <button className="btn btn-light block" onClick={demo}>Încearcă cu exemplul demonstrativ (punctele GPS 7, 8, 9, 10)</button>
        <p className="muted small">OCR-ul rulează local, pe dispozitiv. Prima utilizare încarcă motorul OCR (necesită internet o singură dată); după aceea funcționează și offline.</p>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="row between wrap gap">
        <h2>Preia puncte – {mode === 'unu' ? 'dintr-o fotografie' : 'din mai multe fotografii'}</h2>
        <button className="btn btn-light" onClick={() => { setMode(null); setShots([]); setRows([]); rowShot.current = {}; }}>Schimbă metoda</button>
      </div>

      <div className="card">
        <div className="row gap wrap">
          {mode === 'unu' ? (
            <>
              <label className="btn btn-primary filebtn">📷 Fotografiază ecranul<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files, 'complet'); e.target.value = ''; }} /></label>
              <label className="btn btn-light filebtn">🖼 Din galerie<input data-testid="ocr-input" type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files, 'complet'); e.target.value = ''; }} /></label>
            </>
          ) : (
            <>
              <label className="btn btn-primary filebtn">📷 Ecran Nord / Est<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files, 'ne'); e.target.value = ''; }} /></label>
              <label className="btn btn-primary filebtn">📷 Ecran cotă Z<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files, 'z'); e.target.value = ''; }} /></label>
              <label className="btn btn-light filebtn">🖼 Din galerie (Nord/Est)<input data-testid="ocr-input-ne" type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files, 'ne'); e.target.value = ''; }} /></label>
              <label className="btn btn-light filebtn">🖼 Din galerie (Z)<input data-testid="ocr-input-z" type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files, 'z'); e.target.value = ''; }} /></label>
            </>
          )}
        </div>
        <p className="muted small">Coordonatele din fotografii diferite se combină după numărul original al punctului GPS, nu după poziția rândului.</p>
      </div>

      {shots.map((s) => (
        <ShotCard key={s.id} shot={s} multi={mode === 'multi'} onChange={(p) => patchShot(s.id, p)} onRun={() => run(s)} onRemove={() => setShots((x) => x.filter((y) => y.id !== s.id))} />
      ))}

      <div className="card">
        <h3>Puncte extrase ({rows.length})</h3>
        <p className="muted small">Verificați și corectați valorile. <span className="legend-unc">Galben</span> = citire incertă · <span className="legend-miss">Roșu</span> = lipsă (nu se inventează valori).</p>
        {rows.length === 0 ? (
          <p className="muted">Nu există încă puncte. Rulați OCR pe o fotografie sau adăugați rânduri manual.</p>
        ) : (
          <div className="tablewrap">
            <table className="edit">
              <thead>
                <tr><th>Nr. GPS</th><th>Nord X</th><th>Est Y</th><th>Cotă Z</th><th>Cod</th><th>RTK</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {(['gpsNo', 'n', 'e', 'z', 'code', 'rtk'] as const).map((k) => {
                      const missing = (k === 'gpsNo' || k === 'n' || k === 'e' || k === 'z') && !r[k].trim();
                      const unc = (k === 'gpsNo' || k === 'n' || k === 'e' || k === 'z') && r.uncertain.includes(k);
                      return (
                        <td key={k}>
                          <input aria-label={`${k} rând ${i + 1}`} className={missing ? 'miss' : unc ? 'unc' : ''} value={r[k]} inputMode={k === 'code' || k === 'rtk' ? 'text' : 'decimal'} onChange={(e) => setCell(i, k, k === 'n' || k === 'e' || k === 'z' ? e.target.value.replace(',', '.') : e.target.value)} />
                        </td>
                      );
                    })}
                    <td><button className="btn btn-light sq sm" aria-label="Șterge rândul" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="row gap wrap top">
          <button className="btn btn-light" onClick={() => setRows((r) => [...r, { gpsNo: '', n: '', e: '', z: '', code: '', rtk: '', uncertain: [] }])}>＋ Adaugă rând</button>
          {rows.length > 0 && <button className="btn btn-light" onClick={() => { setRows([]); rowShot.current = {}; }}>Golește tabelul</button>}
        </div>
        {problems.map((p) => <p key={p} className="warn small">{p}</p>)}
        <button className="btn btn-accent block big" onClick={save} disabled={!rows.length}>Salvează punctele și continuă la asociere</button>
      </div>
    </div>
  );
}

function ShotCard({ shot, multi, onChange, onRun, onRemove }: { shot: Shot; multi: boolean; onChange: (p: Partial<Shot>) => void; onRun: () => void; onRemove: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const bmp = useRef<ImageBitmap | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [showText, setShowText] = useState(false);
  const pre = shot.pre;

  useEffect(() => {
    let alive = true;
    loadBitmap(shot.blob).then((b) => {
      if (!alive) return;
      bmp.current = b;
      setReady(true);
    });
    return () => {
      alive = false;
      bmp.current?.close();
    };
  }, [shot.blob]);

  useEffect(() => {
    if (!ready || !bmp.current || !cv.current) return;
    const t = setTimeout(() => {
      const out = preprocess(bmp.current!, pre, 900);
      const c = cv.current!;
      c.width = out.width;
      c.height = out.height;
      c.getContext('2d')!.drawImage(out, 0, 0);
    }, 80);
    return () => clearTimeout(t);
  }, [ready, pre]);

  const set = (p: Partial<PreOptions>) => onChange({ pre: { ...pre, ...p } });
  const rot = (d: 90 | -90) => set({ rotate: ((pre.rotate + d + 360) % 360) as PreOptions['rotate'] });
  const crop = (k: 'l' | 't' | 'r' | 'b', v: number) => set({ crop: { ...pre.crop, [k]: v } });

  return (
    <div className="card shot">
      <div className="row between wrap gap">
        <strong>{shot.name}</strong>
        <div className="row gap">
          {multi && (
            <select aria-label="Conținutul fotografiei" value={shot.role} onChange={(e) => onChange({ role: e.target.value as Shot['role'] })}>
              <option value="ne">Ecran Nord / Est</option>
              <option value="z">Ecran cotă Z</option>
              <option value="complet">Ecran complet (N, E, Z)</option>
            </select>
          )}
          <button className="btn btn-light sq" aria-label="Elimină fotografia" onClick={onRemove}>✕</button>
        </div>
      </div>
      <canvas ref={cv} className="preview" />
      <details>
        <summary>Ajustări imagine (decupare, contrast, claritate, orientare)</summary>
        <div className="row gap wrap top">
          <button className="btn btn-light" onClick={() => rot(-90)}>⟲ Rotește</button>
          <button className="btn btn-light" onClick={() => rot(90)}>⟳ Rotește</button>
          <label className="inline"><input type="checkbox" checked={pre.auto} onChange={(e) => set({ auto: e.target.checked })} /> Contrast automat</label>
          <label className="inline"><input type="checkbox" checked={pre.sharpen} onChange={(e) => set({ sharpen: e.target.checked })} /> Claritate</label>
        </div>
        <label>Contrast ({pre.contrast.toFixed(1)})<input type="range" min={0.5} max={2.5} step={0.1} value={pre.contrast} onChange={(e) => set({ contrast: Number(e.target.value) })} /></label>
        <div className="grid2">
          {(['t', 'b', 'l', 'r'] as const).map((k) => (
            <label key={k}>Decupare {{ t: 'sus', b: 'jos', l: 'stânga', r: 'dreapta' }[k]} ({pre.crop[k]}%)
              <input type="range" min={0} max={45} value={pre.crop[k]} onChange={(e) => crop(k, Number(e.target.value))} />
            </label>
          ))}
        </div>
      </details>
      <button className="btn btn-primary block" disabled={shot.status === 'run'} onClick={onRun}>
        {shot.status === 'run' ? `Se citește… ${shot.progress}` : shot.status === 'done' ? 'Citește din nou (OCR)' : 'Citește punctele (OCR)'}
      </button>
      {shot.status === 'done' && <p className="small">{shot.count ? `✔ ${shot.count} puncte găsite.` : 'Niciun punct găsit.'} <button className="link" onClick={() => setShowText(!showText)}>{showText ? 'Ascunde textul' : 'Vezi textul citit'}</button></p>}
      {showText && <pre className="rawtext">{shot.text}</pre>}
      {shot.status === 'err' && <p className="warn small">Citirea a eșuat.</p>}
    </div>
  );
}
