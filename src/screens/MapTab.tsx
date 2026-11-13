import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Project, SurveyPoint } from '../types';
import { TYPE_COLOR, TYPE_LABEL } from '../types';
import { STEREO70_ACCURACY_TEXT, parseNum, plausibleStereo70, stereo70ToWgs84 } from '../lib/coords';
import { distanceInfo, fmt } from '../lib/project';
import { uid } from '../lib/db';
import { useOnline } from '../hooks';

interface Props {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  onOpenDetails: (id: string) => void;
}

const hasNE = (p: SurveyPoint) => parseNum(p.n) !== undefined && parseNum(p.e) !== undefined;

export function MapTab({ project, update, onOpenDetails }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const [mode, setMode] = useState<'schema' | 'geo'>('schema');
  const [labels, setLabels] = useState(true);
  const [connect, setConnect] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const online = useOnline();
  const geoOk = project.crs === 'stereo70';
  const effMode = geoOk ? mode : 'schema';
  const pts = useMemo(() => project.points.filter(hasNE), [project.points]);
  const skipped = effMode === 'geo' ? pts.filter((p) => !plausibleStereo70(parseNum(p.n)!, parseNum(p.e)!)) : [];
  const fitted = useRef('');

  // Schimbarea modului necesită un CRS diferit, deci harta se recreează.
  useEffect(() => {
    if (!el.current) return;
    map.current?.remove();
    const m = L.map(el.current, { crs: effMode === 'geo' ? L.CRS.EPSG3857 : L.CRS.Simple, minZoom: effMode === 'geo' ? 3 : -12, maxZoom: effMode === 'geo' ? 21 : 22, zoomSnap: 0.25, center: [0, 0], zoom: 0 });
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    tiles.current = null;
    if (effMode === 'geo') {
      tiles.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    }
    fitted.current = '';
    return () => {
      m.remove();
    };
  }, [effMode]);

  const ll = (p: SurveyPoint): L.LatLngExpression | undefined => {
    const n = parseNum(p.n)!;
    const e = parseNum(p.e)!;
    if (effMode === 'schema') return [n, e]; // Simple CRS: lat = Nord, lng = Est
    if (!plausibleStereo70(n, e)) return undefined;
    const c = stereo70ToWgs84(n, e);
    return [c.lat, c.lon];
  };

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const coords: L.LatLngExpression[] = [];
    const byId = new Map<string, L.LatLngExpression>();
    for (const p of pts) {
      const pos = ll(p);
      if (!pos) continue;
      byId.set(p.id, pos);
      coords.push(pos);
    }
    for (const l of project.links) {
      const a = byId.get(l.a);
      const b = byId.get(l.b);
      if (a && b) {
        const pl = L.polyline([a, b], { color: '#ca8a04', weight: 5, opacity: 0.9 }).addTo(g);
        pl.on('click', () => {
          if (confirm('Ștergeți conexiunea dintre aceste puncte?')) update((p) => ({ ...p, links: p.links.filter((x) => x.id !== l.id) }));
        });
      }
    }
    for (const p of pts) {
      const pos = byId.get(p.id);
      if (!pos) continue;
      const selected = sel.includes(p.id);
      const cm = L.circleMarker(pos, {
        radius: selected ? 11 : 8,
        color: selected ? '#000' : '#fff',
        weight: selected ? 3 : 2,
        fillColor: TYPE_COLOR[p.type],
        fillOpacity: 1,
      }).addTo(g);
      if (labels) cm.bindTooltip(p.code, { permanent: true, direction: 'right', offset: [8, 0], className: 'ptlabel' });
      cm.on('click', () => {
        if (connect) {
          setSel((s) => {
            if (s.length === 1 && s[0] !== p.id) {
              const a = s[0];
              update((pr) => {
                const ex = pr.links.find((l) => (l.a === a && l.b === p.id) || (l.a === p.id && l.b === a));
                return { ...pr, links: ex ? pr.links.filter((l) => l.id !== ex.id) : [...pr.links, { id: uid(), a, b: p.id }] };
              });
              return [];
            }
            return [p.id];
          });
        } else setSel((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id].slice(-2)));
      });
    }
    const key = `${effMode}:${coords.length}`;
    if (coords.length && fitted.current !== key) {
      fitted.current = key;
      m.fitBounds(L.latLngBounds(coords as L.LatLngTuple[]).pad(0.3), { maxZoom: effMode === 'geo' ? 19 : 8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, project.links, sel, labels, connect, effMode]);

  useEffect(() => {
    setTimeout(() => map.current?.invalidateSize(), 50);
  }, []);

  const selPts = sel.map((id) => project.points.find((p) => p.id === id)).filter(Boolean) as SurveyPoint[];
  const info = selPts.length === 2 ? distanceInfo(selPts[0], selPts[1]) : undefined;

  return (
    <div>
      <div className="card">
        <div className="row gap wrap">
          <button className={`chip ${effMode === 'schema' ? 'chip-on' : ''}`} onClick={() => setMode('schema')}>Schemă (fără internet)</button>
          <button className={`chip ${effMode === 'geo' ? 'chip-on' : ''}`} disabled={!geoOk} onClick={() => setMode('geo')}>Hartă geografică</button>
          <label className="inline"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Denumiri</label>
          <button className={`chip ${connect ? 'chip-on' : ''}`} onClick={() => { setConnect(!connect); setSel([]); }}>
            {connect ? '✔ Conectare activă' : 'Conectează puncte (conductă)'}
          </button>
        </div>
        {!geoOk && <p className="warn small">Sistemul de coordonate al proiectului nu este Stereo 70, deci nu se afișează poziții geografice. Este disponibilă doar schema.</p>}
        {effMode === 'geo' && (
          <>
            <p className="muted small">{STEREO70_ACCURACY_TEXT}</p>
            {!online && <p className="warn small">Fundalul hărții (OpenStreetMap) necesită internet. Punctele rămân afișate; folosiți „Schemă” pentru lucru fără internet.</p>}
            {skipped.length > 0 && <p className="warn small">{skipped.length} puncte nu au fost afișate: coordonatele sunt în afara zonei Stereo 70 (verificați ordinea Nord X / Est Y).</p>}
          </>
        )}
        {connect && <p className="hint">Atingeți două puncte pentru a le conecta (sau pentru a șterge conexiunea existentă).</p>}
      </div>
      <div ref={el} className="map" data-testid="map" />
      <div className="legend">
        {(Object.keys(TYPE_COLOR) as Array<keyof typeof TYPE_COLOR>).map((t) => (
          <span key={t}><i style={{ background: TYPE_COLOR[t] }} /> {TYPE_LABEL[t]}</span>
        ))}
        <span><i className="line" /> Conductă</span>
      </div>
      {pts.length === 0 && <p className="muted pad">Nu există puncte măsurate cu coordonate. Folosiți „Preia puncte” sau „Import CSV”, apoi asociați punctele.</p>}
      <div className="card">
        <h4>Selecție</h4>
        {selPts.length === 0 && <p className="muted">Atingeți un punct pe hartă. Selectați două puncte pentru distanță și diferență de nivel.</p>}
        {selPts.map((p) => (
          <div key={p.id} className="row between wrap gap">
            <span><strong>{p.code}</strong> · {TYPE_LABEL[p.type]} · X {p.n} · Y {p.e} · Z {p.z || '—'}</span>
            <button className="btn btn-light" onClick={() => onOpenDetails(p.id)}>Detalii</button>
          </div>
        ))}
        {info && (
          <div className="calc">
            Distanță orizontală: <strong>{fmt(info.horizontal)} m</strong><br />
            Diferență de nivel: <strong>{info.dz === undefined ? '— (cotă lipsă)' : `${info.dz >= 0 ? '+' : ''}${fmt(info.dz)} m`}</strong><br />
            Distanță spațială: <strong>{fmt(info.spatial)} m</strong>
          </div>
        )}
      </div>
      {project.links.length > 0 && (
        <div className="card">
          <h4>Conducte conectate ({project.links.length})</h4>
          {project.links.map((l) => {
            const a = project.points.find((p) => p.id === l.a);
            const b = project.points.find((p) => p.id === l.b);
            if (!a || !b) return null;
            const d = distanceInfo(a, b);
            return (
              <div key={l.id} className="row between wrap gap">
                <span>{a.code} ↔ {b.code}: {d ? `${fmt(d.horizontal)} m orizontal${d.dz !== undefined ? `, Δ ${fmt(d.dz)} m` : ''}` : 'coordonate lipsă'}</span>
                <button className="btn btn-light sq" aria-label="Șterge conexiunea" onClick={() => update((p) => ({ ...p, links: p.links.filter((x) => x.id !== l.id) }))}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
