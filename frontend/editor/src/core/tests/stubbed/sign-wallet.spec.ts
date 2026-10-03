import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import type { Page, Route } from "@playwright/test";
import path from "path";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
const STORAGE_KEY = "stirling:saved-signatures:v1";
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function useBrowserStorage(page: Page) {
  await page.route("**/api/v1/proprietary/signatures**", (route: Route) =>
    route.fulfill({ status: 404, json: {} }),
  );
}

async function seedBrowserSignature(
  page: Page,
  label: string,
  { isDefault = false } = {},
) {
  await page.addInitScript(
    ({ key, png, label, isDefault }) => {
      const signature = {
        id: "sig-seeded",
        type: "image",
        label,
        scope: "localStorage",
        dataUrl: png,
        createdAt: 1,
        updatedAt: 1,
      };
      localStorage.setItem(key, JSON.stringify([signature]));
      if (isDefault) {
        localStorage.setItem(
          "stirling:sign:default-signature-id",
          signature.id,
        );
      }
    },
    { key: STORAGE_KEY, png: PNG, label, isDefault },
  );
}

async function openSign(page: Page) {
  await page.goto("/sign");
  await uploadFiles(page, SAMPLE_PDF);
  await page.goto("/sign");
  await expect(page.getByTestId("signature-wallet")).toBeVisible({
    timeout: 20_000,
  });
}

async function startFromIntro(page: Page, method: "Draw" | "Type") {
  await page
    .getByTestId("signature-wallet-intro")
    .getByRole("button", { name: method })
    .click();
}

async function createTypedSignature(page: Page, name: string) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByText("Type", { exact: true }).click();
  await page.getByTestId("signature-type-name").fill(name);
}

test.describe("Sign tool signature wallet", () => {
  test("first run: type, save, place and apply a signature", async ({
    page,
  }) => {
    await useBrowserStorage(page);
    await openSign(page);

    await expect(page.getByTestId("signature-wallet-intro")).toBeVisible();
    await expect(page.getByTestId("apply-signatures")).toBeDisabled();

    await startFromIntro(page, "Type");
    await createTypedSignature(page, "Jordan Ellis");
    await page.getByTestId("use-signature").click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await expect(page.getByTestId("signature-tile")).toHaveCount(2);
    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "[]"),
      STORAGE_KEY,
    );
    expect(stored.map((sig: { label: string }) => sig.label).sort()).toEqual([
      "Initials",
      "Typed signature",
    ]);

    const status = page.getByTestId("placement-status");
    await expect(status).toContainText("Click the page");
    await expect(status).toContainText("Typed signature");

    const pdfPage = page.locator("[data-page-index]").first();
    await expect(pdfPage).toBeVisible();
    const box = await pdfPage.boundingBox();
    if (!box) throw new Error("PDF page has no bounding box");
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.7);
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.75);

    await expect(page.getByTestId("placed-signatures")).toContainText(
      "On this document (1)",
    );
    await expect(page.getByTestId("apply-signatures")).toHaveText(
      "Apply 1 signature",
    );
    await expect(page.getByTestId("apply-signatures")).toBeEnabled();

    await page.getByTestId("apply-signatures").click();
    await expect(page.getByTestId("apply-signatures")).toBeDisabled();
    await expect(status).toContainText("Pick a signature");
    await expect(page.getByTestId("placed-signatures")).toContainText(
      "On this document (0)",
    );
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.75);
    await expect(page.getByTestId("placed-signatures")).toContainText(
      "On this document (0)",
    );
    await page
      .getByRole("button", { name: "Back to all tools", exact: true })
      .click();
    await expect(page.getByTestId("signature-wallet")).not.toBeVisible();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("finishing a drawing outside the modal keeps the signature", async ({
    page,
  }) => {
    await useBrowserStorage(page);
    await openSign(page);
    await startFromIntro(page, "Draw");
    const pad = page.getByTestId("signature-draw-pad");
    const box = await pad.boundingBox();
    if (!box) throw new Error("Signature pad has no bounding box");
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 120, { steps: 10 });
    await page.mouse.move(5, 5, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("use-signature")).toBeEnabled();
    await page.getByTestId("use-signature").click();
    await expect(page.getByTestId("signature-tile")).toHaveCount(1);
  });

  test("resizing the drawing modal preserves strokes near its right edge", async ({
    page,
  }) => {
    await useBrowserStorage(page);
    await openSign(page);
    await startFromIntro(page, "Draw");
    const box = await page.getByTestId("signature-draw-pad").boundingBox();
    if (!box) throw new Error("Signature pad has no bounding box");
    await page.mouse.move(box.x + box.width * 0.8, box.y + 80);
    await page.mouse.down();
    for (let step = 1; step <= 12; step++) {
      await page.mouse.move(
        box.x + box.width * (0.8 + (0.15 * step) / 12),
        box.y + 80 + (50 * step) / 12,
      );
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.getByTestId("signature-draw-pad").evaluate((canvas) => {
      canvas.style.width = "50%";
    });
    await expect
      .poll(
        async () =>
          (await page.getByTestId("signature-draw-pad").boundingBox())?.width,
      )
      .toBeLessThan(box.width * 0.6);
    await page.getByTestId("use-signature").click();
    await expect(page.getByTestId("signature-tile")).toHaveCount(1);
    const dimensions = await page.evaluate(async (key) => {
      const [signature] = JSON.parse(localStorage.getItem(key) ?? "[]");
      const image = new Image();
      image.src = signature.dataUrl;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, STORAGE_KEY);
    expect(dimensions.width).toBeGreaterThan(20);
    expect(dimensions.width).toBeLessThan(250);
    expect(dimensions.height).toBeLessThan(200);
  });

  test("blank paper cannot be saved as an invisible signature", async ({
    page,
  }) => {
    await useBrowserStorage(page);
    await openSign(page);
    await startFromIntro(page, "Draw");
    await page.getByRole("dialog").getByText("Upload", { exact: true }).click();
    const image = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "white";
      context.fillRect(0, 0, 100, 100);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await page
      .getByRole("dialog")
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "blank.png",
        mimeType: "image/png",
        buffer: Buffer.from(image, "base64"),
      });
    await expect(page.getByRole("alert")).toContainText(
      "Could not read that image",
    );
    await expect(page.getByTestId("use-signature")).toBeDisabled();
  });

  test("leaving Sign with unapplied signatures warns and can be cancelled", async ({
    page,
  }) => {
    await useBrowserStorage(page);
    await seedBrowserSignature(page, "My signature");
    await openSign(page);
    await page
      .getByRole("button", { name: "My signature", exact: true })
      .click();
    const pdfPage = page.locator("[data-page-index]").first();
    const box = await pdfPage.boundingBox();
    if (!box) throw new Error("PDF page has no bounding box");
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.75);
    await expect(page.getByTestId("apply-signatures")).toBeEnabled();
    await page
      .getByRole("button", { name: "Back to all tools", exact: true })
      .click();
    await expect(page.getByTestId("unsaved-discard")).toBeVisible();
    await page
      .getByRole("button", { name: "Keep Working", exact: true })
      .click();
    await expect(page.getByTestId("signature-wallet")).toBeVisible();
    await expect(page.getByTestId("apply-signatures")).toBeEnabled();
    await page
      .getByRole("button", { name: "Back to all tools", exact: true })
      .click();
    await page.getByTestId("unsaved-discard").click();
    await expect(page.getByTestId("signature-wallet")).toBeHidden();
  });

  test("deleting the last saved signature preserves document controls", async ({
    page,
  }) => {
    await useBrowserStorage(page);
    await seedBrowserSignature(page, "My signature");
    await openSign(page);
    await page
      .getByRole("button", { name: "My signature", exact: true })
      .click();
    const box = await page.locator("[data-page-index]").first().boundingBox();
    if (!box) throw new Error("PDF page has no bounding box");
    await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.75);
    await expect(page.getByTestId("apply-signatures")).toBeEnabled();
    await page
      .getByRole("button", { name: "Options for My signature" })
      .click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(page.getByTestId("signature-wallet-intro")).toBeVisible();
    await expect(page.getByTestId("placed-signatures")).toContainText(
      "On this document (1)",
    );
    await page
      .getByRole("button", { name: "Remove Signature", exact: true })
      .click();
    await expect(page.getByTestId("apply-signatures")).toBeDisabled();
  });

  test("saved default signature is ready to place on open", async ({
    page,
  }) => {
    await useBrowserStorage(page);
    await seedBrowserSignature(page, "Company seal", { isDefault: true });
    await openSign(page);

    await expect(page.getByTestId("placement-status")).toContainText(
      "Company seal",
    );
    await expect(
      page.getByRole("button", { name: "Company seal", pressed: true }),
    ).toBeVisible();
  });

  test("Escape closes a dialog or menu without stopping placement", async ({
    page,
  }) => {
    await useBrowserStorage(page);
    await seedBrowserSignature(page, "Company seal");
    await openSign(page);

    const status = page.getByTestId("placement-status");
    await page
      .getByRole("button", { name: "Company seal", exact: true })
      .click();
    await expect(status).toContainText("Company seal");

    await page.getByTestId("new-signature-tile").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(status).toContainText("Company seal");

    await page
      .getByRole("button", { name: "Options for Company seal" })
      .click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(status).toContainText("Company seal");

    await page
      .getByRole("button", { name: "Company seal", exact: true })
      .focus();
    await page.keyboard.press("Escape");
    await expect(status).toContainText("Pick a signature");
  });

  test("an unsaved signature does not reuse a saved one's name", async ({
    page,
  }) => {
    await useBrowserStorage(page);
    await seedBrowserSignature(page, "Typed signature");
    await openSign(page);

    await page.getByTestId("new-signature-tile").click();
    await createTypedSignature(page, "Jordan Ellis");
    await page.getByText("Save to my signatures", { exact: true }).click();
    await page.getByTestId("use-signature").click();

    await expect(page.getByTestId("placement-status")).toContainText(
      "place Typed signature 2.",
    );
  });

  test("a camera photo is shrunk and trimmed before it is saved", async ({
    page,
  }) => {
    await useBrowserStorage(page);
    await openSign(page);
    const photo = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 4000;
      canvas.height = 3000;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#f4f1ea";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#1a1a60";
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.moveTo(800, 1500);
      for (let i = 0; i < 50; i++) {
        ctx.lineTo(800 + i * 48, 1500 + Math.sin(i / 3) * 250);
      }
      ctx.stroke();
      return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    });

    await startFromIntro(page, "Draw");
    await page.getByRole("dialog").getByText("Upload", { exact: true }).click();
    await page
      .getByRole("dialog")
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "photo.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from(photo, "base64"),
      });
    await expect(page.getByText("Remove background")).toBeVisible();
    await page.getByTestId("use-signature").click();
    await expect(page.getByRole("dialog")).toBeHidden();

    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "[]")[0]?.dataUrl,
      STORAGE_KEY,
    );
    const size = await page.evaluate(async (src: string) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight };
    }, saved);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(1200);
    expect(size.width / size.height).toBeGreaterThan(3);
  });

  test.describe("server storage", () => {
    test.use({ stubOptions: { isAdmin: true } });

    test("an admin can share a new signature with everyone", async ({
      page,
    }) => {
      const posted: Array<Record<string, unknown>> = [];
      await page.route("**/api/v1/proprietary/signatures**", (route: Route) => {
        const request = route.request();
        if (request.method() === "POST") {
          posted.push(request.postDataJSON());
          return route.fulfill({ json: {} });
        }
        return route.fulfill({ json: [] });
      });
      await openSign(page);

      await startFromIntro(page, "Type");
      await createTypedSignature(page, "Finance Team");
      const dialog = page.getByRole("dialog");
      await dialog.getByText("Also save my initials").click();
      await dialog.getByRole("textbox", { name: "Who can use it" }).click();
      await page.getByRole("option", { name: "Everyone" }).click();
      await page.getByTestId("use-signature").click();
      await expect(dialog).toBeHidden();

      expect(posted).toHaveLength(1);
      expect(posted[0]).toMatchObject({ scope: "shared", type: "text" });
      await expect(page.getByText("Shared", { exact: true })).toBeVisible();
    });
  });

  test.describe("server storage with shared signatures", () => {
    test("shared signatures do not count toward your own limit", async ({
      page,
    }) => {
      const shared = Array.from({ length: 3 }, (_, i) => ({
        id: `shared-${i}`,
        type: "image",
        label: `Team seal ${i + 1}`,
        scope: "shared",
        dataUrl: PNG,
        createdAt: i,
        updatedAt: i,
      }));
      const mine = {
        ...shared[0],
        id: "mine-1",
        label: "Mine",
        scope: "personal",
      };
      await page.route("**/api/v1/proprietary/signatures**", (route: Route) =>
        route.fulfill({ json: [mine, ...shared] }),
      );
      await openSign(page);

      await expect(page.getByText("1 of 20")).toBeVisible();
      await expect(page.getByTestId("signature-tile")).toHaveCount(4);
    });
  });

  test.describe("server storage without admin rights", () => {
    test("sharing is not offered", async ({ page }) => {
      await page.route("**/api/v1/proprietary/signatures**", (route: Route) =>
        route.fulfill({ json: [] }),
      );
      await openSign(page);

      await startFromIntro(page, "Draw");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("Save to my signatures")).toBeVisible();
      await expect(dialog.getByText("Who can use it")).toHaveCount(0);
    });
  });
});
