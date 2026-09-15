/**
 * Genera los íconos PNG del PWA a partir de un SVG inline.
 * Se corre a mano (`npm run icons`) y los PNG resultantes se commitean,
 * así el build de Vercel no depende de sharp.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "icons");

/** Marca: dos "tarjetas" superpuestas = una reserva compartida entre dos personas. */
const mark = (bleed) => `
  <g transform="translate(${bleed}, ${bleed}) scale(${(512 - bleed * 2) / 512})">
    <rect x="96" y="150" width="280" height="180" rx="34" fill="#ffffff" opacity="0.55"
          transform="rotate(-12 236 240)"/>
    <rect x="136" y="182" width="280" height="180" rx="34" fill="#ffffff"/>
    <rect x="136" y="228" width="280" height="30" fill="#009ee3" opacity="0.18"/>
    <circle cx="356" cy="312" r="26" fill="#ffc400"/>
  </g>`;

const svg = (size, { maskable = false } = {}) => {
  // El ícono maskable necesita 20% de margen para sobrevivir el recorte circular.
  const bleed = maskable ? 102 : 0;
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#22aee9"/>
      <stop offset="100%" stop-color="#006d9f"/>
    </linearGradient>
  </defs>
  ${maskable
    ? `<rect width="512" height="512" fill="url(#g)"/>`
    : `<rect width="512" height="512" rx="112" fill="url(#g)"/>`}
  ${mark(bleed)}
</svg>`);
};

const targets = [
  { file: "icon-192.png", size: 192, opts: {} },
  { file: "icon-512.png", size: 512, opts: {} },
  { file: "icon-maskable-192.png", size: 192, opts: { maskable: true } },
  { file: "icon-maskable-512.png", size: 512, opts: { maskable: true } },
  { file: "apple-touch-icon.png", size: 180, opts: { maskable: true } },
];

await mkdir(OUT, { recursive: true });
for (const { file, size, opts } of targets) {
  const png = await sharp(svg(size, opts)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(OUT, file), png);
  console.log(`✓ ${file} (${size}×${size}, ${(png.length / 1024).toFixed(1)} kB)`);
}

// El favicon lo servimos como SVG: nítido en cualquier densidad y pesa nada.
await writeFile(path.join(process.cwd(), "public", "icon.svg"), svg(512).toString());
console.log("✓ icon.svg");
