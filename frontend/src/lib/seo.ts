/**
 * Central SEO config. Set NEXT_PUBLIC_SITE_URL in production (e.g. https://flipo5.com).
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://flipo5.com';
export const SITE_NAME = 'Flipo5';

export const DEFAULT_DESCRIPTION =
  'AI-powered chat, image and video creation. European AI—privacy first, fast, creative.';

export const DEFAULT_OG_IMAGE = '/home/og.jpg';

export function absoluteUrl(path: string): string {
  const base = SITE_URL.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
