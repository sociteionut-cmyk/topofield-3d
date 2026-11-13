import type { GpsPoint, Project, SurveyPoint } from '../types';
import { canvasToBlob } from './imaging';
import { putBlob, saveProject, uid } from './db';
import { newPoint, newProject } from './project';
import { weldCodeForValve } from './numbering';

export const DEMO_GPS = [
  { gpsNo: '7', n: '10250.412', e: '20480.115', z: '98.402' },
  { gpsNo: '8', n: '10251.905', e: '20480.987', z: '98.455' },
  { gpsNo: '9', n: '10253.398', e: '20481.860', z: '98.401' },
  { gpsNo: '10', n: '10262.771', e: '20489.304', z: '99.120' },
];

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Imagine ilustrativă (desenată local) cu o instalație de gaz: conducte galbene, robineți, suduri și flanșe. */
export async function demoInstallationImage(): Promise<Blob> {
  const c = canvas(1600, 1000);
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, 1000);
  bg.addColorStop(0, '#37475a');
  bg.addColorStop(1, '#1f2a37');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1600, 1000);
  g.fillStyle = '#2b3846';
  for (let x = 0; x < 1600; x += 160) g.fillRect(x, 0, 6, 1000);
  const pipe = (x1: number, x2: number, y: number, t = 70) => {
    const gr = g.createLinearGradient(0, y - t / 2, 0, y + t / 2);
    gr.addColorStop(0, '#fde047');
    gr.addColorStop(0.5, '#eab308');
    gr.addColorStop(1, '#a16207');
    g.fillStyle = gr;
    g.fillRect(x1, y - t / 2, x2 - x1, t);
  };
  pipe(60, 1540, 500);
  pipe(1380, 1450, 500, 70);
  g.fillStyle = '#eab308';
  g.fillRect(1380, 500, 70, 300); // cot spre jos
  const valves = [0.22, 0.5, 0.78];
  for (const vx of valves) {
    const x = vx * 1600;
    g.fillStyle = '#9ca3af';
    for (const dx of [-118, 118]) g.fillRect(x + dx - 12, 440, 24, 120); // flanșe
    g.fillStyle = '#b91c1c';
    g.fillRect(x - 80, 455, 160, 90); // corp robinet
    g.fillStyle = '#7f1d1d';
    g.fillRect(x - 12, 380, 24, 80); // tijă
    g.fillStyle = '#dc2626';
    g.fillRect(x - 70, 360, 140, 28); // volant
    g.strokeStyle = '#d1d5db';
    g.lineWidth = 8;
    for (const dx of [-95, 95]) {
      g.beginPath();
      g.arc(x + dx, 500, 42, 0, Math.PI * 2);
      g.stroke(); // suduri
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.font = 'bold 34px sans-serif';
  g.fillText('IMAGINE DEMONSTRATIVĂ – desen ilustrativ, nu o măsurătoare reală', 60, 70);
  return canvasToBlob(c, 'image/jpeg', 0.9);
}

/** Ecran de controller GPS simulat (text desenat), folosit ca exemplu pentru „Preia puncte”. */
export async function demoControllerImage(rows = DEMO_GPS): Promise<Blob> {
  const c = canvas(1000, 120 + rows.length * 70 + 140);
  const g = c.getContext('2d')!;
  g.fillStyle = '#141c28';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#7dd3fc';
  g.font = '28px Consolas, "Courier New", monospace';
  g.fillText('Punct        Nord          Est         Cota', 20, 50);
  g.fillStyle = '#ffffff';
  rows.forEach((r, i) => {
    g.fillText(`${r.gpsNo.padEnd(7)}${r.n.padEnd(14)}${r.e.padEnd(13)}${r.z}`, 20, 120 + i * 70);
  });
  g.fillStyle = '#86efac';
  g.fillText('RTK Fix   HRMS 0.012', 20, c.height - 50);
  g.fillStyle = '#fca5a5';
  g.font = '20px sans-serif';
  g.fillText('DEMONSTRATIV – coordonate fictive', 560, c.height - 20);
  return canvasToBlob(c, 'image/png');
}

export async function createDemoProject(): Promise<Project> {
  const p = newProject('Instalație Gaz', 'DEMO – coordonate fictive (nu este o măsurătoare reală)');
  p.demo = true;
  p.crs = 'altul';
  p.notes = 'PROIECT DEMONSTRATIV. Imaginea și toate coordonatele sunt fictive și nu trebuie folosite ca măsurătoare reală.';

  const photoId = uid();
  await putBlob(photoId, await demoInstallationImage());
  p.photos.push({ id: photoId, name: 'Ansamblu (demo)', kind: 'Vedere de ansamblu', addedAt: p.createdAt });

  const ctrlId = uid();
  await putBlob(ctrlId, await demoControllerImage());
  p.controllerPhotos.push({ id: ctrlId, name: 'Controller GPS (demo)', kind: 'Controller', addedAt: p.createdAt, role: 'complet' });

  p.gpsPool = DEMO_GPS.map<GpsPoint>((d) => ({ id: uid(), ...d, code: '', rtk: 'Fix', uncertain: [], controllerPhotoId: ctrlId, measuredAt: p.createdAt, source: 'demo' }));

  const vx = [0.22, 0.5, 0.78];
  const pts: SurveyPoint[] = [];
  let order = 1;
  let weld = 1;
  vx.forEach((x, i) => {
    const vcode = `R${String(i + 1).padStart(2, '0')}`;
    const valve = newPoint({ code: vcode, type: 'robinet', order: 0, role: 'centru', photoId, mark: { x, y: 0.5, lx: x, ly: 0.3 } });
    const left = newPoint({ code: weldCodeForValve(vcode, weld++), type: 'sudura', order: 0, role: 'stanga', valveId: valve.id, photoId, mark: { x: x - 0.059, y: 0.5, lx: x - 0.09, ly: 0.68 } });
    const right = newPoint({ code: weldCodeForValve(vcode, weld++), type: 'sudura', order: 0, role: 'dreapta', valveId: valve.id, photoId, mark: { x: x + 0.059, y: 0.5, lx: x + 0.09, ly: 0.68 } });
    for (const q of [left, valve, right]) pts.push({ ...q, order: order++ });
  });
  p.points = pts;

  const assoc = [pts[0], pts[1], pts[2]];
  assoc.forEach((pt, i) => {
    const g = p.gpsPool[i];
    Object.assign(pt, {
      poolId: g.id,
      gpsNo: g.gpsNo,
      rtk: g.rtk,
      n: g.n,
      e: g.e,
      z: g.z,
      orig: { n: g.n, e: g.e, z: g.z },
      controllerPhotoId: ctrlId,
      measuredAt: p.createdAt,
      status: 'masurat',
    });
  });
  pts[1].extraZ = [{ id: uid(), label: 'Cota terenului', z: '98.120' }];
  p.links = [
    { id: uid(), a: pts[0].id, b: pts[1].id },
    { id: uid(), a: pts[1].id, b: pts[2].id },
  ];
  await saveProject(p);
  return p;
}
