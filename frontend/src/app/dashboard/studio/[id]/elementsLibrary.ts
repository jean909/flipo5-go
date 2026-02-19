/** Built-in elements (icons) for Add Elements. SVG as data URL so they work in canvas composite. */
function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const white = '#ffffff';
const stroke = '#333';

const icons: Record<string, string> = {
  heart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${white}" stroke="${stroke}" stroke-width="0.5"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
  star: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${white}" stroke="${stroke}" stroke-width="0.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  smiley: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${white}" stroke="${stroke}" stroke-width="0.6" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  thumbsUp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${white}" stroke="${stroke}" stroke-width="0.6"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 11H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${white}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  fire: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${white}" stroke="${stroke}" stroke-width="0.5"><path d="M12 23c3.97 0 7.5-2.5 9.5-6.5 1.5-2.5 1.5-5.5 0-8-1.5-2-4-3.5-6-4-1-.5-2-1.5-2-2.5 0-1 1-2 2-2 .5 0 1 0 0-1c-2 0-4 1.5-5 3.5-1 2-1.5 4-1.5 6 0 1 .5 2 1 3 .5-1 1-2 1-3 0-2-1-4-2.5-5.5C7 6 5 5 3 5c0 1.5.5 3 1.5 4C3 11 2 13 2 15c0 4 3 7 7 8z"/></svg>`,
  sparkle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${white}" stroke="${stroke}" stroke-width="0.5"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M5 21l1.5-4.5L11 15l-4.5-1.5L5 9l1.5 4.5L11 15 6.5 16.5 5 21z"/><path d="M19 21l-1.5-4.5L13 15l4.5-1.5L19 9l-1.5 4.5L13 15l4.5 1.5L19 21z"/></svg>`,
  circle: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${white}" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`,
  bookmark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${white}" stroke="${stroke}" stroke-width="0.6"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
  flag: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${white}" stroke="${stroke}" stroke-width="0.6"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
  sun: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${white}" stroke="${stroke}" stroke-width="0.6"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  zap: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${white}" stroke="${stroke}" stroke-width="0.6"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
};

export interface LibraryElement {
  id: string;
  name: string;
  url: string;
}

export const ELEMENTS_LIBRARY: LibraryElement[] = [
  { id: 'heart', name: 'Heart', url: svgDataUrl(icons.heart) },
  { id: 'star', name: 'Star', url: svgDataUrl(icons.star) },
  { id: 'smiley', name: 'Smiley', url: svgDataUrl(icons.smiley) },
  { id: 'thumbsUp', name: 'Thumbs up', url: svgDataUrl(icons.thumbsUp) },
  { id: 'check', name: 'Check', url: svgDataUrl(icons.check) },
  { id: 'fire', name: 'Fire', url: svgDataUrl(icons.fire) },
  { id: 'sparkle', name: 'Sparkle', url: svgDataUrl(icons.sparkle) },
  { id: 'circle', name: 'Circle', url: svgDataUrl(icons.circle) },
  { id: 'bookmark', name: 'Bookmark', url: svgDataUrl(icons.bookmark) },
  { id: 'flag', name: 'Flag', url: svgDataUrl(icons.flag) },
  { id: 'sun', name: 'Sun', url: svgDataUrl(icons.sun) },
  { id: 'zap', name: 'Zap', url: svgDataUrl(icons.zap) },
];
