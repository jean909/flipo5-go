export type PromptIntent = 'image' | 'video';

const VIDEO_PREFIXES = [
  'create a video', 'generate a video', 'create video', 'generate video', 'make a video', 'make video',
  'creat a video', 'generat a video', 'creat video', 'generat video', 'create a vid', 'generate a vid',
  'erstelle ein video', 'generiere ein video', 'erstelle video', 'generiere video', 'video erstellen', 'video generieren',
  'erstel ein video', 'generier ein video', 'erstelle ein vid', 'mach ein video', 'mach video',
  'create video of', 'generate video of', 'make video of',
] as const;

const IMAGE_PREFIXES = [
  'create a photo', 'generate a photo', 'create a picture', 'generate a picture', 'create an image', 'generate an image',
  'create photo', 'generate photo', 'create picture', 'generate picture', 'create image', 'generate image',
  'creat a photo', 'generat a photo', 'creat a picture', 'creat photo', 'generat photo', 'creat image', 'generat image',
  'create a foto', 'generate a foto', 'create foto', 'generate foto', 'creat a foto', 'creat foto',
  'draw a ', 'draw an ', 'make a photo', 'make a picture', 'make an image', 'make photo', 'make picture', 'make image',
  'mach ein foto', 'mach ein bild', 'mach foto', 'mach bild', 'mach ein photo', 'mach ein picture',
  'erstelle ein foto', 'generiere ein foto', 'erstelle ein bild', 'generiere ein bild',
  'erstelle foto', 'generiere foto', 'foto erstellen', 'bild erstellen', 'bild generieren',
  'erstel ein foto', 'generier ein foto', 'erstel ein bild', 'generier ein bild',
  'erstelle ein photo', 'generiere ein photo', 'erstelle ein picture', 'photo erstellen', 'picture erstellen',
  'create a img', 'generate a img', 'create img', 'generate img',
] as const;

const REGENERATE_KEYWORDS = [
  'nochmal', 'noch einmal', 'nochmal bitte', 'erneut', 'regen', 'wieder',
  'again', 'again please', 'regenerate', 'regenerate please', 'one more', 'same again', 'same please',
  'retry', 'retry please', 'another one', 'one more time',
] as const;

export function isRegenerateKeyword(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return REGENERATE_KEYWORDS.some((k) => lower === k || lower.startsWith(`${k} `) || lower.startsWith(`${k},`));
}

/**
 * Detects whether a free-text prompt clearly asks for image/video generation.
 * Video check runs first to avoid false matches.
 */
export function getIntentFromPrompt(text: string): PromptIntent | null {
  const lower = text.toLowerCase().trim();
  if (VIDEO_PREFIXES.some((p) => lower.startsWith(p))) return 'video';
  if (IMAGE_PREFIXES.some((p) => lower.startsWith(p))) return 'image';
  return null;
}
