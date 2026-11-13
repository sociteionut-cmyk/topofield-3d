import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createWorker } from 'tesseract.js';
import { parseControllerText } from '../src/lib/ocrParse';

describe('OCR real (Node, offline traineddata)', () => {
  it('reads the controller sample image', async () => {
    const worker = await createWorker('eng', 1, { langPath: 'public/tesseract', gzip: true, cachePath: 'node_modules/.cache-tess' });
    await worker.setParameters({ tessedit_pageseg_mode: '6' as never });
    const { data } = await worker.recognize(readFileSync('tests/controller-sample.png'));
    await worker.terminate();
    const rows = parseControllerText(data.text, 'complet');
    const nos = rows.map((r) => r.gpsNo);
    expect(nos.length).toBeGreaterThanOrEqual(3);
    expect(nos).toContain('8');
  }, 120000);
});
