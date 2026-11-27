import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..');
const res = join(root, 'android/app/src/main/res');
const markSvg = await readFile(join(repo, 'public/brand/mark.svg'));
const navy = { r: 24, g: 33, b: 59, alpha: 1 };
const paper = { r: 247, g: 245, b: 240, alpha: 1 };

async function markPng(size) {
  return sharp(markSvg).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

async function square(size, background, markRatio) {
  const mark = await markPng(Math.round(size * markRatio));
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toBuffer();
}

const launcher = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};
const foreground = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432
};

for (const [dir, size] of Object.entries(launcher)) {
  const icon = await square(size, navy, 0.72);
  await writeFile(join(res, dir, 'ic_launcher.png'), icon);
  await writeFile(join(res, dir, 'ic_launcher_round.png'), icon);
}
for (const [dir, size] of Object.entries(foreground)) {
  const icon = await square(size, { r: 0, g: 0, b: 0, alpha: 0 }, 0.58);
  await writeFile(join(res, dir, 'ic_launcher_foreground.png'), icon);
}

const playDir = join(repo, 'docs/play');
await mkdir(playDir, { recursive: true });
await writeFile(join(playDir, 'icon-512.png'), await square(512, navy, 0.72));

const featureMark = await markPng(280);
const feature = await sharp({ create: { width: 1024, height: 500, channels: 4, background: navy } })
  .composite([
    { input: featureMark, left: 72, top: 110 },
    {
      input: Buffer.from(`<svg width="640" height="500" xmlns="http://www.w3.org/2000/svg">
        <text x="0" y="200" fill="#F7F5F0" font-family="Inter, DejaVu Sans, sans-serif" font-size="60" font-weight="600">OpenExam Hub</text>
        <text x="0" y="262" fill="#E7E1D7" font-family="Inter, DejaVu Sans, sans-serif" font-size="26">Study plans from official exam material</text>
      </svg>`),
      left: 390,
      top: 0
    }
  ])
  .png()
  .toBuffer();
await writeFile(join(playDir, 'feature-1024x500.png'), feature);

const splashDirs = [
  'drawable',
  'drawable-land-mdpi',
  'drawable-land-hdpi',
  'drawable-land-xhdpi',
  'drawable-land-xxhdpi',
  'drawable-land-xxxhdpi',
  'drawable-port-mdpi',
  'drawable-port-hdpi',
  'drawable-port-xhdpi',
  'drawable-port-xxhdpi',
  'drawable-port-xxxhdpi'
];
for (const dir of splashDirs) {
  const file = join(res, dir, 'splash.png');
  const meta = await sharp(file).metadata();
  const mark = await markPng(Math.round(Math.min(meta.width, meta.height) * 0.42));
  await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: paper } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png()
    .toFile(file);
}

console.log('brand assets written');
