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
  // Media is already compressed; DEFLATE would block the main thread for a long time on many files.
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
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

export function zipEntryName(index: number, blob: Blob, ref: string, base = 'export'): string {
  const safe = (base || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'export';
  return `${safe}-${index + 1}.${guessExt(blob, ref)}`;
}

/** Fetch many refs with limited concurrency; skips failures. */
export async function fetchBlobsConcurrent(
  refs: string[],
  fetchOne: (ref: string) => Promise<Blob>,
  concurrency = 4,
): Promise<{ entries: { name: string; blob: Blob; ref: string }[]; failed: number }> {
  const entries: { name: string; blob: Blob; ref: string }[] = [];
  let failed = 0;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, refs.length) }, async () => {
    while (cursor < refs.length) {
      const i = cursor++;
      const ref = refs[i];
      try {
        const blob = await fetchOne(ref);
        entries.push({ name: '', blob, ref });
      } catch {
        failed += 1;
      }
    }
  });
  await Promise.all(workers);
  return { entries, failed };
}
