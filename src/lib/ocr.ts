import { createWorker, type Worker } from 'tesseract.js';
import { loadBitmap, preprocess, type PreOptions } from './imaging';
import { parseControllerText, type ExtractMode, type Extracted, type OcrLine } from './ocrParse';

let workerPromise: Promise<Worker> | null = null;
let progressCb: ((status: string, p: number) => void) | null = null;

const base = () => new URL(`${import.meta.env.BASE_URL}tesseract`, window.location.href).href;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await createWorker('eng', 1, {
        workerPath: `${base()}/worker.min.js`,
        corePath: base(),
        langPath: base(),
        gzip: true,
        logger: (m: { status: string; progress: number }) => progressCb?.(m.status, m.progress),
      });
      await w.setParameters({ tessedit_pageseg_mode: '6' as never, preserve_interword_spaces: '1' });
      return w;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

/** Încarcă motorul OCR (și îl salvează în cache pentru funcționare offline). */
export async function warmUpOcr(onProgress?: (status: string, p: number) => void): Promise<void> {
  progressCb = onProgress ?? null;
  await getWorker();
}

export interface OcrResult {
  rows: Extracted[];
  text: string;
  rotation: number;
}

async function recognize(canvas: HTMLCanvasElement): Promise<OcrLine[]> {
  const w = await getWorker();
  const { data } = await w.recognize(canvas, {}, { text: true, blocks: true });
  const lines: OcrLine[] = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text, confidence: l.confidence }))));
  if (!lines.length && data.text) return data.text.split(/\r?\n/).map((text) => ({ text }));
  return lines;
}

/**
 * Rulează OCR pe fotografia controllerului. Dacă nu găsește niciun punct, încearcă automat
 * celelalte orientări (90°, 270°, 180°) pentru a corecta fotografiile făcute pe lateral.
 */
export async function ocrPhoto(
  blob: Blob,
  opts: PreOptions,
  mode: ExtractMode,
  onProgress?: (status: string, p: number) => void,
): Promise<OcrResult> {
  progressCb = onProgress ?? null;
  const bmp = await loadBitmap(blob);
  try {
    const tries = [opts.rotate, ...([0, 90, 270, 180] as const).filter((r) => r !== opts.rotate)];
    let last: OcrResult = { rows: [], text: '', rotation: opts.rotate };
    for (let i = 0; i < tries.length; i++) {
      const canvas = preprocess(bmp, { ...opts, rotate: tries[i] as PreOptions['rotate'] });
      const lines = await recognize(canvas);
      const rows = parseControllerText(lines, mode);
      last = { rows, text: lines.map((l) => l.text).join('\n'), rotation: tries[i] };
      if (rows.length) return last;
      if (i === 0) progressCb?.('orientare automată', 0);
    }
    return { ...last, rotation: opts.rotate };
  } finally {
    bmp.close();
  }
}
