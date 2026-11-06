export function download(filename: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { datasetToCsv } from '../lib/exportCsv';

export function exportCsv(filename: string, csv: string) {
  download(filename, new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
}

/** Rasterise the first chart SVG inside `root` to a 2× PNG with the page background. */
export async function exportChartPng(root: Element | null, filename: string): Promise<boolean> {
  const svg = root?.querySelector('svg.recharts-surface') as SVGSVGElement | null;
  if (!svg) return false;
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const cs = getComputedStyle(document.body);
  clone.setAttribute('style', `font-family:${cs.fontFamily};font-size:12px`);
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const scale = 2;
  const pad = 16;
  const canvas = document.createElement('canvas');
  canvas.width = (width + pad * 2) * scale;
  canvas.height = (height + pad * 2) * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.scale(scale, scale);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#131821';
  ctx.fillRect(0, 0, width + pad * 2, height + pad * 2);
  ctx.drawImage(img, pad, pad, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return false;
  download(filename, blob);
  return true;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
