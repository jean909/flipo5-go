import { describe, expect, it } from 'vitest';
import { getIntentFromPrompt, isRegenerateKeyword } from './promptIntent';

describe('prompt intent detection', () => {
  it('detects image intent in EN', () => {
    expect(getIntentFromPrompt('create a photo with a car')).toBe('image');
    expect(getIntentFromPrompt('generate image of mountains')).toBe('image');
  });

  it('detects video intent in EN', () => {
    expect(getIntentFromPrompt('create a video about racing')).toBe('video');
    expect(getIntentFromPrompt('generate video of ocean')).toBe('video');
  });

  it('detects intents in DE', () => {
    expect(getIntentFromPrompt('erstelle ein foto von einem auto')).toBe('image');
    expect(getIntentFromPrompt('video erstellen vom meer')).toBe('video');
  });

  it('handles typo variants', () => {
    expect(getIntentFromPrompt('creat a photo of city')).toBe('image');
    expect(getIntentFromPrompt('generat a video with rain')).toBe('video');
  });

  it('prefers video when both could match', () => {
    expect(getIntentFromPrompt('create a video and image')).toBe('video');
  });

  it('returns null for normal chat prompts', () => {
    expect(getIntentFromPrompt('help me write a linkedin post')).toBeNull();
  });
});

describe('regenerate keyword detection', () => {
  it('detects exact keywords', () => {
    expect(isRegenerateKeyword('again')).toBe(true);
    expect(isRegenerateKeyword('nochmal')).toBe(true);
  });

  it('detects keyword with punctuation or suffix', () => {
    expect(isRegenerateKeyword('again, please')).toBe(true);
    expect(isRegenerateKeyword('nochmal bitte')).toBe(true);
  });

  it('does not trigger on unrelated text', () => {
    expect(isRegenerateKeyword('make it cinematic')).toBe(false);
  });
});
