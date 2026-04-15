export type PromptIntent = 'image' | 'video';

export type ModeIntent = PromptIntent | 'chat';

 

type IntentHints = {

  hasImageAttachment?: boolean;

  hasVideoAttachment?: boolean;

};

 

const VIDEO_PREFIXES = [

  'create a video', 'generate a video', 'create video', 'generate video', 'make a video', 'make video',

  'creat a video', 'generat a video', 'creat video', 'generat video', 'create a vid', 'generate a vid', 'develop a video', 'develop a vid',

  'erstelle ein video', 'generiere ein video', 'erstelle video', 'generiere video', 'video erstellen', 'video generieren',

  'erstel ein video', 'generier ein video', 'erstelle ein vid', 'mach ein video', 'mach video', 'erschaffe ein video', 'video erschaffen', 'erschaffe video', 'entwickle ein video',

  'create video of', 'generate video of', 'make video of', 'mach daraus ein video', 'wandle das in ein video um', 'erstelle daraus ein video',

] as const;

 

const IMAGE_PREFIXES = [

  'create a photo', 'generate a photo', 'create a picture', 'generate a picture', 'create an image', 'generate an image',

  'create photo', 'generate photo', 'create picture', 'generate picture', 'create image', 'generate image',

  'creat a photo', 'generat a photo', 'creat a picture', 'creat photo', 'generat photo', 'creat image', 'generat image',

  'create a foto', 'generate a foto', 'create foto', 'generate foto', 'creat a foto', 'creat foto',

  'draw a ', 'draw an ', 'make a photo', 'make a picture', 'make an image', 'make photo', 'make picture', 'make image',

  'mach ein foto', 'mach ein bild', 'mach foto', 'mach bild',

  'erstelle ein foto', 'generiere ein foto', 'erstelle ein bild', 'generiere ein bild',

  'erstelle foto', 'generiere foto', 'foto erstellen', 'bild erstellen', 'bild generieren', 'bild erschaffen', 'bild entwickeln',

  'create a img', 'generate a img', 'create img', 'generate img', 'erstelle mir ein bild', 'mach mir ein bild', 'generiere mir ein bild', 'erzeuge ein bild', 'mach daraus ein bild', 'wandle das in ein bild um', 'erstelle daraus ein bild',

] as const;

 

const REGENERATE_KEYWORDS = [

  'nochmal', 'noch einmal', 'nochmal bitte', 'erneut', 'regen', 'wieder', 'abermalig', 'wiederholen', 'widerholen',

  'again', 'again please', 'regenerate', 'regenerate please', 'one more', 'same again', 'same please',

  'retry', 'retry please', 'another one', 'one more time', 'repeat', 'again pls', 'same pls','retry pls', 'do it again', 'do it again please',

] as const;

 

const ANALYZE_WORDS = [

  'analyze', 'analyse', 'describe', 'explain', 'identify', 'compare', 'what do you see', 'what is in',

  'analysiere', 'beschreibe', 'erklaere', 'erklare', 'identifiziere', 'vergleiche', 'was siehst', 'was ist in', 'zeige mir',

] as const;

 

const GENERATE_VERBS = [

  'create', 'generate', 'make', 'draw', 'render', 'design',

  'erstelle', 'generiere', 'mach', 'zeichne', 'render', 'kreiere', 'visualisiere', 'vizualize', 'vizualise',

] as const;

 

const IMAGE_WORDS = [

  'image', 'picture', 'photo', 'drawing', 'blueprint', 'sketch', 'illustration', 'line art', 'scenery',

  'bild', 'foto', 'zeichnung', 'skizze', 'illustration', 'schwarz-weiss', 'schwarz-weiß', 'aufnahme', 'szene', 'studie', 'rendering', 'mockup', 'produktfoto', 'freisteller', 'thumbnail', 'banner', 'poster', 'cover', 'portrait', 'headshot', 'titelbild',

] as const;

 

const VIDEO_WORDS = [

  'video', 'clip', 'animation', 'movie', 'reel', 'cinematic',
  'film', 'sequenz', 'footage', 'short', 'commercial', 'ad', 'promo', 'trailer', 'loop', 'timelapse', 'slow motion', 'panning', 'camera move', 'kamerafahrt', 'produktvideo',

] as const;

 

function includesAny(haystack: string, needles: readonly string[]): boolean {

  return needles.some((n) => haystack.includes(n));

}

 

export function isRegenerateKeyword(text: string): boolean {

  const lower = text.toLowerCase().trim();

  return REGENERATE_KEYWORDS.some((k) => lower === k || lower.startsWith(`${k} `) || lower.startsWith(`${k},`));

}

 

export function getIntentFromPrompt(text: string, hints: IntentHints = {}): PromptIntent | null {

  const lower = text.toLowerCase().trim();

  if (!lower) return null;

 

  if (VIDEO_PREFIXES.some((p) => lower.startsWith(p))) return 'video';

  if (IMAGE_PREFIXES.some((p) => lower.startsWith(p))) return 'image';

 

  let chatScore = 0;

  let imageScore = 0;

  let videoScore = 0;

 

  if (includesAny(lower, ANALYZE_WORDS) || lower.includes('?')) chatScore += 4;

 

  const hasGenerateVerb = includesAny(lower, GENERATE_VERBS);

  if (hasGenerateVerb) {

    imageScore += 2;

    videoScore += 2;

  }

  if (includesAny(lower, IMAGE_WORDS)) imageScore += 3;

  if (includesAny(lower, VIDEO_WORDS)) videoScore += 3;

 

  if (hints.hasImageAttachment) {

    imageScore += 1;

    if (includesAny(lower, ANALYZE_WORDS)) chatScore += 2;

  }

  if (hints.hasVideoAttachment) videoScore += 2;

 

  const topGeneration = Math.max(imageScore, videoScore);

  const generationGap = Math.abs(imageScore - videoScore);

  if (topGeneration < 4) return null;

  if (generationGap < 2) return null;

  if (chatScore >= topGeneration) return null;

  return imageScore > videoScore ? 'image' : 'video';

}

 

export function detectModeIntent(text: string, hints: IntentHints = {}): ModeIntent {

  return getIntentFromPrompt(text, hints) ?? 'chat';

}

 

export function extractImageInputsFromJobInput(input: unknown): string[] | undefined {

  if (!input || typeof input !== 'object') return undefined;

  const record = input as Record<string, unknown>;

  const out: string[] = [];

  const add = (value: unknown) => {

    if (!Array.isArray(value)) return;

    for (const item of value) {

      if (typeof item === 'string' && item.trim()) out.push(item);

    }

  };

  add(record.imageInput);

  add(record.image_input);

  if (typeof record.image === 'string' && record.image.trim()) out.push(record.image);

  if (typeof record.source_url === 'string' && record.source_url.trim()) out.push(record.source_url);

  return out.length ? Array.from(new Set(out)) : undefined;

}