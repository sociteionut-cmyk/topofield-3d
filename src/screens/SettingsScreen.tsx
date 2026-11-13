import { useState } from 'react';
import type { Settings } from '../types';
import { buildBackup, clearAll, restoreBackup } from '../lib/db';
import { saveFile } from '../lib/files';
import { warmUpOcr } from '../lib/ocr';
import { useOnline } from '../hooks';

interface Props {
  settings: Settings;
  setSettings: (s: Settings) => void;
  notify: (m: string) => void;
  onChanged: () => void;
}

export function SettingsScreen({ settings, setSettings, notify, onChanged }: Props) {
  const online = useOnline();
  const [ocrMsg, setOcrMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const backup = async () => {
    setBusy(true);
    try {
      const b = await buildBackup();
      const stamp = new Date().toISOString().slice(0, 10);
      await saveFile(new Blob([JSON.stringify(b)], { type: 'application/json' }), `TopoField_backup_${stamp}.json`);
      notify(`Copie de siguranță creată (${b.projects.length} proiecte).`);
    } catch (e) {
      notify(`Copia de siguranță a eșuat: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (f?: File) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!confirm('Restaurarea înlocuiește proiectele cu același identificator. Continuați?')) return;
      const n = await restoreBackup(data);
      notify(`${n} proiecte restaurate.`);
      onChanged();
    } catch (e) {
      notify((e as Error).message || 'Fișier invalid.');
    }
  };

  const prepareOcr = async () => {
    setOcrMsg('Se pregătește motorul OCR…');
    try {
      await warmUpOcr((s, p) => setOcrMsg(`${s} ${Math.round(p * 100)}%`));
      setOcrMsg('✔ Motorul OCR este pregătit și salvat pentru utilizare offline.');
    } catch (e) {
      setOcrMsg(`Eroare: ${(e as Error).message}. ${online ? '' : 'Conectați-vă la internet.'}`);
    }
  };

  return (
    <div className="screen">
      <h2>Setări</h2>
      <div className="card">
        <h3>Export CSV implicit</h3>
        <div className="grid2">
          <label>Separator
            <select value={settings.csvSeparator} onChange={(e) => setSettings({ ...settings, csvSeparator: e.target.value as Settings['csvSeparator'] })}>
              <option value=";">Punct și virgulă</option>
              <option value=",">Virgulă</option>
              <option value={'\t'}>Tab</option>
            </select>
          </label>
          <label>Zecimale
            <select value={settings.csvDecimal} onChange={(e) => setSettings({ ...settings, csvDecimal: e.target.value as Settings['csvDecimal'] })}>
              <option value=".">Punct</option>
              <option value=",">Virgulă</option>
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <h3>Copii de siguranță</h3>
        <p className="muted small">Salvează toate proiectele, fotografiile și punctele într-un fișier. Îl puteți restaura oricând, inclusiv pe alt dispozitiv.</p>
        <div className="row gap wrap">
          <button className="btn btn-primary" disabled={busy} onClick={backup}>Creează copie de siguranță</button>
          <label className="btn btn-light filebtn">Restaurează din fișier<input data-testid="restore-input" type="file" accept=".json,application/json" hidden onChange={(e) => { restore(e.target.files?.[0]); e.target.value = ''; }} /></label>
        </div>
      </div>

      <div className="card">
        <h3>Funcționare offline</h3>
        <ul className="plain">
          <li>Proiectele, fotografiile și marcajele se salvează local și se pot folosi fără internet.</li>
          <li>Harta în mod „Schemă” funcționează fără internet. Fundalul geografic (OpenStreetMap) necesită internet.</li>
          <li>OCR: motorul rulează local, dar trebuie încărcat o dată cu internet.</li>
        </ul>
        <p>Stare conexiune: <strong>{online ? 'online' : 'offline'}</strong></p>
        <button className="btn btn-light" disabled={!online} onClick={prepareOcr}>Pregătește OCR pentru offline</button>
        {ocrMsg && <p className="small">{ocrMsg}</p>}
      </div>

      <div className="card">
        <h3>Date</h3>
        <button className="btn btn-danger" onClick={async () => { if (confirm('Ștergeți TOATE proiectele de pe acest dispozitiv? Acțiunea nu poate fi anulată.')) { await clearAll(); notify('Toate datele au fost șterse.'); onChanged(); } }}>Șterge toate datele</button>
      </div>
      <p className="muted small">TopoField 3D · versiunea 1.0</p>
    </div>
  );
}
