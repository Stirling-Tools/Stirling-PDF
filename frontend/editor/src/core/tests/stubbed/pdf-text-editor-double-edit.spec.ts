import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Editing a document twice is not the same as editing it once. The second edit
// starts from a REGENERATED page, so anything the generator dropped or reshaped
// on the first save is what the second edit builds on. These pin that a second
// round-trip is as safe as the first, on the page shapes most likely to suffer:
// a shading-backed page, a page whose /Contents is an array split mid-operator,
// a form XObject page, and an ordinary paragraph page.
const CASES: Array<{ name: string; file: string; needle: string }> = [
  {
    name: "shading page keeps its artwork",
    file: "shading-sample.pdf",
    needle: "Text over a gradient",
  },
  {
    name: "split /Contents array survives",
    file: "split-contents-sample.pdf",
    needle: "Split contents line",
  },
  {
    name: "form xobject page survives",
    file: "form-xobject-sample.pdf",
    needle: "",
  },
  { name: "paragraph page survives", file: "paragraph-sample.pdf", needle: "" },
];

const PAGE_TEXT = () =>
  (
    window as unknown as {
      __editor_store: {
        state: { pages: { runs: { text: string }[] }[] };
      };
    }
  ).__editor_store.state.pages[0].runs
    .map((r) => r.text)
    .join("");

const FIRST_RUN = () => {
  const runs = (
    window as unknown as {
      __editor_store: {
        state: { pages: { runs: { id: string; text: string }[] }[] };
      };
    }
  ).__editor_store.state.pages[0].runs;
  const r = runs.find((x) => x.text.trim().length > 3) ?? runs[0];
  return r ? { id: r.id, text: r.text } : null;
};

/** Pixels that are neither near-white nor near-grey: the page's colour artwork. */
const COLOURED_PIXELS = () => {
  const canvas = document.querySelector<HTMLCanvasElement>(
    '[data-testid="pdf-editor-page-0"] canvas',
  );
  if (!canvas) return 0;
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const mx = Math.max(d[i], d[i + 1], d[i + 2]);
    const mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (mx - mn > 18) n += 1;
  }
  return n;
};

async function appendChar(
  page: import("@playwright/test").Page,
  runId: string,
  ch: string,
) {
  await page.evaluate(
    ({ id, ch }) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="pdf-editor-run-${id}"]`,
      );
      if (!el) throw new Error("run missing");
      el.focus();
      const sel = window.getSelection();
      if (!sel) throw new Error("no selection api");
      let node: Node = el;
      while (node.lastChild) node = node.lastChild;
      const range = document.createRange();
      if (node.nodeType === Node.TEXT_NODE) {
        range.setStart(node, (node.textContent ?? "").length);
      } else {
        range.selectNodeContents(el);
        range.collapse(false);
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, ch);
    },
    { id: runId, ch },
  );
  await page.waitForTimeout(450);
}

async function saveAndReopen(
  page: import("@playwright/test").Page,
  tag: string,
) {
  const downloaded = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByTestId("pdf-editor-download").click();
  const confirm = page.getByTestId("pdf-editor-save-risk-confirm");
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  const saved = `test-results/double-edit-${tag}.pdf`;
  await (await downloaded).saveAs(saved);
  await page.evaluate(() => {
    const w = window as unknown as {
      __editor_store?: { document: unknown };
      __prev_document?: unknown;
    };
    w.__prev_document = w.__editor_store?.document;
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(saved);
  await page.waitForFunction(
    () => {
      const w = window as unknown as {
        __editor_store?: {
          document: unknown;
          state: { pages: { runs: unknown[] }[] };
        };
        __prev_document?: unknown;
      };
      const s = w.__editor_store;
      if (!s?.document || s.document === w.__prev_document) return false;
      return (s.state.pages[0]?.runs.length ?? 0) > 0;
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1200);
}

const strip = (s: string) => s.replace(/\s+/g, "");

test.describe("PDF text editor - a second edit is as safe as the first", () => {
  for (const c of CASES) {
    test(c.name, async ({ page }) => {
      test.setTimeout(240_000);
      await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
        timeout: 15_000,
      });
      await page
        .locator('[data-testid="pdf-editor-file-input"]')
        .setInputFiles(
          path.join(import.meta.dirname, "../test-fixtures", c.file),
        );
      await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
        timeout: 30_000,
      });
      await page.waitForTimeout(1800);

      const loadedColour = (await page.evaluate(COLOURED_PIXELS)) as number;

      for (const pass of [1, 2]) {
        const run = (await page.evaluate(FIRST_RUN)) as {
          id: string;
          text: string;
        } | null;
        expect(
          run,
          `${c.name}: no editable run before pass ${pass}`,
        ).not.toBeNull();

        await appendChar(page, run!.id, String(pass));
        const beforeSave = (await page.evaluate(PAGE_TEXT)) as string;
        await saveAndReopen(page, `${c.name.replace(/\W+/g, "-")}-${pass}`);
        const afterReopen = (await page.evaluate(PAGE_TEXT)) as string;

        expect(
          strip(afterReopen).length,
          `${c.name}: pass ${pass} lost text across save+reopen`,
        ).toBe(strip(beforeSave).length);

        if (c.needle) {
          expect(
            afterReopen,
            `${c.name}: pass ${pass} lost the original words`,
          ).toContain(c.needle);
        }

        // Colour artwork (a gradient, a pattern) must not drain away. The
        // second pass is the one that historically loses a background.
        if (loadedColour > 1000) {
          const now = (await page.evaluate(COLOURED_PIXELS)) as number;
          expect(
            now / loadedColour,
            `${c.name}: pass ${pass} lost the page's colour artwork`,
          ).toBeGreaterThan(0.9);
        }
      }
    });
  }
});
