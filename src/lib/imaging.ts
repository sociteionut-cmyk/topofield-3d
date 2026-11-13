export interface PreOptions {
  rotate: 0 | 90 | 180 | 270;
  crop: { l: number; t: number; r: number; b: number }; // procente 0..45
  contrast: number; // 0.5 .. 2.5
  sharpen: boolean;
  auto: boolean;
}

export const DEFAULT_PRE: PreOptions = {
  rotate: 0,
  crop: { l: 0, t: 0, r: 0, b: 0 },
  contrast: 1.2,
  sharpen: true,
  auto: true,
};

export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(blob);
  }
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Decupare, rotire (corectarea orientării), scalare, nuanțe de gri, contrast automat și claritate. */
export function preprocess(src: CanvasImageSource & { width: number; height: number }, o: PreOptions, maxSide = 2400): HTMLCanvasElement {
  const sw = src.width;
  const sh = src.height;
  const cx = Math.round((sw * o.crop.l) / 100);
  const cy = Math.round((sh * o.crop.t) / 100);
  const cw = Math.max(8, sw - cx - Math.round((sw * o.crop.r) / 100));
  const ch = Math.max(8, sh - cy - Math.round((sh * o.crop.b) / 100));
  const long = Math.max(cw, ch);
  const scale = long < 1600 ? 1600 / long : long > maxSide ? maxSide / long : 1;
  const tw = cw * scale;
  const th = ch * scale;
  const swap = o.rotate === 90 || o.rotate === 270;
  const out = newCanvas(swap ? th : tw, swap ? tw : th);
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((o.rotate * Math.PI) / 180);
  ctx.drawImage(src, cx, cy, cw, ch, -tw / 2, -th / 2, tw, th);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const n = out.width * out.height;
  const gray = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const v = Math.round(0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]);
    gray[i] = v;
    hist[v]++;
    sum += v;
  }
  let lo = 0;
  let hi = 255;
  if (o.auto) {
    let acc = 0;
    while (lo < 255 && acc + hist[lo] < n * 0.02) acc += hist[lo++];
    acc = 0;
    while (hi > 0 && acc + hist[hi] < n * 0.02) acc += hist[hi--];
    if (hi - lo < 30) {
      lo = 0;
      hi = 255;
    }
  }
  const invert = sum / n < 110; // ecran închis cu text deschis → text negru pe alb
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    let x = (v - lo) / (hi - lo || 1);
    x = (x - 0.5) * o.contrast + 0.5;
    x = Math.min(1, Math.max(0, x));
    lut[v] = Math.round((invert ? 1 - x : x) * 255);
  }
  for (let i = 0; i < n; i++) gray[i] = lut[gray[i]];

  let res = gray;
  if (o.sharpen) {
    const w = out.width;
    const h = out.height;
    res = new Uint8ClampedArray(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
          res[i] = gray[i];
          continue;
        }
        const v = 5 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
        res[i] = v;
      }
    }
  }
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    d[j] = d[j + 1] = d[j + 2] = res[i];
    d[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/jpeg', q = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Nu s-a putut genera imaginea'))), type, q));
}

/** Reduce o fotografie mare pentru stocare/afișare, păstrând orientarea corectă. */
export async function downscaleImage(blob: Blob, maxSide = 3000): Promise<Blob> {
  const bmp = await loadBitmap(blob);
  const long = Math.max(bmp.width, bmp.height);
  if (long <= maxSide && blob.type === 'image/jpeg') {
    bmp.close();
    return blob;
  }
  const s = Math.min(1, maxSide / long);
  const c = newCanvas(bmp.width * s, bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return canvasToBlob(c, 'image/jpeg', 0.9);
}

export interface MarkDraw {
  x: number;
  y: number;
  lx: number;
  ly: number;
  label: string;
  color: string;
}

/** Desenează fotografia cu punctele și etichetele în pozițiile alese de utilizator (pentru PDF). */
export async function renderAnnotated(blob: Blob, marks: MarkDraw[], maxSide = 1600): Promise<{ dataUrl: string; w: number; h: number }> {
  const bmp = await loadBitmap(blob);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = newCanvas(bmp.width * s, bmp.height * s);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const u = Math.max(c.width, c.height) / 1000;
  ctx.font = `bold ${Math.round(13 * u + 4)}px sans-serif`;
  ctx.textBaseline = 'middle';
  for (const m of marks) {
    const px = m.x * c.width;
    const py = m.y * c.height;
    const lx = m.lx * c.width;
    const ly = m.ly * c.height;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 * u + 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 1.2 * u + 0.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 6 * u + 2, 0, Math.PI * 2);
    ctx.fillStyle = m.color;
    ctx.fill();
    ctx.lineWidth = 2 * u + 1;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    const tw = ctx.measureText(m.label).width + 10 * u;
    const th = 20 * u + 6;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(lx - tw / 2, ly - th / 2, tw, th);
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 1.5 * u + 0.5;
    ctx.strokeRect(lx - tw / 2, ly - th / 2, tw, th);
    ctx.fillStyle = '#0b2a5b';
    ctx.textAlign = 'center';
    ctx.fillText(m.label, lx, ly + 1);
  }
  return { dataUrl: c.toDataURL('image/jpeg', 0.88), w: c.width, h: c.height };
}
