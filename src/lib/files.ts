/** Salvează sau partajează un fișier generat local. Pe telefon folosește foaia de partajare (Salvează în Fișiere, WhatsApp etc.). */
export async function saveFile(blob: Blob, filename: string): Promise<'partajat' | 'descarcat'> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (coarse && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'partajat';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'partajat';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'descarcat';
}

export const safeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'proiect';

export function readText(file: File): Promise<string> {
  return file.text();
}
