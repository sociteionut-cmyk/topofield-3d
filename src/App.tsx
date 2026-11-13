import { useCallback, useEffect, useState } from 'react';
import { useOnline, useProject, useSettings } from './hooks';
import { HomeScreen, type Dest } from './screens/HomeScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ImageTab } from './screens/ImageTab';
import { PointsTab } from './screens/PointsTab';
import { DetailsTab } from './screens/DetailsTab';
import { MapTab } from './screens/MapTab';
import { OcrScreen } from './screens/OcrScreen';
import { AssocScreen } from './screens/AssocScreen';
import { CsvScreen } from './screens/CsvScreen';
import { ExportScreen } from './screens/ExportScreen';
import { SettingsScreen } from './screens/SettingsScreen';

type View = 'home' | 'projects' | 'image' | 'points' | 'details' | 'map' | 'ocr' | 'assoc' | 'csv' | 'export' | 'settings';
const LAST = 'topofield.lastProject';
const TABS: Array<[View, string]> = [['image', 'Imagine'], ['points', 'Puncte'], ['details', 'Detalii'], ['map', 'Hartă']];
const NEEDS_PROJECT: View[] = ['image', 'points', 'details', 'map', 'ocr', 'assoc', 'csv', 'export'];

export function App() {
  const [view, setView] = useState<View>('home');
  const [projectId, setProjectId] = useState<string | undefined>(() => localStorage.getItem(LAST) ?? undefined);
  const [reloadKey, setReloadKey] = useState(0);
  const [toast, setToast] = useState('');
  const [banner, setBanner] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [settings, setSettings] = useSettings();
  const online = useOnline();
  const { project, loading, update } = useProject(projectId, reloadKey);

  const notify = useCallback((m: string) => setToast(m), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const open = (id: string) => {
    localStorage.setItem(LAST, id);
    setProjectId(id);
    setSelectedId(undefined);
    setBanner(undefined);
    setView('image');
  };

  const go = (v: View) => {
    if (NEEDS_PROJECT.includes(v) && !projectId) {
      setBanner('Alegeți sau creați mai întâi un proiect.');
      setView('projects');
      return;
    }
    setBanner(undefined);
    setView(v);
  };

  const dest = (d: Dest) => go(({ photos: 'image', points: 'points' } as Record<string, View>)[d] ?? (d as View));
  const changed = () => setReloadKey((k) => k + 1);
  const projectGone = projectId && !loading && !project;
  useEffect(() => {
    if (projectGone) {
      localStorage.removeItem(LAST);
      setProjectId(undefined);
    }
  }, [projectGone]);

  const inProject = !!project && !loading && NEEDS_PROJECT.includes(view);
  const title = view === 'home' ? 'TopoField 3D' : project && inProject ? project.name : view === 'projects' ? 'Proiecte' : view === 'settings' ? 'Setări' : 'Se încarcă…';

  return (
    <div className="app">
      <header className="top-bar">
        {view !== 'home' && <button className="back" aria-label="Acasă" onClick={() => setView('home')}>‹</button>}
        <h1>{title}</h1>
        <span className={`net ${online ? 'on' : 'off'}`}>{online ? 'online' : 'offline'}</span>
      </header>

      {project?.demo && inProject && <div className="demo-banner">Proiect demonstrativ — coordonatele sunt fictive.</div>}

      {inProject && (
        <nav className="tabs">
          {TABS.map(([v, l]) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{l}</button>
          ))}
        </nav>
      )}
      {inProject && (
        <div className="actions">
          <button className="btn btn-light sm" onClick={() => setView('ocr')}>Preia puncte</button>
          <button className="btn btn-light sm" onClick={() => setView('assoc')}>Asociere</button>
          <button className="btn btn-light sm" onClick={() => setView('csv')}>Import CSV</button>
          <button className="btn btn-light sm" onClick={() => setView('export')}>Export</button>
        </div>
      )}

      <main>
        {view === 'home' && <HomeScreen go={dest} projectName={project?.name} />}
        {view === 'projects' && <ProjectsScreen banner={banner} onOpen={open} onChanged={changed} notify={notify} />}
        {view === 'settings' && <SettingsScreen settings={settings} setSettings={setSettings} notify={notify} onChanged={() => { changed(); setProjectId(undefined); localStorage.removeItem(LAST); }} />}
        {NEEDS_PROJECT.includes(view) && loading && <p className="pad muted">Se încarcă…</p>}
        {project && inProject && (
          <>
            {view === 'image' && <ImageTab project={project} update={update} selectedId={selectedId} onSelect={setSelectedId} onOpenDetails={(id) => { setSelectedId(id); setView('details'); }} notify={notify} />}
            {view === 'points' && <PointsTab project={project} update={update} selectedId={selectedId} onOpenDetails={(id) => { setSelectedId(id); setView('details'); }} notify={notify} />}
            {view === 'details' && <DetailsTab project={project} pointId={selectedId} onPick={setSelectedId} update={update} onShowOnImage={(id) => { setSelectedId(id); setView('image'); }} notify={notify} />}
            {view === 'map' && <MapTab project={project} update={update} onOpenDetails={(id) => { setSelectedId(id); setView('details'); }} />}
            {view === 'ocr' && <OcrScreen project={project} update={update} onDone={() => setView('assoc')} notify={notify} />}
            {view === 'assoc' && <AssocScreen project={project} update={update} onDone={() => setView('points')} onOcr={() => setView('ocr')} notify={notify} />}
            {view === 'csv' && <CsvScreen project={project} update={update} onDone={() => setView('assoc')} notify={notify} />}
            {view === 'export' && <ExportScreen project={project} settings={settings} notify={notify} />}
          </>
        )}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
