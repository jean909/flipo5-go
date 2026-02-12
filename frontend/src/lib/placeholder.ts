import type { Locale } from '@/lib/i18n';

function firstName(fullName: string | undefined): string {
  if (!fullName?.trim()) return '';
  const n = fullName.trim();
  const i = n.indexOf(' ');
  return i > 0 ? n.slice(0, i) : n;
}

// Time-based friendly placeholders. Multiple variants per slot for variety.
const EN: Record<string, string[]> = {
  morning: ['Good morning', 'Rise and shine', 'Hey there'],
  afternoon: ["How's your day going", 'How is your day going', 'Hope your day is going well'],
  evening: ['Hey', 'Good evening', 'How was your day'],
  night: ['Still up', 'Late night', 'Hey'],
  monday: ['Happy Monday', 'Starting the week strong', 'New week'],
  saturday: ['Happy weekend', 'Happy Saturday', 'Weekend vibes'],
  sunday: ['Relaxing Sunday', 'Happy Sunday', 'Chill Sunday'],
};

const DE: Record<string, string[]> = {
  morning: ['Guten Morgen', 'Guten Tag'],
  afternoon: ['Wie läuft dein Tag', 'Schönen Tag noch'],
  evening: ['Hallo', 'Guten Abend', 'Wie war dein Tag'],
  night: ['Noch wach', 'Später Abend'],
  monday: ['Schönen Montag', 'Frisch in die Woche'],
  saturday: ['Schönes Wochenende', 'Schönen Samstag'],
  sunday: ['Entspannten Sonntag', 'Schönen Sonntag'],
};

export function getFriendlyPlaceholder(fullName: string | undefined, locale: Locale): string {
  const name = firstName(fullName);
  const suffix = name ? `, ${name}?` : '?';
  const d = dict(locale);

  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  let slot: string;
  let variants: string[];

  if (day === 1) {
    slot = 'monday';
  } else if (day === 6) {
    slot = 'saturday';
  } else if (day === 0) {
    slot = 'sunday';
  } else if (hour >= 6 && hour < 12) {
    slot = 'morning';
  } else if (hour >= 12 && hour < 18) {
    slot = 'afternoon';
  } else if (hour >= 18 && hour < 22) {
    slot = 'evening';
  } else {
    slot = 'night';
  }

  variants = d[slot] ?? d.afternoon;
  const idx = (hour + day) % variants.length;
  const greeting = variants[idx] ?? variants[0];

  return greeting + suffix;
}

function dict(locale: Locale): Record<string, string[]> {
  return locale === 'de' ? DE : EN;
}
