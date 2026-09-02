import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Transforming an object without its clip path leaves the clip behind, so
// moved clipped content gets sliced by a stale rectangle. Driven through the
// real Ctrl+drag gesture and the exposed store: CI serves a production build,
// where importing a `/src/...` module by path does not resolve.
test.describe("PDF text editor - clip paths follow their object", () => {
  test("a run move transforms the clip path by the same matrix, and undo reverses both", async ({
    page,
  }) => {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
      timeout: 30_000,
    });
    await page
      .locator('[data-testid="pdf-editor-file-input"]')
      .setInputFiles(
        path.join(import.meta.dirname, "../test-fixtures/sample.pdf"),
      );
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(800);

    // Record every object transform and every clip transform, in order.
    await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const w = window as any;
      const m = (w.__editor_store.doc ?? w.__editor_store.document).module;
      w.__clipProbe = [] as Array<{ kind: string; args: number[] }>;
      const realObj = m.FPDFPageObj_Transform.bind(m);
      const realClip = m.FPDFPageObj_TransformClipPath.bind(m);
      m.FPDFPageObj_Transform = (...args: number[]) => {
        w.__clipProbe.push({ kind: "object", args: args.slice(1) });
        return realObj(...args);
      };
      m.FPDFPageObj_TransformClipPath = (...args: number[]) => {
        w.__clipProbe.push({ kind: "clip", args: args.slice(1) });
        return realClip(...args);
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    const run = page.locator('[data-testid^="pdf-editor-run-p0-"]').first();
    await expect(run).toBeVisible({ timeout: 30_000 });
    const box = await run.boundingBox();
    if (!box) throw new Error("text run has no bounding box");

    await page.keyboard.down("Control");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 60,
      box.y + box.height / 2 + 20,
      { steps: 5 },
    );
    await page.mouse.up();
    await page.keyboard.up("Control");
    await expect(page.getByTestId("pdf-editor-undo")).toBeEnabled({
      timeout: 10_000,
    });

    const read = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __clipProbe: Array<{ kind: string; args: number[] }>;
            }
          ).__clipProbe,
      );

    const afterMove = await read();
    const objMoves = afterMove.filter((c) => c.kind === "object");
    const clipMoves = afterMove.filter((c) => c.kind === "clip");
    expect(objMoves.length).toBeGreaterThan(0);
    // One clip transform per object transform, with an identical matrix.
    expect(clipMoves.length).toBe(objMoves.length);
    expect(clipMoves.map((c) => c.args)).toEqual(objMoves.map((c) => c.args));
    // The gesture really translated something.
    expect(
      Math.abs(objMoves[0].args[4]) + Math.abs(objMoves[0].args[5]),
    ).toBeGreaterThan(0);

    await page.keyboard.press("Control+z");
    await expect
      .poll(
        async () => (await read()).filter((c) => c.kind === "object").length,
        {
          timeout: 10_000,
        },
      )
      .toBeGreaterThan(objMoves.length);

    const afterUndo = await read();
    const objAll = afterUndo.filter((c) => c.kind === "object");
    const clipAll = afterUndo.filter((c) => c.kind === "clip");
    expect(clipAll.length).toBe(objAll.length);
    expect(clipAll.map((c) => c.args)).toEqual(objAll.map((c) => c.args));
    // Undo puts the object back, so its translation is the negation.
    const undone = objAll[objAll.length - 1].args;
    expect(undone[4]).toBeCloseTo(-objMoves[0].args[4], 5);
    expect(undone[5]).toBeCloseTo(-objMoves[0].args[5], 5);
  });
});
