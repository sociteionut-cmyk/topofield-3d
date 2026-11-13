import { useMemo, useState } from 'react';
import type { Project } from '../types';
import { TYPE_LABEL } from '../types';
import { applyAssignment, autoAssignByCode, initialAssignment, validateAssignment, type Assignment } from '../lib/project';

interface Props {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  onDone: () => void;
  onOcr: () => void;
  notify: (m: string) => void;
}

export function AssocScreen({ project, update, onDone, onOcr, notify }: Props) {
  const [a, setA] = useState<Assignment>(() => initialAssignment(project));
  const [filter, setFilter] = useState<'toate' | 'neasociate'>('toate');
  const v = useMemo(() => validateAssignment(project, a), [project, a]);
  const used = useMemo(() => new Set(Object.values(a).filter(Boolean)), [a]);
  const free = project.gpsPool.filter((g) => !used.has(g.id));
  const points = [...project.points].sort((x, y) => x.order - y.order).filter((p) => filter === 'toate' || !a[p.id]);

  const save = () => {
    if (v.errors.length) return notify('Corectați erorile înainte de salvare.');
    if (v.warnings.length && !confirm(`Avertismente:\n\n• ${v.warnings.join('\n• ')}\n\nSalvați totuși asocierile?`)) return;
    update((p) => applyAssignment(p, a));
    notify('Asocierile au fost salvate. Fotografia, lista și harta au fost actualizate.');
    onDone();
  };

  if (!project.points.length || !project.gpsPool.length) {
    return (
      <div className="screen">
        <h2>Asociere puncte GPS</h2>
        <p className="muted pad">
          {!project.points.length ? 'Proiectul nu are puncte de instalație. Marcați punctele pe fotografie sau adăugați-le în lista de puncte.' : 'Nu există puncte GPS preluate. Folosiți „Preia puncte” (OCR) sau „Import CSV”.'}
        </p>
        <button className="btn btn-primary block" onClick={onOcr}>Preia puncte</button>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2>Asociere puncte GPS</h2>
      <p className="muted">Alegeți pentru fiecare punct din instalație punctul din GPS care îi corespunde. Numerele GPS nu trebuie să fie consecutive.</p>
      <div className="row gap wrap">
        <button className="btn btn-light" onClick={() => { setA(autoAssignByCode(project, a)); notify('Asociere automată după cod efectuată pentru codurile identice.'); }}>Asociere automată după cod</button>
        <label className="inline">
          Afișează:
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="toate">Toate punctele</option>
            <option value="neasociate">Doar neasociate</option>
          </select>
        </label>
      </div>
      <div className="card">
        <strong>Puncte GPS disponibile:</strong>{' '}
        {free.length ? free.map((g) => `GPS ${g.gpsNo}`).join(', ') : 'toate sunt asociate'}
      </div>

      {points.map((p) => {
        const gid = a[p.id];
        const g = project.gpsPool.find((x) => x.id === gid);
        const dup = gid && Object.entries(a).filter(([, v2]) => v2 === gid).length > 1;
        return (
          <div className={`card assoc ${dup ? 'dup' : ''}`} key={p.id}>
            <div className="row between wrap gap">
              <div><strong>{p.code}</strong> <span className="muted">· {TYPE_LABEL[p.type]}</span></div>
              <select aria-label={`GPS pentru ${p.code}`} value={gid} onChange={(e) => setA({ ...a, [p.id]: e.target.value })}>
                <option value="">— neasociat —</option>
                {project.gpsPool.map((x) => (
                  <option key={x.id} value={x.id}>
                    GPS {x.gpsNo}{x.code ? ` (${x.code})` : ''}{used.has(x.id) && a[p.id] !== x.id ? ' · deja folosit' : ''}
                  </option>
                ))}
              </select>
            </div>
            {g && <div className="coords small"><span><em>Nord X</em>{g.n || '—'}</span><span><em>Est Y</em>{g.e || '—'}</span><span><em>Cotă Z</em>{g.z || '—'}</span></div>}
          </div>
        );
      })}

      {v.errors.map((e) => <p key={e} className="err">⛔ {e}</p>)}
      {v.warnings.map((e) => <p key={e} className="warn small">⚠ {e}</p>)}
      <button className="btn btn-accent block big" onClick={save} disabled={v.errors.length > 0}>Salvează toate asocierile</button>
    </div>
  );
}
