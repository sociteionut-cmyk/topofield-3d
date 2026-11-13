export type PointType = 'robinet' | 'sudura' | 'cot' | 'flansa' | 'conducta' | 'alt';
export type PointStatus = 'de_masurat' | 'masurat';
export type CrsId = 'stereo70' | 'altul';
export type PointRole = 'stanga' | 'centru' | 'dreapta';

export const TYPE_LABEL: Record<PointType, string> = {
  robinet: 'Robinet',
  sudura: 'Sudură',
  cot: 'Cot',
  flansa: 'Flanșă',
  conducta: 'Conductă',
  alt: 'Alt element',
};

export const TYPE_LAYER: Record<PointType, string> = {
  robinet: 'ROBINETI',
  sudura: 'SUDURI',
  cot: 'COTURI',
  flansa: 'FLANSE',
  conducta: 'CONDUCTE',
  alt: 'ALTE_PUNCTE',
};

export const TYPE_COLOR: Record<PointType, string> = {
  robinet: '#1d4ed8',
  sudura: '#ea580c',
  cot: '#9333ea',
  flansa: '#0d9488',
  conducta: '#ca8a04',
  alt: '#64748b',
};

export const CRS_LABEL: Record<CrsId, string> = {
  stereo70: 'Stereografic 1970 (EPSG:3844)',
  altul: 'Alt sistem / local (necunoscut)',
};

/** Poziții normalizate (0..1) față de dimensiunile fotografiei. */
export interface Mark {
  x: number;
  y: number;
  lx: number;
  ly: number;
}

export interface ExtraZ {
  id: string;
  label: string;
  z: string;
}

export interface GpsSnapshot {
  n: string;
  e: string;
  z: string;
}

export interface SurveyPoint {
  id: string;
  order: number;
  code: string;
  customCode?: boolean;
  type: PointType;
  valveId?: string;
  role?: PointRole;
  photoId?: string;
  mark?: Mark;
  gpsNo?: string;
  poolId?: string;
  gpsCode?: string;
  rtk?: string;
  /** Coordonate păstrate ca text, exact cum au fost citite/importate (fără rotunjiri). */
  n: string;
  e: string;
  z: string;
  orig?: GpsSnapshot;
  controllerPhotoId?: string;
  measuredAt?: string;
  notes: string;
  status: PointStatus;
  extraZ: ExtraZ[];
}

export interface PhotoMeta {
  id: string;
  name: string;
  kind: string;
  addedAt: string;
  role?: 'ne' | 'z' | 'complet';
}

export interface GpsPoint {
  id: string;
  gpsNo: string;
  n: string;
  e: string;
  z: string;
  code: string;
  rtk: string;
  uncertain: Array<'gpsNo' | 'n' | 'e' | 'z'>;
  controllerPhotoId?: string;
  measuredAt?: string;
  source: 'ocr' | 'csv' | 'manual' | 'demo';
}

export interface Link {
  id: string;
  a: string;
  b: string;
}

export interface ImportRecord {
  id: string;
  name: string;
  date: string;
  rows: number;
}

export interface Project {
  id: string;
  name: string;
  site: string;
  createdAt: string;
  updatedAt: string;
  crs: CrsId;
  notes: string;
  demo?: boolean;
  photos: PhotoMeta[];
  controllerPhotos: PhotoMeta[];
  points: SurveyPoint[];
  gpsPool: GpsPoint[];
  links: Link[];
  imports: ImportRecord[];
}

export interface Settings {
  csvSeparator: ';' | ',' | '\t';
  csvDecimal: '.' | ',';
  ocrLang: 'eng';
}

export const DEFAULT_SETTINGS: Settings = {
  csvSeparator: ';',
  csvDecimal: '.',
  ocrLang: 'eng',
};
