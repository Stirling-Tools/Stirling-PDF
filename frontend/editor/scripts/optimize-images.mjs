// Generate AVIF (primary) + WebP (fallback) siblings for the brand PNGs, plus
// responsive width variants for the hero image. The React layer then serves
// them via <picture> (see BrandImage.tsx); JPEG/PNG remain the last fallback.
//
// Run manually (npm run optimize:images); outputs are committed alongside the
// originals so the build stays dependency-free.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const brandRoot = path.resolve(dirname, "../src/core/assets/brand");

const logos = ["classic-logo", "modern-logo"];

// Name -> responsive widths for the hero (landing) image.
const HERO_WIDTHS = [400, 800, 1200, 1600];

async function emitVariants(file, { widths = null } = {}) {
  const ext = path.extname(file).toLowerCase();
  if (ext !== ".png" && ext !== ".jpg" && ext !== ".jpeg") return;

  const dir = path.dirname(file);
  const stem = path.basename(file, ext);

  for (const format of ["avif", "webp"]) {
    const out = path.join(dir, `${stem}.${format}`);
    const pipeline = sharp(file).toFormat(
      format,
      format === "avif"
        ? { quality: 50, effort: 6 }
        : { quality: 75, effort: 5 },
    );
    await pipeline.toFile(out);
  }

  if (widths) {
    for (const w of widths) {
      for (const format of ["avif", "webp"]) {
        const out = path.join(dir, `${stem}-${w}w.${format}`);
        await sharp(file)
          .resize({ width: w, withoutEnlargement: true })
          .toFormat(
            format,
            format === "avif"
              ? { quality: 50, effort: 6 }
              : { quality: 75, effort: 5 },
          )
          .toFile(out);
      }
    }
  }
}

let count = 0;
for (const logo of logos) {
  const dir = path.join(brandRoot, logo);
  for (const entry of fs.readdirSync(dir)) {
    const file = path.join(dir, entry);
    const isHero = entry.startsWith("Firstpage");
    await emitVariants(file, { widths: isHero ? HERO_WIDTHS : null });
    count++;
  }
}
console.log(
  `[optimize-images] generated AVIF/WebP variants for ${count} brand images`,
);
