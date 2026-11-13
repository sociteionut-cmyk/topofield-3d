import { useState } from 'react';
import type { PointType, Project, SurveyPoint } from '../types';
import { CRS_LABEL, TYPE_LABEL } from '../types';
import { useBlobUrl } from '../hooks';
import { isCodeTaken } from '../lib/numbering';
import { STATUS_LABEL, extraZDiff, fmt } from '../lib/project';
import { parseNum } from '../lib/coords';
import { uid } from '../lib/db';

interface Props {
  project: Project;
  pointId?: string;
  onPick: (id: string) => void;
  update: (fn: (p: Project) => Project) => void;
  onShowOnImage: (id: string) => void;
  notify: (m: string) => void;
}

const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};

export function DetailsTab({ project, pointId, onPick, update, onShowOnImage, notify }: Props) {
  const point = project.points.find((p) => p.id === pointId);
  const photo = project.photos.find((p) => p.id === point?.photoId);
  const photoUrl = useBlobUrl(photo?.id);
  const ctrlUrl = useBlobUrl(point?.controllerPhotoId);
  const [zoomCtrl, setZoomCtrl] = useState(false);

  const patch = (fn: (p: SurveyPoint) => SurveyPoint) => update((pr) => ({ ...pr, points: pr.points.map((q) => (q.id === pointId ? fn(q) : q)) }));

  if (!project.points.length) return <p className="muted pad">Nu există puncte în acest proiect.</p>;

  return (
    <div>
      <label className="card block">
        Alegeți punctul
        <select aria-label="Alege punctul" value={pointId ?? ''} onChange={(e) => onPick(e.target.value)}>
          <option value="">— selectați —</option>
          {[...project.points].sort((a, b) => a.order - b.order).map((p) => <option key={p.id} value={p.id}>{p.order}. {p.code} – {TYPE_LABEL[p.type]}</option>)}
        </select>
      </label>
      {!point ? (
        <p className="muted pad">Selectați un punct din listă sau din fotografie.</p>
      ) : (
        <>
          <div className="card">
            <div className="row between wrap gap">
              <h3 style={{ margin: 0 }}>{point.code}</h3>
              <span className={`status ${point.status === 'masurat' ? 'ok' : 'bad'}`}>{STATUS_LABEL[point.status]}</span>
            </div>
            <div className="grid2 top">
              <label>
                Cod topografic
                <input defaultValue={point.code} key={point.code} onBlur={(e) => {
                  const c = e.target.value.trim();
                  if (!c || c === point.code) return;
                  if (isCodeTaken(project.points, c, point.id)) { notify(`Codul „${c}” există deja.`); e.target.value = point.code; return; }
                  patch((q) => ({ ...q, code: c, customCode: true }));
                }} />
              </label>
              <label>
                Tipul elementului
                <select value={point.type} onChange={(e) => patch((q) => ({ ...q, type: e.target.value as PointType }))}>
                  {(Object.keys(TYPE_LABEL) as PointType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </label>
              <label>
                Număr original GPS
                <input value={point.gpsNo ?? ''} readOnly placeholder="neasociat" />
              </label>
              <label>
                Stare
                <select value={point.status} onChange={(e) => patch((q) => ({ ...q, status: e.target.value as SurveyPoint['status'] }))}>
                  <option value="de_masurat">De măsurat</option>
                  <option value="masurat">Măsurat</option>
                </select>
              </label>
            </div>
          </div>

          <div className="card">
            <h4>Coordonate</h4>
            <div className="grid3">
              {(['n', 'e', 'z'] as const).map((f) => (
                <label key={f}>
                  {f === 'n' ? 'Nord X' : f === 'e' ? 'Est Y' : 'Cotă Z'}
                  <input inputMode="decimal" value={point[f]} onChange={(e) => patch((q) => ({ ...q, [f]: e.target.value.replace(',', '.') }))} />
                  {point.orig && point.orig[f] !== point[f] && <small className="warn">modificat (original: {point.orig[f] || '—'})</small>}
                </label>
              ))}
            </div>
            <p className="muted small">Sistem de coordonate: {CRS_LABEL[project.crs]} · Convenție: Nord = X, Est = Y.</p>
            <label>
              Data și ora măsurătorii
              <input type="datetime-local" value={toLocalInput(point.measuredAt)} onChange={(e) => patch((q) => ({ ...q, measuredAt: e.target.value ? new Date(e.target.value).toISOString() : undefined }))} />
            </label>
            {point.rtk && <p className="muted small">Stare RTK citită: {point.rtk}</p>}
          </div>

          <div className="card">
            <h4>Cote suplimentare</h4>
            {point.extraZ.map((x) => {
              const d = extraZDiff(point.z, x.z);
              return (
                <div className="row gap wrap top" key={x.id}>
                  <input aria-label="Denumire cotă" value={x.label} onChange={(e) => patch((q) => ({ ...q, extraZ: q.extraZ.map((y) => (y.id === x.id ? { ...y, label: e.target.value } : y)) }))} />
                  <input aria-label="Valoare cotă" inputMode="decimal" value={x.z} onChange={(e) => patch((q) => ({ ...q, extraZ: q.extraZ.map((y) => (y.id === x.id ? { ...y, z: e.target.value.replace(',', '.') } : y)) }))} />
                  <span className="diff">Δ față de Z punct: <strong>{d === undefined ? '—' : `${d >= 0 ? '+' : ''}${fmt(d)} m`}</strong></span>
                  <button className="btn btn-light sq" aria-label="Șterge cota" onClick={() => patch((q) => ({ ...q, extraZ: q.extraZ.filter((y) => y.id !== x.id) }))}>✕</button>
                </div>
              );
            })}
            <div className="row gap wrap top">
              <button className="btn btn-light" onClick={() => patch((q) => ({ ...q, extraZ: [...q.extraZ, { id: uid(), label: 'Cota terenului', z: '' }] }))}>＋ Cota terenului</button>
              <button className="btn btn-light" onClick={() => patch((q) => ({ ...q, extraZ: [...q.extraZ, { id: uid(), label: 'Cota axului conductei', z: '' }] }))}>＋ Cota axului conductei</button>
            </div>
            {point.extraZ.length >= 2 && (() => {
              const a = parseNum(point.extraZ[0].z);
              const b = parseNum(point.extraZ[1].z);
              return a !== undefined && b !== undefined ? <p>Diferență între „{point.extraZ[0].label}” și „{point.extraZ[1].label}”: <strong>{fmt(b - a)} m</strong></p> : null;
            })()}
          </div>

          <div className="card">
            <h4>Fotografia instalației</h4>
            {photo && photoUrl && point.mark ? (
              <>
                <div className="crop" aria-label="Poziția marcată pe fotografie">
                  <img src={photoUrl} alt="Zonă din fotografie" style={{ width: '350%', transform: `translate(-${point.mark.x * 100}%, -${point.mark.y * 100}%)` }} />
                  <span className="cross" />
                </div>
                <button className="btn btn-light top" onClick={() => onShowOnImage(point.id)}>Vezi pe fotografia întreagă</button>
              </>
            ) : (
              <p className="muted">Punctul nu este marcat pe o fotografie.</p>
            )}
          </div>

          <div className="card">
            <h4>Fotografia controllerului</h4>
            {ctrlUrl ? (
              <img className={`ctrl ${zoomCtrl ? 'big' : ''}`} src={ctrlUrl} alt="Ecranul controllerului GPS" onClick={() => setZoomCtrl(!zoomCtrl)} />
            ) : (
              <p className="muted">Nu există fotografie de controller asociată.</p>
            )}
          </div>

          <div className="card">
            <label>
              Observații
              <textarea rows={3} value={point.notes} onChange={(e) => patch((q) => ({ ...q, notes: e.target.value }))} />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
