import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, type Project, type Settings } from './types';
import { getBlob, getProject, saveProject } from './lib/db';

export function useBlobUrl(id: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let revoked = false;
    let u: string | undefined;
    setUrl(undefined);
    if (!id) return;
    getBlob(id).then((b) => {
      if (b && !revoked) {
        u = URL.createObjectURL(b);
        setUrl(u);
      }
    });
    return () => {
      revoked = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  return url;
}

export function useOnline(): boolean {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true);
    const b = () => setOn(false);
    window.addEventListener('online', a);
    window.addEventListener('offline', b);
    return () => {
      window.removeEventListener('online', a);
      window.removeEventListener('offline', b);
    };
  }, []);
  return on;
}

const KEY = 'topofield.settings';

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings(): [Settings, (s: Settings) => void] {
  const [s, setS] = useState<Settings>(loadSettings);
  const set = useCallback((n: Settings) => {
    localStorage.setItem(KEY, JSON.stringify(n));
    setS(n);
  }, []);
  return [s, set];
}

/** Încarcă un proiect și salvează automat în IndexedDB la fiecare modificare. */
export function useProject(id: string | undefined, reloadKey = 0) {
  const [project, setProject] = useState<Project | undefined>();
  const [loaded, setLoaded] = useState<string | undefined>('');
  const key = id ? `${id}#${reloadKey}` : '';
  const loading = loaded !== key;
  const ref = useRef<Project | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    if (!id) {
      ref.current = undefined;
      setProject(undefined);
      setLoaded('');
      return;
    }
    getProject(id).then((p) => {
      if (!alive) return;
      ref.current = p;
      setProject(p);
      setLoaded(key);
    });
    return () => {
      alive = false;
    };
  }, [id, key]);

  const update = useCallback((fn: (p: Project) => Project) => {
    if (!ref.current) return;
    const next = fn(ref.current);
    ref.current = next;
    setProject(next);
    chain.current = chain.current.then(() => saveProject(next));
  }, []);

  const flush = useCallback(() => chain.current, []);
  return { project, loading, update, flush };
}
