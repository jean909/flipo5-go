/**
 * Parse job `output` payloads from the API (Replicate, Cloudflare, storage keys).
 * Supports stringified JSON, plain URLs, `{ output, url, urls }`, and arrays of strings or `{ url }`.
 */

export function getOutputUrls(output: unknown): string[] {
  return extractOutputStrings(output, validUrl);
}

/** Same shape as {@link getOutputUrls} but also allows `uploads/...` keys for `/api/media` and ZIP export. */
export function getOutputRefs(output: unknown): string[] {
  return extractOutputStrings(output, validRef);
}

function validUrl(s: string): boolean {
  return s.length > 0 && (s.startsWith('http://') || s.startsWith('https://'));
}

function validRef(s: string): boolean {
  if (!s) return false;
  if (validUrl(s)) return true;
  return s.startsWith('uploads/') && !s.includes('..');
}

function extractOutputStrings(output: unknown, accept: (s: string) => boolean): string[] {
  if (output == null) return [];
  let parsed: unknown = output;
  if (typeof output === 'string') {
    try {
      parsed = JSON.parse(output) as unknown;
    } catch {
      return accept(output) ? [output] : [];
    }
  }
  return collectFromParsed(parsed, accept);
}

function collectFromParsed(parsed: unknown, accept: (s: string) => boolean): string[] {
  if (Array.isArray(parsed)) {
    return collectFromArrayLike(parsed, accept);
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const o = parsed as Record<string, unknown>;
  const val = o.output ?? o.url ?? o.urls;
  if (typeof val === 'string' && accept(val)) return [val];
  if (Array.isArray(val)) return collectFromArrayLike(val, accept);
  return [];
}

function collectFromArrayLike(items: unknown[], accept: (s: string) => boolean): string[] {
  const out: string[] = [];
  for (const u of items) {
    if (typeof u === 'string' && accept(u)) out.push(u);
    else if (u && typeof u === 'object' && typeof (u as { url?: string }).url === 'string' && accept((u as { url: string }).url)) {
      out.push((u as { url: string }).url);
    }
  }
  return out;
}
