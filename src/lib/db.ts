import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project } from '../types';

interface TopoDB extends DBSchema {
  projects: { key: string; value: Project };
  blobs: { key: string; value: { id: string; blob: Blob } };
}

let dbp: Promise<IDBPDatabase<TopoDB>> | null = null;

export function db() {
  if (!dbp) {
    dbp = openDB<TopoDB>('topofield3d', 1, {
      upgrade(d) {
        d.createObjectStore('projects', { keyPath: 'id' });
        d.createObjectStore('blobs', { keyPath: 'id' });
      },
    });
  }
  return dbp;
}

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export async function listProjects(): Promise<Project[]> {
  const all = await (await db()).getAll('projects');
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await db()).get('projects', id);
}

export async function saveProject(p: Project): Promise<void> {
  await (await db()).put('projects', { ...p, updatedAt: new Date().toISOString() });
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  await (await db()).put('blobs', { id, blob });
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  return (await (await db()).get('blobs', id))?.blob;
}

export async function deleteBlob(id: string): Promise<void> {
  await (await db()).delete('blobs', id);
}

export async function deleteProject(id: string): Promise<void> {
  const d = await db();
  const p = await d.get('projects', id);
  if (p) for (const ph of [...p.photos, ...p.controllerPhotos]) await d.delete('blobs', ph.id);
  await d.delete('projects', id);
}

export async function clearAll(): Promise<void> {
  const d = await db();
  await d.clear('projects');
  await d.clear('blobs');
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export interface BackupFile {
  app: 'TopoField 3D';
  version: 1;
  exportedAt: string;
  projects: Project[];
  blobs: Record<string, { type: string; data: string }>;
}

export async function buildBackup(projectIds?: string[]): Promise<BackupFile> {
  const d = await db();
  const projects = (await d.getAll('projects')).filter((p) => !projectIds || projectIds.includes(p.id));
  const blobs: BackupFile['blobs'] = {};
  for (const p of projects) {
    for (const ph of [...p.photos, ...p.controllerPhotos]) {
      const b = await d.get('blobs', ph.id);
      if (b) blobs[ph.id] = { type: b.blob.type, data: await blobToBase64(b.blob) };
    }
  }
  return { app: 'TopoField 3D', version: 1, exportedAt: new Date().toISOString(), projects, blobs };
}

/** Restaurează proiectele din copia de siguranță. Proiectele existente cu același id sunt înlocuite. */
export async function restoreBackup(data: unknown): Promise<number> {
  const b = data as BackupFile;
  if (!b || b.app !== 'TopoField 3D' || !Array.isArray(b.projects) || typeof b.blobs !== 'object') {
    throw new Error('Fișierul nu este o copie de siguranță TopoField 3D validă.');
  }
  const d = await db();
  for (const [id, v] of Object.entries(b.blobs)) await d.put('blobs', { id, blob: base64ToBlob(v.data, v.type) });
  for (const p of b.projects) await d.put('projects', p);
  return b.projects.length;
}
