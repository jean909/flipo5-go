import JSZip from 'jszip';

function guessExt(blob: Blob, ref: string): string {
  const t = blob.type || '';
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webm')) return 'webm';
  if (t.includes('video')) return 'mp4';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  const m = ref.match(/\.([a-z0-9]+)(\?|$)/i);
  if (m) return m[1].toLowerCase();
  return 'bin';
}

/** Build a ZIP from named blobs and trigger a browser download. */
export async function zipBlobsAndDownload(entries: { name: string; blob: Blob }[], zipBaseName: string): Promise<void> {
  const zip = new JSZip();
  for (const e of entries) {
    zip.file(e.name, e.blob);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = zipBaseName.endsWith('.zip') ? zipBaseName : `${zipBaseName}.zip`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, 1500);
}

export function zipEntryName(index: number, blob: Blob, ref: string): string {
  return `export-${index + 1}.${guessExt(blob, ref)}`;
}
