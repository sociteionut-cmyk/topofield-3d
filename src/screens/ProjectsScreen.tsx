import { useEffect, useState } from 'react';
import type { CrsId, Project } from '../types';
import { CRS_LABEL } from '../types';
import { deleteProject, listProjects, saveProject, uid } from '../lib/db';
import { newProject } from '../lib/project';
import { createDemoProject } from '../lib/demo';

interface Props {
  banner?: string;
  onOpen: (id: string) => void;
  onChanged: () => void;
  notify: (m: string) => void;
}

export function ProjectsScreen({ banner, onOpen, onChanged, notify }: Props) {
  const [list, setList] = useState<Project[]>([]);
  const [editing, setEditing] = useState<Project | 'nou' | null>(null);
  const reload = () => listProjects().then(setList);
  useEffect(() => {
    reload();
  }, []);

  const hasDemo = list.some((p) => p.demo);

  const remove = async (p: Project) => {
    if (!confirm(`Ștergeți definitiv proiectul „${p.name}” cu toate fotografiile și punctele?`)) return;
    await deleteProject(p.id);
    notify('Proiect șters.');
    await reload();
    onChanged();
  };

  const duplicate = async (p: Project) => {
    const { getBlob, putBlob } = await import('../lib/db');
    const map = new Map<string, string>();
    const cp = (ph: Project['photos']) =>
      Promise.all(
        ph.map(async (x) => {
          const id = uid();
          map.set(x.id, id);
          const b = await getBlob(x.id);
          if (b) await putBlob(id, b);
          return { ...x, id };
        }),
      );
    const photos = await cp(p.photos);
    const controllerPhotos = await cp(p.controllerPhotos);
    const idMap = new Map(p.points.map((x) => [x.id, uid()]));
    const copy: Project = {
      ...p,
      id: uid(),
      name: `${p.name} (copie)`,
      createdAt: new Date().toISOString(),
      demo: false,
      photos,
      controllerPhotos,
      points: p.points.map((x) => ({
        ...x,
        id: idMap.get(x.id)!,
        valveId: x.valveId ? idMap.get(x.valveId) : undefined,
        photoId: x.photoId ? map.get(x.photoId) : undefined,
        controllerPhotoId: x.controllerPhotoId ? map.get(x.controllerPhotoId) : undefined,
      })),
      links: p.links.map((l) => ({ id: uid(), a: idMap.get(l.a)!, b: idMap.get(l.b)! })),
      gpsPool: p.gpsPool.map((g) => ({ ...g, controllerPhotoId: g.controllerPhotoId ? map.get(g.controllerPhotoId) : undefined })),
    };
    copy.points = copy.points.map((x) => ({ ...x, poolId: undefined }));
    await saveProject(copy);
    notify('Proiect duplicat.');
    reload();
  };

  const addDemo = async () => {
    await createDemoProject();
    notify('Proiectul demonstrativ „Instalație Gaz” a fost creat.');
    reload();
  };

  return (
    <div className="screen">
      {banner && <div className="banner">{banner}</div>}
      <div className="row between wrap gap">
        <h2>Proiecte</h2>
        <button className="btn btn-primary" onClick={() => setEditing('nou')}>＋ Proiect nou</button>
      </div>
      {list.length === 0 && <p className="muted pad">Nu aveți niciun proiect. Creați unul nou sau încărcați proiectul demonstrativ.</p>}
      {list.map((p) => {
        const measured = p.points.filter((x) => x.status === 'masurat').length;
        return (
          <div className="card" key={p.id}>
            <div className="row between wrap gap">
              <div>
                <h3 style={{ margin: 0 }}>{p.name} {p.demo && <span className="tag demo">DEMO</span>}</h3>
                <div className="muted">{p.site || 'Fără locație'}</div>
                <div className="muted small">Creat: {new Date(p.createdAt).toLocaleDateString('ro-RO')} · {p.photos.length} foto · {measured}/{p.points.length} puncte măsurate</div>
              </div>
              <button className="btn btn-primary" onClick={() => onOpen(p.id)}>Deschide</button>
            </div>
            <div className="row gap wrap top">
              <button className="btn btn-light" onClick={() => setEditing(p)}>Editează / redenumește</button>
              <button className="btn btn-light" onClick={() => duplicate(p)}>Duplică</button>
              <button className="btn btn-danger" onClick={() => remove(p)}>Șterge</button>
            </div>
          </div>
        );
      })}
      {!hasDemo && (
        <button className="btn btn-light block" onClick={addDemo}>Încarcă proiectul demonstrativ „Instalație Gaz”</button>
      )}
      {editing && (
        <ProjectForm
          project={editing === 'nou' ? undefined : editing}
          onCancel={() => setEditing(null)}
          onSave={async (p) => {
            await saveProject(p);
            setEditing(null);
            await reload();
            onChanged();
            if (editing === 'nou') onOpen(p.id);
          }}
        />
      )}
    </div>
  );
}

function ProjectForm({ project, onSave, onCancel }: { project?: Project; onSave: (p: Project) => void; onCancel: () => void }) {
  const [name, setName] = useState(project?.name ?? '');
  const [site, setSite] = useState(project?.site ?? '');
  const [crs, setCrs] = useState<CrsId>(project?.crs ?? 'stereo70');
  const [notes, setNotes] = useState(project?.notes ?? '');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const base = project ?? newProject(name.trim(), site.trim());
    onSave({ ...base, name: name.trim(), site: site.trim(), crs, notes });
  };
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <form className="modal-box" onSubmit={submit}>
        <h3>{project ? 'Editează proiectul' : 'Proiect nou'}</h3>
        <label>Numele proiectului<input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Stația de reglare Nord" /></label>
        <label>Locația / denumirea șantierului<input value={site} onChange={(e) => setSite(e.target.value)} /></label>
        <label>
          Sistemul de coordonate
          <select value={crs} onChange={(e) => setCrs(e.target.value as CrsId)}>
            {(Object.keys(CRS_LABEL) as CrsId[]).map((c) => (
              <option key={c} value={c}>{CRS_LABEL[c]}</option>
            ))}
          </select>
        </label>
        <label>Observații<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <div className="row gap end">
          <button type="button" className="btn btn-light" onClick={onCancel}>Renunță</button>
          <button type="submit" className="btn btn-primary">Salvează</button>
        </div>
      </form>
    </div>
  );
}
