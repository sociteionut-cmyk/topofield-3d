import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Project, SurveyPoint } from '../types';
import { CRS_LABEL, TYPE_COLOR, TYPE_LABEL } from '../types';
import { getBlob } from './db';
import { renderAnnotated } from './imaging';
import { STATUS_LABEL } from './project';

async function fetchFont(url: string): Promise<string> {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

const NAVY: [number, number, number] = [11, 42, 91];

export async function buildPdf(project: Project, selectedIds?: Set<string>): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const base = import.meta.env.BASE_URL;
  doc.addFileToVFS('DejaVuSans.ttf', await fetchFont(`${base}fonts/DejaVuSans.ttf`));
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', await fetchFont(`${base}fonts/DejaVuSans-Bold.ttf`));
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  doc.setFont('DejaVu', 'normal');

  const points = project.points.filter((p) => !selectedIds || selectedIds.has(p.id)).sort((a, b) => a.order - b.order);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const m = 14;

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('DejaVu', 'bold');
  doc.setFontSize(18);
  doc.text('TopoField 3D – Raport topografic', m, 13);
  doc.setFont('DejaVu', 'normal');
  doc.setFontSize(10);
  doc.text(project.name, m, 22);
  doc.setTextColor(0, 0, 0);

  const measured = points.filter((p) => p.status === 'masurat').length;
  let y = 40;
  doc.setFontSize(10);
  const info: Array<[string, string]> = [
    ['Proiect', project.name],
    ['Data raportului', new Date().toLocaleDateString('ro-RO')],
    ['Data creării proiectului', new Date(project.createdAt).toLocaleDateString('ro-RO')],
    ['Locație / șantier', project.site || '—'],
    ['Sistem de coordonate', CRS_LABEL[project.crs]],
    ['Puncte măsurate', `${measured} din ${points.length}`],
  ];
  for (const [k, v] of info) {
    doc.setFont('DejaVu', 'bold');
    doc.text(`${k}:`, m, y);
    doc.setFont('DejaVu', 'normal');
    doc.text(doc.splitTextToSize(v, W - m * 2 - 52), m + 52, y);
    y += 6;
  }
  if (project.demo) {
    doc.setTextColor(185, 28, 28);
    doc.setFont('DejaVu', 'bold');
    doc.text('ATENȚIE: proiect demonstrativ – coordonatele sunt fictive.', m, y + 2);
    doc.setTextColor(0, 0, 0);
    y += 8;
  }
  y += 4;

  for (const photo of project.photos) {
    const onPhoto = points.filter((p) => p.photoId === photo.id && p.mark);
    if (!onPhoto.length) continue;
    const blob = await getBlob(photo.id);
    if (!blob) continue;
    const img = await renderAnnotated(
      blob,
      onPhoto.map((p) => ({ ...p.mark!, label: p.code, color: p.status === 'masurat' ? '#16a34a' : '#dc2626' })),
    );
    const iw = W - m * 2;
    const ih = Math.min((iw * img.h) / img.w, H - 60);
    const w = (ih * img.w) / img.h;
    if (y + ih + 14 > H - m) {
      doc.addPage();
      y = m;
    }
    doc.setFont('DejaVu', 'bold');
    doc.setFontSize(11);
    doc.text(`Fotografie: ${photo.name}`, m, y + 4);
    doc.addImage(img.dataUrl, 'JPEG', m, y + 7, w, ih);
    y += ih + 12;
    doc.setFont('DejaVu', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text('Verde = punct măsurat · Roșu = de măsurat', m, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
  }

  doc.addPage();
  doc.setFont('DejaVu', 'bold');
  doc.setFontSize(12);
  doc.text('Tabel puncte', m, 18);
  const row = (p: SurveyPoint) => [
    String(p.order),
    p.gpsNo ?? '',
    p.code,
    TYPE_LABEL[p.type],
    p.n,
    p.e,
    p.z,
    STATUS_LABEL[p.status],
  ];
  autoTable(doc, {
    startY: 22,
    head: [['Nr.', 'GPS', 'Cod topografic', 'Tip', 'Nord X', 'Est Y', 'Cotă Z', 'Stare']],
    body: points.map(row),
    styles: { font: 'DejaVu', fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: NAVY, font: 'DejaVu', fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [243, 246, 251] },
    margin: { left: m, right: m },
    didParseCell: (d) => {
      if (d.section === 'body' && d.column.index === 7) d.cell.styles.textColor = d.cell.raw === STATUS_LABEL.masurat ? [22, 163, 74] : [220, 38, 38];
      if (d.section === 'body' && d.column.index === 3) {
        const p = points[d.row.index];
        if (p) d.cell.styles.textColor = TYPE_COLOR[p.type] as unknown as string;
      }
    },
  });

  const withNotes = points.filter((p) => p.notes.trim());
  const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  if (project.notes.trim() || withNotes.length) {
    autoTable(doc, {
      startY: lastY + 8,
      head: [['Observații', '']],
      body: [
        ...(project.notes.trim() ? [['Proiect', project.notes]] : []),
        ...withNotes.map((p) => [p.code, p.notes]),
      ],
      styles: { font: 'DejaVu', fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: NAVY, font: 'DejaVu', fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 35, fontStyle: 'bold' } },
      margin: { left: m, right: m },
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('DejaVu', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`TopoField 3D · ${project.name} · pagina ${i}/${pages}`, m, H - 6);
  }
  return doc.output('blob');
}
