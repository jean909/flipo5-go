import { jsPDF } from 'jspdf';
import type { BrandingDNA } from '@/lib/api';

export interface BrandBookAsset {
  label: string;
  caption?: string;
  hashtags?: string;
  blob?: Blob;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
  if (!m) return [26, 26, 26];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function isLight(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

async function blobToJpegDataUrl(blob: Blob, maxDim = 1200): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.88), w, h };
  } catch {
    return null;
  }
}

/** Build a polished multi-page Brand Book PDF and trigger download. */
export async function exportBrandBookPdf(dna: BrandingDNA, assets: BrandBookAsset[], fileBase: string): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const primary = dna.colors?.primary || '#1a1a1a';
  const accent = dna.colors?.accent || '#c45c26';
  const [pr, pg, pb] = hexToRgb(primary);
  const headerText: [number, number, number] = isLight(primary) ? [20, 20, 20] : [255, 255, 255];

  let y = 0;

  // --- Cover header band ---
  doc.setFillColor(pr, pg, pb);
  doc.rect(0, 0, PAGE_W, 70, 'F');
  doc.setTextColor(...headerText);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  const nameLines = doc.splitTextToSize(dna.brand_name || 'Brand Book', CONTENT_W);
  doc.text(nameLines, MARGIN, 32);
  if (dna.tagline) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.text(doc.splitTextToSize(dna.tagline, CONTENT_W), MARGIN, 32 + nameLines.length * 11 + 4);
  }
  doc.setFontSize(9);
  doc.text('BRAND BOOK', PAGE_W - MARGIN, 14, { align: 'right' });
  y = 82;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(16);
    doc.setTextColor(...hexToRgb(accent));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title.toUpperCase(), MARGIN, y);
    y += 6;
    doc.setDrawColor(...hexToRgb(accent));
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y - 4.2, MARGIN + 24, y - 4.2);
  };

  const bodyText = (text: string, opts?: { bold?: boolean; size?: number; color?: [number, number, number] }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(opts?.size ?? 10);
    const c = opts?.color ?? [40, 40, 40];
    doc.setTextColor(c[0], c[1], c[2]);
    const lines = doc.splitTextToSize(text, CONTENT_W);
    for (const line of lines) {
      ensureSpace(6);
      doc.text(line, MARGIN, y);
      y += 5.2;
    }
  };

  const labeled = (label: string, value?: string) => {
    if (!value) return;
    ensureSpace(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 4.6;
    bodyText(value);
    y += 2.5;
  };

  // --- Identity ---
  sectionTitle('Identity');
  y += 2;
  labeled('Tone', dna.tone);
  labeled('Voice', dna.voice);
  labeled('Audience', dna.audience);
  labeled('Typography', dna.fonts);

  if (dna.tagline_variants?.length) {
    labeled('Tagline alternatives', dna.tagline_variants.filter(Boolean).map((v) => `•  ${v}`).join('\n'));
  }

  // --- Colors ---
  const colorEntries = ([
    ['Primary', dna.colors?.primary],
    ['Secondary', dna.colors?.secondary],
    ['Accent', dna.colors?.accent],
  ] as const).filter(([, hex]) => !!hex);
  if (colorEntries.length > 0) {
    y += 3;
    sectionTitle('Color palette');
    y += 3;
    ensureSpace(30);
    let x = MARGIN;
    for (const [label, hex] of colorEntries) {
      const [r, g, b] = hexToRgb(hex!);
      doc.setFillColor(r, g, b);
      doc.setDrawColor(210, 210, 210);
      doc.roundedRect(x, y, 34, 18, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(90, 90, 90);
      doc.text(label, x, y + 23);
      doc.setFont('helvetica', 'normal');
      doc.text(hex!.toUpperCase(), x, y + 27.5);
      x += 44;
    }
    y += 34;
  }

  // --- Campaigns ---
  const campaigns = (dna.campaigns ?? []).filter((c) => c.title);
  if (campaigns.length > 0) {
    sectionTitle('Campaign ideas');
    y += 3;
    campaigns.forEach((c, i) => {
      ensureSpace(18);
      bodyText(`${i + 1}. ${c.title}`, { bold: true, size: 10.5 });
      bodyText(c.concept);
      if (c.cta) bodyText(`CTA: ${c.cta}`, { color: hexToRgb(accent) });
      y += 2.5;
    });
  }

  // --- Captions ---
  const withCaptions = assets.filter((a) => a.caption);
  if (withCaptions.length > 0) {
    y += 2;
    sectionTitle('Ready-to-post captions');
    y += 3;
    for (const a of withCaptions) {
      ensureSpace(20);
      bodyText(a.label, { bold: true, size: 10.5 });
      bodyText(a.caption!);
      if (a.hashtags) bodyText(a.hashtags, { color: hexToRgb(accent), size: 9 });
      y += 3;
    }
  }

  // --- Asset gallery ---
  const withImages = assets.filter((a) => a.blob);
  if (withImages.length > 0) {
    doc.addPage();
    y = MARGIN;
    sectionTitle('Brand assets');
    y += 4;
    const cellW = (CONTENT_W - 8) / 2;
    let col = 0;
    let rowH = 0;
    for (const a of withImages) {
      const img = await blobToJpegDataUrl(a.blob!);
      if (!img) continue;
      const drawH = Math.min(cellW * (img.h / img.w), 110);
      const drawW = drawH * (img.w / img.h);
      if (col === 0) ensureSpace(drawH + 14);
      const x = MARGIN + col * (cellW + 8) + (cellW - drawW) / 2;
      doc.addImage(img.dataUrl, 'JPEG', x, y, drawW, drawH);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(110, 110, 110);
      doc.text(a.label, MARGIN + col * (cellW + 8), y + drawH + 5);
      rowH = Math.max(rowH, drawH + 12);
      col += 1;
      if (col === 2) {
        col = 0;
        y += rowH;
        rowH = 0;
      }
    }
    if (col > 0) y += rowH;
  }

  // --- Footer on every page ---
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    doc.text(`${dna.brand_name || 'Brand'} — generated with Flipo5 1 Click Branding`, MARGIN, PAGE_H - 8);
    doc.text(`${i} / ${pages}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
  }

  doc.save(`${fileBase}.pdf`);
}
