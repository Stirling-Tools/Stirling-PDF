import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument, PDFName } from "@cantoo/pdf-lib";
import { test as base, expect } from "@editor/tests/helpers/stub-test-base";

const test = base.extend({
  page: async ({ page }, use) => {
    const inspectionUploads: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/inspect-pdf-security"))
        inspectionUploads.push(request.url());
    });
    await use(page);
    expect(inspectionUploads, "PDF access must be inspected locally").toEqual(
      [],
    );
  },
});

const links = path.join(
  import.meta.dirname,
  "../test-fixtures/link-annotations-sample.pdf",
);

test("removing a password keeps the result after switching tools", async ({
  page,
}) => {
  const output = await readFile(links);
  let finish!: () => void;
  const responseReady = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let requested = false;
  await page.route("**/api/v1/security/remove-password", async (route) => {
    requested = true;
    await responseReady;
    await route.fulfill({ contentType: "application/pdf", body: output });
  });
  await page.goto("/remove-password");
  await page
    .getByTestId("file-input")
    .setInputFiles(
      path.join(
        import.meta.dirname,
        "../test-fixtures/owner-only-restricted.pdf",
      ),
    );
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage.locator("img").first()).toBeVisible();
  await firstPage.evaluate((node) =>
    node.setAttribute("data-before-tool", "true"),
  );
  await page
    .getByLabel("Permissions password", { exact: true })
    .fill("owner-test-password");
  await page
    .getByRole("button", { name: "Remove Password", exact: true })
    .click();
  await expect.poll(() => requested).toBe(true);
  try {
    await page
      .getByRole("button", { name: "Annotations", exact: true })
      .click();
    await expect(page).toHaveURL(/\/annotate$/);
  } finally {
    finish();
  }
  await expect(firstPage).not.toHaveAttribute("data-before-tool", "true");
  await expect(firstPage.locator(".pdf-link-overlay")).toHaveCount(4);
  await page.getByRole("button", { name: "Square", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Square", exact: true }),
  ).toHaveAttribute("data-variant", "filled");
});

test("escaped encryption names still enforce permissions after admission", async ({
  page,
}) => {
  const original = await readFile(
    path.join(
      import.meta.dirname,
      "../test-fixtures/owner-only-restricted.pdf",
    ),
  );
  const bytes = Buffer.from(
    original.toString("latin1").replace("/Encrypt", "/En#63rypt"),
    "latin1",
  );
  expect(bytes.includes(Buffer.from("/Encrypt"))).toBe(false);
  await page.getByTestId("file-input").setInputFiles({
    name: "escaped.pdf",
    mimeType: "application/pdf",
    buffer: bytes,
  });
  await expect(page.locator('[data-page-index="0"] img').first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Protected PDF", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Printing", { exact: true })
      .locator(".."),
  ).toContainText("Restricted");
});

for (const operation of ["compress", "remove-password"] as const) {
  test(`drawing tools work immediately after ${operation} replaces the open PDF`, async ({
    page,
  }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    const output = await readFile(links);
    await page.route(
      operation === "compress"
        ? "**/api/v1/misc/compress-pdf"
        : "**/api/v1/security/remove-password",
      (route) => {
        return route.fulfill({
          contentType: "application/pdf",
          body: output,
          headers: {
            "content-disposition": 'attachment; filename="updated.pdf"',
          },
        });
      },
    );
    await page.goto(`/${operation}`);
    await page
      .getByTestId("file-input")
      .setInputFiles(
        operation === "compress"
          ? links
          : path.join(
              import.meta.dirname,
              "../test-fixtures/owner-only-restricted.pdf",
            ),
      );
    const firstPage = page.locator('[data-page-index="0"]').first();
    await expect(firstPage.locator("img").first()).toBeVisible();
    await firstPage.evaluate((node) =>
      node.setAttribute("data-before-tool", "true"),
    );
    if (operation === "remove-password")
      await page
        .getByLabel("Permissions password", { exact: true })
        .fill("owner-test-password");
    await page
      .getByRole("button", {
        name: operation === "compress" ? "Compress" : "Remove Password",
        exact: true,
      })
      .click();
    await expect(firstPage).not.toHaveAttribute("data-before-tool", "true");
    await expect(firstPage.locator(".pdf-link-overlay")).toHaveCount(4);
    await page
      .getByRole("button", { name: "Annotations", exact: true })
      .click();
    await expect(page).toHaveURL(/\/annotate$/);
    await page.getByRole("button", { name: "Polygon", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Polygon", exact: true }),
    ).toHaveAttribute("data-variant", "filled");
    await page.getByRole("button", { name: "Square", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Square", exact: true }),
    ).toHaveAttribute("data-variant", "filled");
    const bounds = await firstPage.boundingBox();
    if (!bounds) throw new Error("PDF page has no bounds");
    await page.mouse.move(
      bounds.x + bounds.width * 0.3,
      bounds.y + bounds.height * 0.3,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width * 0.5,
      bounds.y + bounds.height * 0.5,
      { steps: 5 },
    );
    await page.mouse.up();
    await expect(
      page.getByRole("button", { name: "Save Changes", exact: true }).first(),
    ).toBeEnabled();
    expect(browserErrors).toEqual([]);
  });
}

for (const role of ["reader", "owner", "unrestricted-reader"] as const) {
  test(`opens with ${role} locally and preserves the authentication role`, async ({
    page,
  }, testInfo) => {
    const pdf = await PDFDocument.load(await readFile(links));
    const unrestricted = role === "unrestricted-reader";
    pdf.encrypt({
      userPassword: "reader-test",
      ownerPassword: "owner-test",
      permissions: {
        copying: unrestricted,
        modifying: unrestricted,
        annotating: unrestricted,
        printing: unrestricted ? "highResolution" : false,
      },
    });
    const filename = testInfo.outputPath("protected.pdf");
    await writeFile(filename, await pdf.save());
    await page.getByTestId("file-input").setInputFiles(filename);
    const password = page.getByLabel("Password to open", { exact: true });
    await password.fill("incorrect-password");
    await page.getByRole("button", { name: "Open PDF", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Incorrect password" }),
    ).toBeVisible();
    await password.fill(role === "owner" ? "owner-test" : "reader-test");
    await page.getByRole("button", { name: "Open PDF", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.locator('[data-page-index="0"] img').first(),
    ).toBeVisible();
    await expect(
      page
        .getByText(
          role === "owner"
            ? "Permissions unlocked for this session"
            : "Protected PDF",
          { exact: true },
        )
        .first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Manage protection", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    if (role === "owner") {
      await expect(
        dialog.getByRole("button", {
          name: "Printing unlocked for this session",
          exact: true,
        }),
      ).toBeVisible();
    } else {
      await expect(
        dialog.getByText("Printing", { exact: true }).locator(".."),
      ).toContainText(unrestricted ? "Allowed" : "Restricted");
    }
  });
}

test("local opening applies the administrator policy without claiming owner authentication", async ({
  page,
}) => {
  await page.route("**/api/v1/config/app-config", (route) =>
    route.fulfill({
      json: {
        enableLogin: false,
        enableAnalytics: false,
        languages: ["en-US"],
        defaultLocale: "en-US",
        honorOwnerPasswords: false,
      },
    }),
  );
  await page.goto("/editor");
  await page
    .getByTestId("file-input")
    .setInputFiles(
      path.join(
        import.meta.dirname,
        "../test-fixtures/owner-only-restricted.pdf",
      ),
    );
  await expect(
    page.getByText("Protected PDF", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("button", {
      name: "Printing restriction ignored",
      exact: true,
    }),
  ).toBeVisible();
});

test("repeated annotation saves remain editable", async ({ page }) => {
  await page.goto("/annotate");
  await page.locator('input[type="file"]').first().setInputFiles(links);
  const firstPage = page.locator('[data-page-index="0"]').first();
  const overlays = firstPage.locator(".pdf-link-overlay");
  await expect(overlays).toHaveCount(4);
  await firstPage.evaluate((node) =>
    node.setAttribute("data-permission-test", "original"),
  );
  for (const remaining of [3, 2]) {
    await overlays.first().click();
    const menu = page.locator("[data-annotation-selection-menu]").first();
    await expect(menu).toBeVisible();
    await menu.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(overlays).toHaveCount(remaining);
    const save = page
      .getByRole("button", { name: "Save Changes", exact: true })
      .first();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(save).toBeDisabled();
    await expect(firstPage).toHaveAttribute("data-permission-test", "original");
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }).first(),
    ).toBeEnabled();
  }
  await overlays.first().click();
  await expect(
    page.locator("[data-annotation-selection-menu]").first(),
  ).toBeVisible();
});

for (const protection of ["ordinary", "owner-only", "opening-password"]) {
  const encrypted = protection !== "ordinary";
  const password = protection === "opening-password" ? "reader-test" : "";
  test(`PDF above 100 MiB establishes ${protection} access before interaction`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(180_000);
    const pdf = await PDFDocument.load(await readFile(links));
    const payload = pdf.context.register(
      pdf.context.stream(new Uint8Array(105 * 1024 ** 2)),
    );
    pdf.catalog.set(PDFName.of("BenchmarkPayload"), payload);
    if (encrypted)
      pdf.encrypt({
        userPassword: password,
        ownerPassword: "owner-test",
        permissions: {
          copying: false,
          modifying: false,
          annotating: false,
          printing: false,
        },
      });
    const filename = testInfo.outputPath("large.pdf");
    await writeFile(filename, await pdf.save({ useObjectStreams: false }));
    await page.locator('input[type="file"]').first().setInputFiles(filename);
    if (password) {
      await page.getByLabel("Password to open", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Open PDF", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    const link = page.locator('.pdf-link-overlay[href^="https:"]').first();
    await expect(link).toBeVisible({ timeout: 90_000 });
    await link.hover();
    const toolbar = page.locator(".pdf-link-toolbar");
    await expect(toolbar).toBeVisible();
    if (encrypted)
      await expect(
        toolbar.locator(".pdf-link-toolbar-btn--delete"),
      ).toHaveCount(0);
    else
      await expect(
        toolbar.locator(".pdf-link-toolbar-btn--delete"),
      ).toBeVisible();
    const href = await link.getAttribute("href");
    if (!href) throw new Error("Fixture has no external link");
    await context.route(href, (route) =>
      route.fulfill({ body: "Link destination" }),
    );
    const popup = page.waitForEvent("popup");
    await toolbar.locator(".pdf-link-toolbar-btn--go").click();
    await expect(await popup).toHaveURL(href);
  });
}
