export type Dest = 'projects' | 'photos' | 'points' | 'ocr' | 'csv' | 'export' | 'map' | 'settings';

const TILES: Array<[Dest, string, string]> = [
  ['projects', '📁', 'Proiecte'],
  ['photos', '📷', 'Fotografii'],
  ['points', '📍', 'Puncte instalație'],
  ['ocr', '🔎', 'Preia puncte'],
  ['csv', '📄', 'Import CSV'],
  ['export', '📤', 'Export'],
  ['map', '🗺️', 'Hartă'],
  ['settings', '⚙️', 'Setări'],
];

export function HomeScreen({ go, projectName }: { go: (d: Dest) => void; projectName?: string }) {
  return (
    <div className="screen">
      <p className="muted">{projectName ? <>Proiect curent: <strong>{projectName}</strong></> : 'Niciun proiect deschis. Începeți din „Proiecte”.'}</p>
      <div className="tiles">
        {TILES.map(([d, ico, label]) => (
          <button key={d} className="tile" data-testid={`tile-${d}`} onClick={() => go(d)}>
            <span className="ico">{ico}</span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
