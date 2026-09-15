/**
 * Genera la imagen de preview social (public/og.png, 1200×630).
 *
 * Se arma con capturas REALES del producto en vez de un gráfico inventado: el
 * teléfono de la derecha muestra el instante en que llega el pago del otro, que
 * es exactamente lo que la feature hace.
 *
 * Necesita la app corriendo:
 *   npm run build && npm run start      (en otra terminal)
 *   BASE_URL=http://localhost:3000 npm run og
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EXECUTABLE = process.env.CHROMIUM_PATH;

const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});

// ── 1. Capturas de los dos "celulares" ──────────────────────────────────────
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  locale: "es-AR",
  timezoneId: "America/Argentina/Buenos_Aires",
});
const page = await ctx.newPage();

await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const frames = page.frames().filter((f) => f.url().includes("?s="));
if (frames.length !== 2) throw new Error(`esperaba 2 iframes, encontré ${frames.length}`);
const [juan, sofi] = frames;

for (const f of frames) {
  await f.getByText("Viaje a Bariloche").first().click();
  await f.waitForTimeout(500);
}
await page.waitForTimeout(1800);

const shotOf = async (frame) =>
  (await frame.locator("body").screenshot()).toString("base64");

// Juan paga; se captura el teléfono de Sofi mientras el aviso está en pantalla.
await juan.getByText("Pagar", { exact: true }).first().click();
await juan.waitForTimeout(700);
await juan.getByRole("button", { name: /Escanear/ }).click();
await juan.waitForTimeout(1700);
await juan.getByRole("button", { name: /^Pagar \$/ }).click();
await page.waitForTimeout(600);

const sofiShot = await shotOf(sofi);      // con el aviso visible
await page.waitForTimeout(2600);          // se espera a que el aviso se vaya
await juan.goto(juan.url().split("/pagar")[0]).catch(() => {});
await page.waitForTimeout(1600);
const juanShot = await shotOf(juan);

await ctx.close();

// ── 2. Composición de la tarjeta ────────────────────────────────────────────
const html = `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; display: flex; align-items: center;
    font-family: Nunito, sans-serif; color: #fff; overflow: hidden;
    background:
      radial-gradient(900px 500px at 78% 42%, rgba(0,158,227,.28), transparent 65%),
      radial-gradient(500px 340px at 12% 88%, rgba(255,196,0,.12), transparent 70%),
      #0d1b26;
  }
  .left { width: 560px; padding: 0 0 0 68px; }
  .eyebrow {
    font-size: 17px; font-weight: 800; letter-spacing: .18em;
    text-transform: uppercase; color: #52c3f0; margin-bottom: 18px;
  }
  h1 { font-size: 66px; font-weight: 800; line-height: 1.02; letter-spacing: -.02em; }
  .sub { margin-top: 20px; font-size: 25px; line-height: 1.38; color: rgba(255,255,255,.68); font-weight: 600; }
  .chip {
    margin-top: 34px; display: inline-block; padding: 9px 18px; border-radius: 999px;
    background: rgba(255,255,255,.09); border: 1px solid rgba(255,255,255,.14);
    font-size: 15px; font-weight: 700; color: rgba(255,255,255,.62);
  }
  .right { position: relative; flex: 1; height: 630px; }
  .phone {
    position: absolute; border-radius: 34px; background: #1e2d3a; padding: 8px;
    box-shadow: 0 30px 70px rgba(0,0,0,.55);
  }
  .phone img { display: block; width: 214px; height: 464px; border-radius: 27px; object-fit: cover; object-position: top; }
  /* El de adelante es el que recibe el aviso: es el punto de la feature. */
  .back  { top: 58px;  left: 46px;  transform: rotate(-6deg); }
  .front { top: 104px; left: 258px; transform: rotate(4deg); }
</style></head>
<body>
  <div class="left">
    <div class="eyebrow">Concepto · Billetera virtual</div>
    <h1>Reserva<br>Compartida</h1>
    <p class="sub">Dos personas, una reserva de dinero,<br>y los gastos del otro en tiempo real.</p>
    <div class="chip">Prototipo con fines demostrativos</div>
  </div>
  <div class="right">
    <div class="phone back"><img src="data:image/png;base64,${juanShot}"></div>
    <div class="phone front"><img src="data:image/png;base64,${sofiShot}"></div>
  </div>
</body></html>`;

const cardCtx = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
const card = await cardCtx.newPage();
await card.setContent(html, { waitUntil: "networkidle" });
await card.evaluate(() => document.fonts.ready);
await card.waitForTimeout(700);

const png = await card.screenshot({ type: "png" });
const out = path.join(process.cwd(), "public", "og.png");
await writeFile(out, png);
console.log(`✓ public/og.png (1200×630, ${(png.length / 1024).toFixed(0)} kB)`);

await browser.close();
