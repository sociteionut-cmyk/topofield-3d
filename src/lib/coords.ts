import proj4 from 'proj4';

/** Definiția EPSG:3844 (Pulkovo 1942(58) / Stereo 70), conform epsg.io, cu parametri Helmert pentru România. */
export const STEREO70_DEF =
  '+proj=sterea +lat_0=46 +lon_0=25 +k=0.99975 +x_0=500000 +y_0=500000 +ellps=krass ' +
  '+towgs84=2.329,-147.042,-92.08,0.309,-0.325,-0.497,5.69 +units=m +no_defs';

export const STEREO70_ACCURACY_TEXT =
  'Transformare Helmert cu 7 parametri (EPSG:3844 → WGS84). Precizie orientativă: 1–3 m. ' +
  'Pentru lucrări de cadastru folosiți transformarea oficială TransDatRO.';

const conv = proj4(STEREO70_DEF, 'WGS84');

export interface LatLon {
  lat: number;
  lon: number;
}

/** Convenția topografică: Nord = X, Est = Y. proj4 primește (Est, Nord). */
export function stereo70ToWgs84(north: number, east: number): LatLon {
  const [lon, lat] = conv.forward([east, north]);
  return { lat, lon };
}

export function wgs84ToStereo70(lat: number, lon: number): { north: number; east: number } {
  const [east, north] = conv.inverse([lon, lat]);
  return { north, east };
}

/** Stereo 70 acoperă România; valori în afara acestui interval indică, cel mai probabil, axe inversate sau alt sistem. */
export function plausibleStereo70(north: number, east: number): boolean {
  return north > 200000 && north < 800000 && east > 80000 && east < 900000;
}

export function parseNum(s: string | undefined | null): number | undefined {
  if (s == null) return undefined;
  const t = String(s).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '' || !/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : undefined;
}
