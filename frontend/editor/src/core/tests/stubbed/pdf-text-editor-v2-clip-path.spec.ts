import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Transforming an object without its clip path leaves the clip behind, so
// moved clipped content gets sliced by a stale rectangle.
test.describe("PDF text editor v2 - clip paths follow their object", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(
        path.join(import.meta.dirname, "../test-fixtures/sample.pdf"),
      );
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(800);
  });

  test("a run move transforms the clip path by the same matrix", async ({
    page,
  }) => {
    const calls = await page.evaluate(async () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const w = window as any;
      const s = w.__v2_editor_store;
      const doc = s.doc ?? s.document;
      const m = doc.module;

      const seen: Array<{ kind: string; args: number[] }> = [];
      const realObj = m.FPDFPageObj_Transform.bind(m);
      const realClip = m.FPDFPageObj_TransformClipPath.bind(m);
      m.FPDFPageObj_Transform = (...args: number[]) => {
        seen.push({ kind: "object", args: args.slice(1) });
        return realObj(...args);
      };
      m.FPDFPageObj_TransformClipPath = (...args: number[]) => {
        seen.push({ kind: "clip", args: args.slice(1) });
        return realClip(...args);
      };

      const run = doc.page(0).runs[0];
      const mod = await import(
        /* @vite-ignore */ String(
          "/src/core/tools/pdfTextEditor/v2/commands/MoveTextRunCommand.ts",
        )
      );
      s.dispatch(
        new mod.MoveTextRunCommand({
          pageIndex: 0,
          runId: run.id,
          dx: 17,
          dy: -9,
        }),
      );

      m.FPDFPageObj_Transform = realObj;
      m.FPDFPageObj_TransformClipPath = realClip;
      return seen;
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    const objectCalls = calls.filter((c) => c.kind === "object");
    const clipCalls = calls.filter((c) => c.kind === "clip");
    expect(objectCalls.length).toBeGreaterThan(0);
    // One clip transform per object transform, with an identical matrix.
    expect(clipCalls.length).toBe(objectCalls.length);
    expect(clipCalls.map((c) => c.args)).toEqual(
      objectCalls.map((c) => c.args),
    );
    expect(objectCalls[0].args).toEqual([1, 0, 0, 1, 17, -9]);
  });

  test("undoing the move transforms the clip back", async ({ page }) => {
    const clipArgs = await page.evaluate(async () => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const w = window as any;
      const s = w.__v2_editor_store;
      const doc = s.doc ?? s.document;
      const m = doc.module;
      const seen: number[][] = [];
      const realClip = m.FPDFPageObj_TransformClipPath.bind(m);
      m.FPDFPageObj_TransformClipPath = (...args: number[]) => {
        seen.push(args.slice(1));
        return realClip(...args);
      };

      const run = doc.page(0).runs[0];
      const mod = await import(
        /* @vite-ignore */ String(
          "/src/core/tools/pdfTextEditor/v2/commands/MoveTextRunCommand.ts",
        )
      );
      s.dispatch(
        new mod.MoveTextRunCommand({
          pageIndex: 0,
          runId: run.id,
          dx: 12,
          dy: 4,
        }),
      );
      s.undo();
      m.FPDFPageObj_TransformClipPath = realClip;
      return seen;
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    expect(clipArgs.length).toBe(2);
    expect(clipArgs[0]).toEqual([1, 0, 0, 1, 12, 4]);
    expect(clipArgs[1]).toEqual([1, 0, 0, 1, -12, -4]);
  });
});
