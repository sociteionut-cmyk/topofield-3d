import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { parseString as parse } from 'dxf';
import { plausibleStereo70, stereo70ToWgs84, wgs84ToStereo70 } from '../src/lib/coords';
import { formatCode, nextCode, renumber, findDuplicates, weldCodeForValve } from '../src/lib/numbering';
import { detectSeparator, parseCsv, pointsToCsv, rowsToPoints, guessColumns, hasHeader, normalizeDecimal } from '../src/lib/csv';
import { mergeByGpsNo, parseControllerText } from '../src/lib/ocrParse';
import { buildDxf } from '../src/lib/dxf';
import { buildBackup, clearAll, getProject, restoreBackup, saveProject, putBlob, getBlob } from '../src/lib/db';
import { applyAssignment, autoAssignByCode, newPoint, newProject, validateAssignment } from '../src/lib/project';
import type { GpsPoint } from '../src/types';

describe('coords', () => {
  it('false origin of Stereo70 is ~46N 25E', () => {
    const r = stereo70ToWgs84(500000, 500000);
    expect(r.lat).toBeCloseTo(46, 1);
    expect(r.lon).toBeCloseTo(25, 1);
  });
  it('round-trips', () => {
    const w = stereo70ToWgs84(330000, 590000);
    const s = wgs84ToStereo70(w.lat, w.lon);
    expect(s.north).toBeCloseTo(330000, 2);
    expect(s.east).toBeCloseTo(590000, 2);
  });
  it('plausibility', () => {
    expect(plausibleStereo70(330000, 590000)).toBe(true);
    expect(plausibleStereo70(10250, 20480)).toBe(false);
  });
});

describe('numbering', () => {
  it('generates codes and detects duplicates', () => {
    const a = newPoint({ code: 'S01', type: 'sudura', order: 0 });
    expect(nextCode([a], 'sudura')).toBe('S2');
    expect(formatCode('robinet', 3)).toBe('R3');
    const r1 = newPoint({ code: 'R1', type: 'robinet', order: 2 });
    expect(nextCode([a, r1], 'robinet')).toBe('R2');
    expect(nextCode([a, r1], 'cot')).toBe('C1');
    expect(weldCodeForValve('R01', 1)).toBe('R01-S01');
    const b = newPoint({ code: 'S01', type: 'sudura', order: 1 });
    expect(findDuplicates([a, b]).size).toBeGreaterThan(0);
  });
  it('renumber keeps unique codes', () => {
    const pts = [newPoint({ code: 'S05', type: 'sudura', order: 0 }), newPoint({ code: 'S02', type: 'sudura', order: 1 })];
    const r = renumber(pts);
    expect(new Set(r.map((p) => p.code)).size).toBe(2);
  });
});

describe('csv', () => {
  it('detects separators and decimal commas', () => {
    expect(detectSeparator('a;b;c\n1;2;3')).toBe(';');
    expect(detectSeparator('a,b,c\n1,2,3')).toBe(',');
    expect(normalizeDecimal('412987,123')).toBe('412987.123');
  });
  it('imports with header and decimal comma without rounding', () => {
    const txt = 'Nr;N;E;Z;Cod\n7;412987,1234;598765,4321;101,5;R01\n8;412988,000;598766,000;101,6;S01';
    const rows = parseCsv(txt, detectSeparator(txt));
    const h = hasHeader(rows);
    expect(h).toBe(true);
    const pts = rowsToPoints(rows, guessColumns(rows, h), h);
    expect(pts).toHaveLength(2);
    expect(pts[0].n).toBe('412987.1234');
    expect(pts[0].e).toBe('598765.4321');
    expect(pts[0].code).toBe('R01');
  });
  it('exports csv with BOM and requested decimal', () => {
    const p = newPoint({ code: 'R01', type: 'robinet', order: 0, n: '412987.1234', e: '598765.4321', z: '101.5' });
    const out = pointsToCsv([p], { sep: ';', decimal: ',' });
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out).toContain('412987,1234;598765,4321;101,5');
    expect(out).toContain('Cotă Z');
  });
});

describe('ocrParse', () => {
  it('parses tabular rows and joins split decimals', () => {
    const r = parseControllerText('7 412987 .123 598765.432 101.500\n8 412988.000 598766.000 101.600', 'complet');
    expect(r.length).toBe(2);
    expect(r[0].gpsNo).toBe('7');
    expect(r[0].n).toBe('412987.123');
  });
  it('merges batches by gps number', () => {
    const a = parseControllerText('7 412987.123 598765.432', 'ne');
    const b = parseControllerText('7 101.500', 'z');
    const m = mergeByGpsNo([a, b]);
    expect(m.filter((x) => x.gpsNo === '7')).toHaveLength(1);
  });
});

describe('dxf', () => {
  it('produces parseable DXF with 3D points on layers', () => {
    const pr = newProject('T', 's');
    pr.points = [
      newPoint({ code: 'R01', type: 'robinet', order: 0, n: '100.5', e: '200.25', z: '10.125', status: 'masurat' }),
      newPoint({ code: 'S01', type: 'sudura', order: 1, n: '101.5', e: '201.25', z: '10.2', status: 'masurat' }),
      newPoint({ code: 'S02', type: 'sudura', order: 2 }),
    ];
    const dxf = buildDxf(pr);
    expect(dxf).toContain('ROBINETI');
    expect(dxf).toContain('SUDURI');
    const parsed = parse(dxf);
    const pts = parsed.entities.filter((e: { type: string }) => e.type === 'POINT') as unknown as Array<{ x: number; y: number; z: number }>;
    expect(pts).toHaveLength(2);
    expect(pts[0].x).toBeCloseTo(200.25);
    expect(pts[0].y).toBeCloseTo(100.5);
    expect(pts[0].z).toBeCloseTo(10.125);
  });
});

describe('db + backup', () => {
  it('saves, backs up, clears and restores incl. blobs', async () => {
    const pr = newProject('Backup', 'x');
    await saveProject(pr);
    await putBlob('b1', new Blob(['hello'], { type: 'text/plain' }));
    pr.photos = [{ id: 'b1', name: 'a', kind: 'Detaliu', addedAt: new Date().toISOString() }];
    await saveProject(pr);
    const bk = JSON.parse(JSON.stringify(await buildBackup()));
    await clearAll();
    expect(await getProject(pr.id)).toBeUndefined();
    expect(await restoreBackup(bk)).toBe(1);
    expect((await getProject(pr.id))?.name).toBe('Backup');
    const b = await getBlob('b1');
    expect(b).toBeDefined();
    expect(b!.size).toBe(5);
  });
  it('rejects invalid backup', async () => {
    await expect(restoreBackup({ foo: 1 })).rejects.toBeTruthy();
  });
});

describe('association', () => {
  it('assigns, validates and applies', () => {
    const pr = newProject('A', 'x');
    pr.points = [
      newPoint({ code: 'R01', type: 'robinet', order: 0 }),
      newPoint({ code: 'S01', type: 'sudura', order: 1 }),
    ];
    const g = (no: string, code: string, z: string): GpsPoint => ({ id: 'g' + no, gpsNo: no, n: '1' + no, e: '2' + no, z, code, rtk: '', uncertain: [], source: 'csv' } as GpsPoint);
    pr.gpsPool = [g('7', 'R01', '5.5'), g('8', 'S01', '5.6'), g('10', '', '5.7')];
    const a = autoAssignByCode(pr, {});
    expect(Object.values(a).sort()).toEqual(['g7', 'g8']);
    expect(validateAssignment(pr, a).errors).toHaveLength(0);
    const dup = { ...a, [pr.points[1].id]: 'g7' };
    expect(validateAssignment(pr, dup).errors.length).toBeGreaterThan(0);
    const done = applyAssignment(pr, a);
    expect(done.points[0].status).toBe('masurat');
    expect(done.points[0].n).toBe('17');
    const cleared = applyAssignment(done, { ...a, [pr.points[0].id]: '' });
    expect(cleared.points[0].status).toBe('de_masurat');
    expect(cleared.points[0].n).toBe('');
  });
});
