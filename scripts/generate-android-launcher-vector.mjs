import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const projectRoot = resolve(import.meta.dirname, '..');
const sourcePath = resolve(projectRoot, 'logo.svg');
const foregroundImagePath = resolve(
  projectRoot,
  'android/app/src/main/res/drawable-nodpi/ic_launcher_whip_foreground_image.png',
);
const outputPath = resolve(
  projectRoot,
  'android/app/src/main/res/drawable/ic_launcher_whip_foreground.xml',
);

const launcherCanvasSize = 1024;
const launcherArtworkSize = 600;
const renderedLogo = await sharp(sourcePath)
  .resize(launcherArtworkSize, launcherArtworkSize)
  .png()
  .toBuffer();

await sharp({
  create: {
    width: launcherCanvasSize,
    height: launcherCanvasSize,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    {
      input: renderedLogo,
      left: (launcherCanvasSize - launcherArtworkSize) / 2,
      top: (launcherCanvasSize - launcherArtworkSize) / 2,
    },
  ])
  .png()
  .toFile(foregroundImagePath);

writeFileSync(
  outputPath,
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated from logo.svg. Do not edit by hand. -->
<bitmap xmlns:android="http://schemas.android.com/apk/res/android"
    android:src="@drawable/ic_launcher_whip_foreground_image"
    android:gravity="fill" />
`,
);

console.log(`Generated Android launcher artwork from ${sourcePath}`);
