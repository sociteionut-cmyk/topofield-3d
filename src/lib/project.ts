import type { GpsPoint, PointType, Project, SurveyPoint } from '../types';
import { parseNum, plausibleStereo70 } from './coords';
import { uid } from './db';

export function newProject(name: string, site: string): Project {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name,
    site,
    createdAt: now,
    updatedAt: now,
    crs: 'stereo70',
    notes: '',
    photos: [],
    controllerPhotos: [],
    points: [],
    gpsPool: [],
    links: [],
    imports: [],
  };
}

export function newPoint(partial: Partial<SurveyPoint> & { code: string; type: PointType; order: number }): SurveyPoint {
  return {
    id: uid(),
    n: '',
    e: '',
    z: '',
    notes: '',
    status: 'de_masurat',
    extraZ: [],
    ...partial,
  };
}

export const STATUS_LABEL = { de_masurat: 'De măsurat', masurat: 'Măsurat' } as const;

export type Assignment = Record<string, string>; // pointId -> poolId ('' = neasociat)

export function initialAssignment(p: Project): Assignment {
  const a: Assignment = {};
  for (const pt of p.points) a[pt.id] = pt.poolId && p.gpsPool.some((g) => g.id === pt.poolId) ? pt.poolId : '';
  return a;
}

/** Asociere automată după cod, doar pentru punctele încă neasociate și GPS-urile nefolosite. */
export function autoAssignByCode(p: Project, current: Assignment): Assignment {
  const next = { ...current };
  const used = new Set(Object.values(next).filter(Boolean));
  for (const pt of p.points) {
    if (next[pt.id]) continue;
    const g = p.gpsPool.find((x) => x.code && x.code.trim().toLowerCase() === pt.code.trim().toLowerCase() && !used.has(x.id));
    if (g) {
      next[pt.id] = g.id;
      used.add(g.id);
    }
  }
  return next;
}

export interface Validation {
  errors: string[];
  warnings: string[];
}

export function validateAssignment(p: Project, a: Assignment): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byGps = new Map<string, SurveyPoint[]>();
  for (const pt of p.points) {
    const gid = a[pt.id];
    if (!gid) continue;
    byGps.set(gid, [...(byGps.get(gid) ?? []), pt]);
  }
  for (const [gid, pts] of byGps) {
    const g = p.gpsPool.find((x) => x.id === gid);
    if (!g) continue;
    const label = `punctul GPS ${g.gpsNo || '(fără număr)'}`;
    if (pts.length > 1) errors.push(`Duplicat: ${label} este asociat la ${pts.length} puncte (${pts.map((x) => x.code).join(', ')}).`);
    if (parseNum(g.n) === undefined || parseNum(g.e) === undefined) errors.push(`Valori lipsă: ${label} nu are Nord/Est valide.`);
    else if (parseNum(g.z) === undefined) warnings.push(`${label} nu are cotă Z; punctul nu va fi marcat „Măsurat”.`);
    if (g.uncertain.length) warnings.push(`${label} are valori incerte (${g.uncertain.join(', ')}). Verificați-le în „Preia puncte”.`);
    if (p.crs === 'stereo70' && parseNum(g.n) !== undefined && parseNum(g.e) !== undefined && !plausibleStereo70(parseNum(g.n)!, parseNum(g.e)!)) {
      warnings.push(`${label}: coordonatele par în afara Stereo 70 (posibil Nord/Est inversate).`);
    }
  }
  for (const pt of p.points) {
    const gid = a[pt.id];
    if (gid && pt.poolId && pt.poolId !== gid && pt.status === 'masurat') warnings.push(`${pt.code} era deja măsurat; asocierea îi înlocuiește coordonatele.`);
  }
  return { errors, warnings };
}

export function applyAssignment(p: Project, a: Assignment): Project {
  const points = p.points.map((pt) => {
    const gid = a[pt.id] ?? '';
    if (!gid) {
      if (pt.poolId) {
        return { ...pt, poolId: undefined, gpsNo: undefined, gpsCode: undefined, rtk: undefined, n: '', e: '', z: '', orig: undefined, controllerPhotoId: undefined, measuredAt: undefined, status: 'de_masurat' as const };
      }
      return pt;
    }
    const g = p.gpsPool.find((x) => x.id === gid);
    if (!g) return pt;
    const complete = parseNum(g.n) !== undefined && parseNum(g.e) !== undefined && parseNum(g.z) !== undefined;
    return {
      ...pt,
      poolId: g.id,
      gpsNo: g.gpsNo,
      gpsCode: g.code || undefined,
      rtk: g.rtk || undefined,
      n: g.n,
      e: g.e,
      z: g.z,
      orig: { n: g.n, e: g.e, z: g.z },
      controllerPhotoId: g.controllerPhotoId,
      measuredAt: g.measuredAt,
      status: complete ? ('masurat' as const) : ('de_masurat' as const),
    };
  });
  return { ...p, points };
}

export function mergeIntoPool(pool: GpsPoint[], incoming: GpsPoint[]): GpsPoint[] {
  const out = [...pool];
  for (const g of incoming) {
    const i = g.gpsNo ? out.findIndex((x) => x.gpsNo.trim().toLowerCase() === g.gpsNo.trim().toLowerCase()) : -1;
    if (i >= 0) out[i] = { ...g, id: out[i].id };
    else out.push(g);
  }
  return out;
}

export function distanceInfo(a: SurveyPoint, b: SurveyPoint) {
  const an = parseNum(a.n), ae = parseNum(a.e), az = parseNum(a.z);
  const bn = parseNum(b.n), be = parseNum(b.e), bz = parseNum(b.z);
  if (an === undefined || ae === undefined || bn === undefined || be === undefined) return undefined;
  const horizontal = Math.hypot(bn - an, be - ae);
  const dz = az !== undefined && bz !== undefined ? bz - az : undefined;
  const spatial = dz !== undefined ? Math.hypot(horizontal, dz) : undefined;
  return { horizontal, dz, spatial };
}

export const fmt = (v: number | undefined, d = 3) => (v === undefined ? '—' : v.toFixed(d));

export function extraZDiff(base: string, other: string): number | undefined {
  const a = parseNum(base);
  const b = parseNum(other);
  return a !== undefined && b !== undefined ? b - a : undefined;
}
