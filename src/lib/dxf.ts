import type { Project, SurveyPoint } from '../types';
import { TYPE_LAYER } from '../types';
import { parseNum } from './coords';

const LAYER_COLORS: Record<string, number> = {
  ROBINETI: 5,
  SUDURI: 30,
  COTURI: 6,
  FLANSE: 4,
  CONDUCTE: 2,
  ALTE_PUNCTE: 8,
  ETICHETE: 7,
};

const ascii = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't')
    .replace(/[^\x20-\x7e]/g, '?');

export function hasCoords(p: SurveyPoint): boolean {
  return parseNum(p.n) !== undefined && parseNum(p.e) !== undefined && parseNum(p.z) !== undefined;
}

/**
 * DXF ASCII (AutoCAD R12 / AC1009), unități metri.
 * Convenție AutoCAD: X = Est, Y = Nord, Z = cotă. Coordonatele sunt scrise exact ca text, fără rotunjire.
 */
export function buildDxf(project: Project, selectedIds?: Set<string>): string {
  const pts = project.points.filter((p) => hasCoords(p) && (!selectedIds || selectedIds.has(p.id)));
  const out: string[] = [];
  const g = (code: number, value: string | number) => {
    out.push(String(code), String(value));
  };
  g(0, 'SECTION');
  g(2, 'HEADER');
  g(9, '$ACADVER');
  g(1, 'AC1009');
  g(9, '$INSUNITS');
  g(70, 6);
  g(9, '$MEASUREMENT');
  g(70, 1);
  g(0, 'ENDSEC');

  g(0, 'SECTION');
  g(2, 'TABLES');
  g(0, 'TABLE');
  g(2, 'LTYPE');
  g(70, 1);
  g(0, 'LTYPE');
  g(2, 'CONTINUOUS');
  g(70, 0);
  g(3, 'Solid line');
  g(72, 65);
  g(73, 0);
  g(40, '0.0');
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'LAYER');
  g(70, Object.keys(LAYER_COLORS).length);
  for (const [name, color] of Object.entries(LAYER_COLORS)) {
    g(0, 'LAYER');
    g(2, name);
    g(70, 0);
    g(62, color);
    g(6, 'CONTINUOUS');
  }
  g(0, 'ENDTAB');
  g(0, 'TABLE');
  g(2, 'STYLE');
  g(70, 1);
  g(0, 'STYLE');
  g(2, 'STANDARD');
  g(70, 0);
  g(40, '0.0');
  g(41, '1.0');
  g(50, '0.0');
  g(71, 0);
  g(42, '0.2');
  g(3, 'txt');
  g(4, '');
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  g(0, 'SECTION');
  g(2, 'ENTITIES');
  const xyz = (p: SurveyPoint, off = 0) => {
    g(10, p.e);
    g(20, p.n);
    g(30, off ? String((parseNum(p.z) ?? 0) + off) : p.z);
  };
  for (const p of pts) {
    g(0, 'POINT');
    g(8, TYPE_LAYER[p.type]);
    xyz(p);
  }
  const byId = new Map(pts.map((p) => [p.id, p]));
  for (const l of project.links) {
    const a = byId.get(l.a);
    const b = byId.get(l.b);
    if (!a || !b) continue;
    g(0, 'LINE');
    g(8, 'CONDUCTE');
    g(10, a.e);
    g(20, a.n);
    g(30, a.z);
    g(11, b.e);
    g(21, b.n);
    g(31, b.z);
  }
  for (const p of pts) {
    g(0, 'TEXT');
    g(8, 'ETICHETE');
    g(10, String((parseNum(p.e) ?? 0) + 0.1));
    g(20, String((parseNum(p.n) ?? 0) + 0.1));
    g(30, p.z);
    g(40, '0.25');
    g(1, ascii(p.gpsNo ? `${p.code} [GPS ${p.gpsNo}]` : p.code));
  }
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}
