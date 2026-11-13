import { useMemo } from 'react';
import type { Project, SurveyPoint } from '../types';
import { TYPE_COLOR, TYPE_LABEL } from '../types';
import { findDuplicates } from '../lib/numbering';
import { STATUS_LABEL } from '../lib/project';

export type GroupMode = 'nimic' | 'tip' | 'element';

interface Props {
  project: Project;
  points: SurveyPoint[];
  selectedId?: string;
  onSelect: (id: string) => void;
  group?: GroupMode;
  onMove?: (id: string, dir: -1 | 1) => void;
  empty?: string;
}

export function groupPoints(project: Project, points: SurveyPoint[], mode: GroupMode): Array<{ title: string; items: SurveyPoint[] }> {
  const sorted = [...points].sort((a, b) => a.order - b.order);
  if (mode === 'nimic') return [{ title: '', items: sorted }];
  const map = new Map<string, SurveyPoint[]>();
  for (const p of sorted) {
    let key: string;
    if (mode === 'tip') key = TYPE_LABEL[p.type];
    else {
      const valve = p.type === 'robinet' ? p : project.points.find((q) => q.id === p.valveId);
      key = valve ? `Robinet ${valve.code}` : p.type === 'sudura' ? 'Suduri independente' : TYPE_LABEL[p.type];
    }
    map.set(key, [...(map.get(key) ?? []), p]);
  }
  return [...map.entries()].map(([title, items]) => ({ title, items }));
}

export function PointList({ project, points, selectedId, onSelect, group = 'nimic', onMove, empty }: Props) {
  const dups = useMemo(() => findDuplicates(project.points), [project.points]);
  const groups = useMemo(() => groupPoints(project, points, group), [project, points, group]);
  if (!points.length) return <p className="muted pad">{empty ?? 'Nu există puncte.'}</p>;
  return (
    <div className="plist">
      {groups.map((g) => (
        <section key={g.title || 'all'}>
          {g.title && <h4 className="group-title">{g.title} <span className="muted">({g.items.length})</span></h4>}
          {g.items.map((p) => (
            <div key={p.id} className={`pcard ${p.id === selectedId ? 'sel' : ''}`} onClick={() => onSelect(p.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(p.id)}>
              <div className="pcard-top">
                <span className="ord">{p.order}</span>
                <strong className="code">{p.code}</strong>
                {dups.has(p.id) && <span className="warn" title="Cod duplicat">⚠ duplicat</span>}
                <span className="tag" style={{ background: TYPE_COLOR[p.type] }}>{TYPE_LABEL[p.type]}</span>
                <span className={`status ${p.status === 'masurat' ? 'ok' : 'bad'}`}>{STATUS_LABEL[p.status]}</span>
                {onMove && (
                  <span className="mv" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-light sq sm" aria-label={`Mută ${p.code} în sus`} onClick={() => onMove(p.id, -1)}>▲</button>
                    <button className="btn btn-light sq sm" aria-label={`Mută ${p.code} în jos`} onClick={() => onMove(p.id, 1)}>▼</button>
                  </span>
                )}
              </div>
              <div className="coords">
                <span><em>GPS</em>{p.gpsNo || '—'}</span>
                <span><em>Nord X</em>{p.n || '—'}</span>
                <span><em>Est Y</em>{p.e || '—'}</span>
                <span><em>Cotă Z</em>{p.z || '—'}</span>
              </div>
              {p.notes && <div className="pnote">{p.notes}</div>}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
