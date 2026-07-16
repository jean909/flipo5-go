#!/usr/bin/env node
/**
 * Converts public/home/herosection.gif → herosection.webm + herosection.mp4 (requires ffmpeg on PATH).
 * Run: node scripts/optimize-home-hero.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const input = join(root, 'public', 'home', 'herosection.gif');
const outDir = join(root, 'public', 'home');

if (!existsSync(input)) {
  console.error('Missing:', input);
  process.exit(1);
}

const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
if (ffmpeg.status !== 0) {
  console.error('Install ffmpeg and add it to PATH, then re-run this script.');
  process.exit(1);
}

const jobs = [
  ['-y', '-i', input, '-movflags', '+faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=1920:-2', '-c:v', 'libx264', '-crf', '28', join(outDir, 'herosection.mp4')],
  ['-y', '-i', input, '-c:v', 'libvpx-vp9', '-crf', '35', '-b:v', '0', '-vf', 'scale=1920:-2', join(outDir, 'herosection.webm')],
];

for (const args of jobs) {
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log('Done. Deploy herosection.webm + herosection.mp4; home page prefers them over the GIF.');
