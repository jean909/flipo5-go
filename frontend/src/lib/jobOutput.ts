/**
 * Extracts image/video URLs from job output (Replicate or Cloudflare).
 * Handles: { output: "url" }, { output: ["url1", "url2"] }, direct array, etc.
 */
export function getOutputUrls(output: unknown): string[] {
  if (output == null) return [];
  let parsed: unknown = output;
  if (typeof output === 'string') {
    try {
      parsed = JSON.parse(output) as unknown;
    } catch {
      return validUrl(output) ? [output] : [];
    }
  }
  if (Array.isArray(parsed)) {
    const out: string[] = [];
    for (const u of parsed) {
      if (typeof u === 'string' && validUrl(u)) out.push(u);
      else if (u && typeof u === 'object' && typeof (u as { url?: string }).url === 'string' && validUrl((u as { url: string }).url))
        out.push((u as { url: string }).url);
    }
    return out;
  }
  if (typeof parsed !== 'object') return [];
  const o = parsed as Record<string, unknown>;
  const val = o.output ?? o.url ?? o.urls;
  if (typeof val === 'string' && validUrl(val)) return [val];
  if (Array.isArray(val)) {
    const out: string[] = [];
    for (const u of val) {
      if (typeof u === 'string' && validUrl(u)) out.push(u);
      else if (u && typeof u === 'object' && typeof (u as { url?: string }).url === 'string' && validUrl((u as { url: string }).url))
        out.push((u as { url: string }).url);
    }
    return out;
  }
  return [];
}

function validUrl(s: string): boolean {
  return s.length > 0 && (s.startsWith('http://') || s.startsWith('https://'));
}
