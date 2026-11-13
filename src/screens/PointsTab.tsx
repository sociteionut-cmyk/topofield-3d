import { useState } from 'react';
import type { PointType, Project } from '../types';
import { TYPE_LABEL } from '../types';
import { PointList, type GroupMode } from '../components/PointList';
import { moveBefore, nextCode, renumber } from '../lib/numbering';
import { newPoint } from '../lib/project';

interface Props {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  selectedId?: string;
  onOpenDetails: (id: string) => void;
  notify: (m: string) => void;
}

export function PointsTab({ project, update, selectedId, onOpenDetails, notify }: Props) {
  const [group, setGroup] = useState<GroupMode>('nimic');
  const [type, setType] = useState<PointType>('alt');
  const [custom, setCustom] = useState('');

  const add = () => {
    const c = custom.trim();
    if (c && project.points.some((p) => p.code.toLowerCase() === c.toLowerCase())) {
      notify(`Codul „${c}” există deja.`);
      return;
    }
    const code = c || nextCode(project.points, type);
    update((p) => ({ ...p, points: [...p.points, newPoint({ code, customCode: !!c, type, order: p.points.length + 1 })] }));
    setCustom('');
    notify(`Punctul ${code} a fost adăugat. Îl puteți plasa pe fotografie din tab-ul „Imagine”.`);
  };

  const measured = project.points.filter((p) => p.status === 'masurat').length;

  return (
    <div>
      <div className="card">
        <div className="row between wrap gap">
          <strong>{project.points.length} puncte · {measured} măsurate · {project.points.length - measured} de măsurat</strong>
        </div>
        <div className="grid3 top">
          <label>
            Tip punct
            <select value={type} onChange={(e) => setType(e.target.value as PointType)}>
              {(Object.keys(TYPE_LABEL) as PointType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </label>
          <label>
            Cod (opțional)
            <input value={custom} placeholder={nextCode(project.points, type)} onChange={(e) => setCustom(e.target.value)} />
          </label>
          <button className="btn btn-primary self-end" onClick={add}>＋ Adaugă punct</button>
        </div>
        <div className="row gap wrap top">
          <label className="inline">
            Grupare:
            <select value={group} onChange={(e) => setGroup(e.target.value as GroupMode)}>
              <option value="nimic">Fără grupare (ordinea mea)</option>
              <option value="element">După robinet / element</option>
              <option value="tip">După tip (cot, conductă, …)</option>
            </select>
          </label>
          <button
            className="btn btn-light"
            onClick={() => {
              if (!confirm('Renumerotez automat codurile (robineți, suduri, coturi …) după ordinea curentă? Codurile personalizate rămân neschimbate.')) return;
              update((p) => ({ ...p, points: renumber(p.points) }));
              notify('Codurile au fost renumerotate după ordine.');
            }}
          >
            Renumerotează după ordine
          </button>
        </div>
      </div>
      <PointList
        project={project}
        points={project.points}
        selectedId={selectedId}
        onSelect={onOpenDetails}
        group={group}
        onMove={group === 'nimic' ? (id, dir) => update((p) => ({ ...p, points: moveBefore(p.points, id, dir) })) : undefined}
        empty="Nu există puncte. Adăugați-le aici sau marcați-le pe fotografie."
      />
    </div>
  );
}
