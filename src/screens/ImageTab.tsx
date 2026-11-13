import { useState } from 'react';
import type { PhotoMeta, Project } from '../types';
import { downscaleImage } from '../lib/imaging';
import { deleteBlob, putBlob, uid } from '../lib/db';
import { ImageEditor } from '../components/ImageEditor';
import { PointList } from '../components/PointList';

interface Props {
  project: Project;
  update: (fn: (p: Project) => Project) => void;
  selectedId?: string;
  onSelect: (id?: string) => void;
  onOpenDetails: (id: string) => void;
  notify: (m: string) => void;
}

const KINDS = ['Vedere de ansamblu', 'Vedere laterală', 'Vedere din spate', 'Detaliu'];

export function ImageTab({ project, update, selectedId, onSelect, onOpenDetails, notify }: Props) {
  const [photoId, setPhotoId] = useState<string | undefined>(project.photos[0]?.id);
  const [kind, setKind] = useState(KINDS[0]);
  const [busy, setBusy] = useState(false);
  const current = project.photos.find((p) => p.id === photoId) ?? project.photos[0];

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const added: PhotoMeta[] = [];
      for (const f of Array.from(files)) {
        const blob = await downscaleImage(f);
        const id = uid();
        await putBlob(id, blob);
        added.push({ id, name: `${kind} ${project.photos.length + added.length + 1}`, kind, addedAt: new Date().toISOString() });
      }
      update((p) => ({ ...p, photos: [...p.photos, ...added] }));
      setPhotoId(added[0].id);
      notify(`${added.length} fotografie/fotografii adăugate.`);
    } catch {
      notify('Fotografia nu a putut fi încărcată.');
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async (ph: PhotoMeta) => {
    if (!confirm(`Ștergeți fotografia „${ph.name}”? Marcajele de pe ea vor fi scoase (punctele rămân în listă).`)) return;
    await deleteBlob(ph.id);
    update((p) => ({
      ...p,
      photos: p.photos.filter((x) => x.id !== ph.id),
      points: p.points.map((q) => (q.photoId === ph.id ? { ...q, photoId: undefined, mark: undefined } : q)),
    }));
    setPhotoId(undefined);
  };

  const onPhoto = project.points.filter((p) => p.photoId === current?.id);
  const unplaced = project.points.filter((p) => !p.mark);

  return (
    <div>
      <div className="card">
        <div className="row gap wrap">
          <label className="btn btn-primary filebtn">
            📷 Fotografiază
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <label className="btn btn-light filebtn">
            🖼 Din galerie
            <input type="file" accept="image/*" multiple hidden data-testid="photo-input" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <select aria-label="Tipul fotografiei" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k}>{k}</option>)}
          </select>
          {busy && <span className="muted">Se salvează…</span>}
        </div>
        {project.photos.length > 0 && (
          <div className="strip">
            {project.photos.map((ph) => (
              <button key={ph.id} className={`chip ${ph.id === current?.id ? 'chip-on' : ''}`} onClick={() => { setPhotoId(ph.id); onSelect(undefined); }}>
                {ph.name}
              </button>
            ))}
          </div>
        )}
        {current && (
          <div className="row gap wrap top">
            <input aria-label="Denumire fotografie" value={current.name} onChange={(e) => update((p) => ({ ...p, photos: p.photos.map((x) => (x.id === current.id ? { ...x, name: e.target.value } : x)) }))} />
            <button className="btn btn-danger" onClick={() => removePhoto(current)}>Șterge fotografia</button>
          </div>
        )}
      </div>

      {current ? (
        <>
          <ImageEditor key={current.id} project={project} photoId={current.id} update={update} selectedId={selectedId} onSelect={onSelect} onOpenDetails={onOpenDetails} notify={notify} />
          <h3>Puncte pe această fotografie ({onPhoto.length})</h3>
          <PointList project={project} points={onPhoto} selectedId={selectedId} onSelect={onSelect} empty="Nu ați marcat încă puncte pe această fotografie. Apăsați „Editează imaginea”." />
        </>
      ) : (
        <p className="muted pad">Adăugați o fotografie a instalației (cameră sau galerie) pentru a marca punctele.</p>
      )}
      {current && unplaced.length > 0 && (
        <>
          <h3>Puncte fără marcaj ({unplaced.length})</h3>
          <p className="muted small">Selectați un punct, apoi „Plasează pe fotografie”.</p>
          <PointList project={project} points={unplaced} selectedId={selectedId} onSelect={onSelect} />
        </>
      )}
    </div>
  );
}
