import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
/** Captures the local editor and the illustrative Processor story as 1200x630 social cards.
 * Start frontend dev on :5173 and Storybook on :6006; see og-assets/README.md. */
import { chromium } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import {
  mockAppApis,
  skipOnboarding,
  seedCookieConsent,
} from "@app/tests/helpers/api-stubs.ts";
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const p = pdf.addPage([620, 800]);
const ink = rgb(0.16, 0.2, 0.28),
  blue = rgb(0.16, 0.36, 0.72);
const text = (s: string, x: number, y: number, size = 12, b = false) =>
  p.drawText(s, { x, y, size, font: b ? bold : font, color: ink });
p.drawRectangle({
  x: 0,
  y: 660,
  width: 620,
  height: 140,
  color: rgb(0.94, 0.96, 0.99),
});
text("NORTHSTAR", 44, 742, 15, true);
text("Quarterly business review", 44, 697, 28, true);
text("Q3 2026  /  Operations & finance", 44, 674, 12);
text("A stronger quarter, on every measure.", 44, 620, 19, true);
text("Revenue", 44, 570);
text("Documents processed", 240, 570);
text("Time saved", 445, 570);
text("$4.8M", 44, 534, 29, true);
text("38,000", 240, 534, 29, true);
text("640 hrs", 445, 534, 29, true);
p.drawLine({
  start: { x: 44, y: 510 },
  end: { x: 576, y: 510 },
  color: rgb(0.8, 0.84, 0.9),
  thickness: 1,
});
text("Operational highlights", 44, 477, 18, true);
for (const [i, s] of [
  "Invoice handling accelerated across all regional teams.",
  "Sensitive customer data protected before documents are shared.",
  "Contract reviews consolidated into one secure workflow.",
].entries())
  text(s, 44, 445 - i * 27, 12);
text("Processing volume by team", 44, 329, 18, true);
for (const [i, label] of [
  "Finance",
  "Operations",
  "Legal",
  "People",
].entries()) {
  const y = 290 - i * 39;
  text(label, 44, y, 12);
  p.drawRectangle({
    x: 142,
    y: y - 3,
    width: [370, 300, 215, 150][i],
    height: 17,
    color: blue,
  });
}
text("Prepared for the leadership team", 44, 75, 11);
text("Internal review  |  September 2026", 44, 56, 10);
const data = await pdf.save();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const editorPage = await browser.newPage({
    viewport: { width: 1440, height: 620 },
  });
  await seedCookieConsent(editorPage);
  await skipOnboarding(editorPage);
  await mockAppApis(editorPage);
  await editorPage.goto("http://localhost:5173/editor", {
    waitUntil: "domcontentloaded",
  });
  await editorPage
    .getByRole("button", { name: "Browse files", exact: true })
    .waitFor({ timeout: 60000 });
  const chooser = editorPage.waitForEvent("filechooser");
  await editorPage
    .getByRole("button", { name: "Browse files", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "Quarterly business review.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(data),
  });
  await editorPage.waitForTimeout(8000);

  const editorImage = await editorPage.screenshot();

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  const story = await browser.newPage({
    viewport: { width: 1120, height: 650 },
    deviceScaleFactor: 2,
  });
  await story.goto(
    "http://localhost:6006/iframe.html?id=portal-marketing-processorpreview--enterprise&viewMode=story&globals=theme:light",
    { waitUntil: "domcontentloaded" },
  );
  await story.locator(".portal-pf__policy").first().waitFor({ timeout: 60000 });
  await story.waitForFunction(
    () =>
      document.querySelectorAll(".portal-pf__particles circle").length >= 20,
  );
  const processorImage = await story.locator(".portal-pf").screenshot();

  const uri = async (p: string, mime: string) =>
    `data:${mime};base64,${(await fs.readFile(p)).toString("base64")}`;
  const css = await fs.readFile(
    path.join(root, "src/core/theme/primitives.css"),
    "utf8",
  );
  const colors = await fs.readFile(
    path.join(root, "src/core/theme/colors.css"),
    "utf8",
  );
  const logo = await uri(
    path.join(root, "src/core/assets/brand/branding-logo/wordmark-light.svg"),
    "image/svg+xml",
  );
  const mark = await uri(
    path.join(root, "src/core/assets/brand/branding-logo/logo-mark.svg"),
    "image/svg+xml",
  );
  const fontUri = await uri(
    path.join(root, "public/fonts/NotoSans-Regular.ttf"),
    "font/ttf",
  );
  const editor = `data:image/png;base64,${editorImage.toString("base64")}`;
  const processor = `data:image/png;base64,${processorImage.toString("base64")}`;
  const cards = [
    {
      out: "home.png",
      title: "Your PDFs. Your tools. Your control.",
      sub: "Edit, sign, redact and convert with Stirling.",
      image: editor,
      processor: false,
    },
    {
      out: "saas/app.png",
      title: "Edit any PDF. Govern every PDF.",
      sub: "One workspace for your documents. One Processor for your business.",
      image: editor,
      processor: false,
    },
    {
      out: "saas/app-editor.png",
      title: "Make every PDF work for you.",
      sub: "Edit, annotate, sign, redact and convert. Free and open source.",
      image: editor,
      processor: false,
    },
    {
      out: "saas/app-processor.png",
      title: "Turn document traffic into work done.",
      sub: "Extract. Protect. Classify. Route. Archive.",
      image: processor,
      processor: true,
    },
  ];
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  for (const card of cards) {
    await page.setContent(`<!doctype html><html data-theme="light"><head><style>${css}\n${colors}
@font-face{font-family:Preview;src:url('${fontUri}')}*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:Preview,Arial,sans-serif;background:var(--c-bg);color:var(--c-text)}
header{height:77px;padding:22px 40px 0;display:flex;align-items:center;gap:14px}.mark{width:40px;height:40px}.logo{width:116px;height:40px}.tag{margin-left:4px;padding-left:18px;border-left:1px solid var(--c-border);font-size:14px;color:var(--c-text-muted);letter-spacing:2px}.downloads{margin-left:auto;color:var(--c-text-muted);font-size:17px}.downloads strong{font-size:25px;color:var(--c-text)}h1{font-size:41px;line-height:1.15;letter-spacing:-1.5px;margin:17px 40px 8px;font-weight:900}p{margin:0 40px;color:var(--c-text-muted);font-size:18px}.shot{position:absolute;left:40px;top:185px;width:1120px;height:421px;border:1px solid var(--c-border);border-radius:14px;overflow:hidden;box-shadow:0 12px 32px color-mix(in srgb,var(--c-text) 9%,transparent);background:var(--c-surface)}.shot img{width:100%;height:100%;object-fit:contain;display:block}.demo{position:absolute;right:54px;bottom:30px;font-size:10px;color:var(--c-text-muted);background:var(--c-surface);padding:3px 6px;border-radius:4px}
</style></head><body><header><img class="mark" src="${mark}"><img class="logo" src="${logo}"><span class="tag">${card.processor ? "PROCESSOR" : "PDF EDITOR"}</span><span class="downloads"><strong>30M+</strong> downloads</span></header><h1>${card.title}</h1><p>${card.sub}</p><div class="shot"><img src="${card.image}"></div>${card.processor ? '<span class="demo">Illustrative workflow · Mock data</span>' : ""}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(root, "public/og_images", card.out),
    });
  }
} finally {
  await browser.close();
}
