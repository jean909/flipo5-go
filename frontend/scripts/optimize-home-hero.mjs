#!/usr/bin/env node
/**
 * Converts public/home/herosection.gif → compressed herosection.mp4 + poster (requires ffmpeg).
 * Also recompresses bring-to-life source if present.
 * Run: npm run optimize:hero
 */
import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'home');
const gif = join(outDir, 'herosection.gif');

const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
if (ffmpeg.status !== 0) {
  console.error('Install ffmpeg and add it to PATH, then re-run this script.');
  process.exit(1);
}

function run(args) {
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (existsSync(gif)) {
  run(['-y', '-i', gif, '-an', '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '32', join(outDir, 'herosection.mp4')]);
  run(['-y', '-i', gif, '-vf', 'select=eq(n\\,0),scale=720:-2', '-frames:v', '1', '-update', '1', '-q:v', '6', join(outDir, 'herosection-poster.jpg')]);
  run(['-y', '-i', join(outDir, 'herosection.mp4'), '-vf', 'scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630', '-frames:v', '1', '-update', '1', '-q:v', '5', join(outDir, 'og.jpg')]);
  try {
    unlinkSync(gif);
    console.log('Removed herosection.gif (use MP4 + poster instead).');
  } catch {
    /* ignore */
  }
} else if (!existsSync(join(outDir, 'herosection.mp4'))) {
  console.error('Missing herosection.gif and herosection.mp4');
  process.exit(1);
}

const legacyBring = join(outDir, 'bring to life.mp4');
const bringOut = join(outDir, 'bring-to-life.mp4');
if (existsSync(legacyBring)) {
  run(['-y', '-i', legacyBring, '-an', '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', "scale='min(960,iw)':-2", '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', bringOut]);
  try {
    unlinkSync(legacyBring);
  } catch {
    /* ignore */
  }
}

console.log('Done. Home media: herosection.mp4, herosection-poster.jpg, og.jpg, bring-to-life.mp4');
