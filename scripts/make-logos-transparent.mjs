import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'crossroads-logo.png',
  'crossroads-mark.png',
  'crossroads-wordmark.png',
];

async function stripBlackBackground(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = (r + g + b) / 3;

    if (luminance < 24) {
      data[i + 3] = 0;
    } else if (luminance < 56) {
      data[i + 3] = Math.min(255, Math.round(((luminance - 24) / 32) * 255));
    }
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 8 })
    .png()
    .toFile(outputPath);
}

for (const file of files) {
  const input = path.join(root, file);
  const output = path.join(root, file.replace('.png', '-transparent.png'));
  await stripBlackBackground(input, output);
  console.log(`Created ${output}`);
}