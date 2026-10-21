import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import {
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
} from "@cantoo/pdf-lib";

/**
 * Capture-only walkthrough for read-aloud language detection and the new
 * player. Uses fake speech voices so the panel can be driven without a real
 * OS voice pack; the detector reads real text from the generated PDFs.
 */

test.skip(!!process.env.CI, "capture-only spec; not for CI");

const SHOT_DIR = path.resolve(process.cwd(), "screenshots", "read-aloud");

const SPANISH = [
  "CONTRATO DE ARRENDAMIENTO DE VIVIENDA",
  "Este contrato de arrendamiento se celebra entre el arrendador y el",
  "arrendatario para la vivienda situada en la ciudad. El arrendatario",
  "pagará una renta mensual de 1150 euros según las condiciones que las",
  "partes acuerdan por el plazo de doce meses. Ambas partes firman este",
  "documento según la ley aplicable y declaran que la vivienda se",
  "encuentra en buen estado para su uso habitual.",
].join("\n");

const FRENCH = [
  "CONTRAT DE LOCATION",
  "Ce contrat de location est conclu entre le bailleur et le locataire",
  "pour le logement situé dans la ville. Le locataire paiera un loyer",
  "mensuel de mille euros selon les conditions convenues par les parties",
  "pour une durée de douze mois. Les parties déclarent que le logement",
  "est en bon état et adapté à son usage habituel.",
].join("\n");

const ENGLISH = [
  "RESIDENTIAL LEASE AGREEMENT",
  "This lease agreement is made between the landlord and the tenant for",
  "the property located in the city. The tenant agrees to pay a monthly",
  "rent of one thousand euros under the terms agreed by the parties for",
  "a period of twelve months. Both parties confirm that the property is",
  "in good condition and suitable for ordinary residential use.",
].join("\n");

const VOICES = [
  { name: "Samantha", lang: "en-US", default: true },
  { name: "Daniel", lang: "en-GB" },
  { name: "Mónica", lang: "es-ES", default: true },
  { name: "Paulina", lang: "es-MX" },
  { name: "Amélie", lang: "fr-FR", default: true },
  { name: "Anna", lang: "de-DE", default: true },
];

interface SpeechStubOptions {
  voices?: typeof VOICES;
  endDelayMs?: number;
}

async function stubSpeech(
  page: Page,
  { voices = VOICES, endDelayMs = 30_000 }: SpeechStubOptions = {},
) {
  await page.addInitScript(
    ({ voices, endDelayMs }) => {
      type Handler = (event: unknown) => void;
      class FakeUtterance {
        text: string;
        lang = "";
        rate = 1;
        voice: unknown = null;
        onstart: Handler | null = null;
        onend: Handler | null = null;
        onerror: Handler | null = null;
        onboundary: Handler | null = null;
        constructor(text: string) {
          this.text = text;
        }
      }

      const listeners = new Map<string, Set<Handler>>();
      const fakeVoices = voices.map((voice) => ({
        ...voice,
        voiceURI: `${voice.name}-${voice.lang}`,
        localService: true,
      }));
      let timers: number[] = [];

      const synth = {
        speaking: false,
        paused: false,
        pending: false,
        getVoices: () => fakeVoices,
        addEventListener: (type: string, handler: Handler) => {
          const set = listeners.get(type) ?? new Set<Handler>();
          set.add(handler);
          listeners.set(type, set);
        },
        removeEventListener: (type: string, handler: Handler) => {
          listeners.get(type)?.delete(handler);
        },
        speak: (utterance: FakeUtterance) => {
          synth.speaking = true;
          sentenceTimers(utterance);
        },
        cancel: () => {
          for (const timer of timers) window.clearTimeout(timer);
          timers = [];
          synth.speaking = false;
        },
        pause: () => {
          synth.paused = true;
        },
        resume: () => {
          synth.paused = false;
        },
      };

      function sentenceTimers(utterance: FakeUtterance) {
        timers.push(
          window.setTimeout(() => {
            utterance.onstart?.({});
          }, 30),
        );
        timers.push(
          window.setTimeout(() => {
            utterance.onboundary?.({ name: "word", charIndex: 0 });
          }, 60),
        );
        timers.push(
          window.setTimeout(() => {
            synth.speaking = false;
            utterance.onend?.({});
          }, endDelayMs),
        );
      }

      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: FakeUtterance,
      });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: synth,
      });
    },
    { voices, endDelayMs },
  );
}

async function makePdfPages(
  target: string,
  texts: readonly string[],
  languageTag?: string,
): Promise<string> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of texts) {
    const page = doc.addPage([595, 842]);
    page.drawText(text, {
      x: 56,
      y: 760,
      size: 12,
      lineHeight: 18,
      maxWidth: 480,
      font,
    });
  }
  if (languageTag) {
    doc.catalog.set(PDFName.of("Lang"), PDFString.of(languageTag));
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, await doc.save());
  return target;
}

async function makePdf(
  target: string,
  text: string,
  languageTag?: string,
): Promise<string> {
  return makePdfPages(target, [text], languageTag);
}

async function openViewer(page: Page, pdfPath: string): Promise<void> {
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(pdfPath);
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 30_000 })
    .toBeGreaterThan(0);
}

async function openReadAloud(page: Page) {
  const button = page.getByRole("button", { name: /Read aloud/i }).first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(page.locator(".read-aloud-player")).toBeVisible({
    timeout: 10_000,
  });
}

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SHOT_DIR, `${name}.png`),
    fullPage: false,
  });
}

async function useDarkMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const stored = localStorage.getItem("stirlingpdf_preferences");
    const preferences = stored ? JSON.parse(stored) : {};
    localStorage.setItem(
      "stirlingpdf_preferences",
      JSON.stringify({ ...preferences, theme: "dark" }),
    );
    localStorage.setItem("mantine-color-scheme", "dark");
    localStorage.setItem("mantine-color-scheme-value", "dark");
  });
  await page.emulateMedia({ colorScheme: "dark" });
}

test.describe("read aloud language walkthrough", () => {
  test.use({
    autoGoto: false,
    viewport: { width: 1600, height: 1000 },
  });

  test("01 Spanish detected light", async ({ page }, testInfo) => {
    await stubSpeech(page);
    const pdf = await makePdf(testInfo.outputPath("lease-es.pdf"), SPANISH);
    await openViewer(page, pdf);
    await openReadAloud(page);
    await expect(page.getByText("Detected Spanish")).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, "01_spanish_detected_light");
  });

  test("02 Spanish detected dark", async ({ page }, testInfo) => {
    await useDarkMode(page);
    await stubSpeech(page);
    const pdf = await makePdf(testInfo.outputPath("lease-es.pdf"), SPANISH);
    await openViewer(page, pdf);
    await openReadAloud(page);
    await expect(page.getByText("Detected Spanish")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      "dark",
    );
    await shot(page, "02_spanish_detected_dark");
  });

  test("03 French playing with voice picker", async ({ page }, testInfo) => {
    await stubSpeech(page);
    const pdf = await makePdf(testInfo.outputPath("lease-fr.pdf"), FRENCH);
    await openViewer(page, pdf);
    await openReadAloud(page);
    await expect(page.getByText("Detected French")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    // Clicking the page must not take the controls away while audio is playing.
    await page.locator('[data-page-index="0"]').click();
    await expect(page.locator(".read-aloud-player")).toBeVisible();
    await page.getByRole("textbox", { name: "Voice" }).click();
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.mouse.move(0, 0);
    await shot(page, "03_french_playing_voice_picker");
  });

  test("04 no Spanish voice", async ({ page }, testInfo) => {
    await stubSpeech(page, {
      voices: [
        { name: "Samantha", lang: "en-US", default: true },
        { name: "Daniel", lang: "en-GB" },
      ],
    });
    const pdf = await makePdf(testInfo.outputPath("lease-es.pdf"), SPANISH);
    await openViewer(page, pdf);
    await openReadAloud(page);
    await expect(page.getByText("Detected Spanish")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/No voice is installed for Spanish/),
    ).toBeVisible();
    await shot(page, "04_no_spanish_voice_light");
  });

  test("05 English tagged PDF", async ({ page }, testInfo) => {
    await stubSpeech(page);
    const pdf = await makePdf(
      testInfo.outputPath("lease-en.pdf"),
      ENGLISH,
      "en-US",
    );
    await openViewer(page, pdf);
    await openReadAloud(page);
    await expect(page.getByText("Detected English")).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, "05_english_tagged_light");
  });

  test("06 mobile reader sidebar", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await stubSpeech(page);
    const pdf = await makePdf(testInfo.outputPath("lease-es.pdf"), SPANISH);
    await openViewer(page, pdf);
    // On a phone the reader surface is reached through the tool picker, not the
    // desktop quick-nav rail; selecting the Read tool turns the wings off.
    await page.getByRole("button", { name: "Tools", exact: true }).click();
    await page.getByRole("link", { name: "Read", exact: true }).first().click();
    await expect(page.locator("[data-page-index]").first()).toBeVisible({
      timeout: 10_000,
    });
    await openReadAloud(page);
    await expect(page.getByText("Detected Spanish")).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, "06_mobile_sidebar_light");
  });

  test("07 advances pages and pauses without losing the cursor", async ({
    page,
  }, testInfo) => {
    await stubSpeech(page, { endDelayMs: 40 });
    const pdf = await makePdfPages(
      testInfo.outputPath("lease-es-two-pages.pdf"),
      [SPANISH, SPANISH],
    );
    await openViewer(page, pdf);
    await openReadAloud(page);
    await expect(page.getByText("Detected Spanish")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
  });

  test("08 French playing dark", async ({ page }, testInfo) => {
    await useDarkMode(page);
    await stubSpeech(page);
    const pdf = await makePdf(testInfo.outputPath("lease-fr.pdf"), FRENCH);
    await openViewer(page, pdf);
    await openReadAloud(page);
    await expect(page.getByText("Detected French")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await page.mouse.move(0, 0);
    await shot(page, "08_french_playing_dark");
  });

  test("09 no Spanish voice dark", async ({ page }, testInfo) => {
    await useDarkMode(page);
    await stubSpeech(page, {
      voices: [{ name: "Samantha", lang: "en-US", default: true }],
    });
    const pdf = await makePdf(testInfo.outputPath("lease-es.pdf"), SPANISH);
    await openViewer(page, pdf);
    await openReadAloud(page);
    await expect(page.getByText("Detected Spanish")).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, "09_no_spanish_voice_dark");
  });

  test("10 English tagged dark", async ({ page }, testInfo) => {
    await useDarkMode(page);
    await stubSpeech(page);
    const pdf = await makePdf(
      testInfo.outputPath("lease-en.pdf"),
      ENGLISH,
      "en-US",
    );
    await openViewer(page, pdf);
    await openReadAloud(page);
    await expect(page.getByText("Detected English")).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, "10_english_tagged_dark");
  });

  test("11 mobile sidebar dark", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await useDarkMode(page);
    await stubSpeech(page);
    const pdf = await makePdf(testInfo.outputPath("lease-es.pdf"), SPANISH);
    await openViewer(page, pdf);
    await page.getByRole("button", { name: "Tools", exact: true }).click();
    await page.getByRole("link", { name: "Read", exact: true }).first().click();
    await expect(page.locator("[data-page-index]").first()).toBeVisible({
      timeout: 10_000,
    });
    await openReadAloud(page);
    await expect(page.getByText("Detected Spanish")).toBeVisible({
      timeout: 15_000,
    });
    await shot(page, "11_mobile_sidebar_dark");
  });

  test("12 collapses to mini player", async ({ page }, testInfo) => {
    await stubSpeech(page);
    const pdf = await makePdf(testInfo.outputPath("lease-es.pdf"), SPANISH);
    await openViewer(page, pdf);
    await openReadAloud(page);
    await expect(page.getByText("Detected Spanish")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Collapse to mini player" }).click();
    await expect(page.locator(".read-aloud-mini")).toBeVisible();
    await expect(page.locator(".read-aloud-sidebar")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await shot(page, "12_mini_player_light");
    await page.getByRole("button", { name: "Show controls" }).click();
    await expect(page.locator(".read-aloud-player")).toBeVisible();
  });

  test("13 read mode collapses the panel", async ({ page }, testInfo) => {
    await stubSpeech(page);
    const pdf = await makePdf(testInfo.outputPath("lease-es.pdf"), SPANISH);
    await openViewer(page, pdf);
    await openReadAloud(page);
    await expect(page.getByText("Detected Spanish")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Read mode", exact: true }).click();
    await expect(page.locator(".read-aloud-mini")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("PDF Library")).toBeHidden({ timeout: 5_000 });
    await shot(page, "13_read_mode_light");
  });

  test("14 mini player dark", async ({ page }, testInfo) => {
    await useDarkMode(page);
    await stubSpeech(page);
    const pdf = await makePdf(testInfo.outputPath("lease-es.pdf"), SPANISH);
    await openViewer(page, pdf);
    await openReadAloud(page);
    await expect(page.getByText("Detected Spanish")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Pause", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Collapse to mini player" }).click();
    await expect(page.locator(".read-aloud-mini")).toBeVisible();
    await shot(page, "14_mini_player_dark");
  });

  test("15 read mode dark", async ({ page }, testInfo) => {
    await useDarkMode(page);
    await stubSpeech(page);
    const pdf = await makePdf(testInfo.outputPath("lease-es.pdf"), SPANISH);
    await openViewer(page, pdf);
    await openReadAloud(page);
    await expect(page.getByText("Detected Spanish")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Read mode", exact: true }).click();
    await expect(page.locator(".read-aloud-mini")).toBeVisible();
    await expect(page.getByText("PDF Library")).toBeHidden({ timeout: 5_000 });
    await shot(page, "15_read_mode_dark");
  });
});
