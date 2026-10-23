/**
 * Backend-free coverage for session unlocks and cached preview privacy.
 * PDFium authenticates real encrypted fixtures; server processing is stubbed.
 */

import { test, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import { createHash } from "node:crypto";
import { PDFDocument } from "@cantoo/pdf-lib";
import JSZip from "jszip";
import { mockAppApis } from "@editor/tests/helpers/api-stubs";
import { suppressNativeFilePicker } from "@editor/tests/helpers/ui-helpers";

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
const ENCRYPTED_PDF = path.join(FIXTURES_DIR, "encrypted.pdf");

async function uploadEncryptedFile(page: Page, filePath: string) {
  // `files-button`'s native picker is mocked globally
  // (suppressNativeFilePicker), so the click is safe cross-browser; set the
  // files on the hidden input directly.
  await page.getByTestId("files-button").click();
  await page.locator('[data-testid="file-input"]').setInputFiles(filePath);
}

const MODAL_TITLE = /^Open PDF/;
const PASSWORD_LABEL = "Password to open";
const UNLOCK_BUTTON_TEXT = /^Open PDF$/;

/**
 * Fill the password field and wait until the modal has registered it: the
 * unlock button is disabled while the password is empty, so its becoming enabled
 * proves the value landed in state. Retried because on WebKit the modal can
 * remount mid open-transition and drop a one-shot fill, leaving it disabled.
 */
async function fillPassword(page: Page, password: string): Promise<void> {
  const field = page.getByLabel(PASSWORD_LABEL, { exact: true });
  const unlock = page.getByRole("button", { name: UNLOCK_BUTTON_TEXT });
  await expect(async () => {
    await field.fill(password);
    await expect(unlock).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

test.describe.configure({ mode: "serial" });

test.describe("Encrypted PDF Unlock Modal", () => {
  test.beforeEach(async ({ page }) => {
    // Raw @playwright/test fixture: install the picker suppression directly so
    // the files-button click is intercepted cross-browser (firefox/webkit
    // otherwise leak the native dialog onto the host and close the page).
    suppressNativeFilePicker(page);
    await mockAppApis(page);

    await page.goto("/?bypassOnboarding=true");
    await page.waitForSelector('[data-testid="files-button"]', {
      timeout: 10000,
    });
    const tooltip = page.locator('button:has-text("Close tooltip")');
    if (await tooltip.isVisible({ timeout: 1000 }).catch(() => false)) {
      await tooltip.click();
    }
  });

  test("Viewer Download preserves the original encrypted PDF", async ({
    page,
  }, testInfo) => {
    const source = path.join(FIXTURES_DIR, "encrypted-ten-pages.pdf");

    await uploadEncryptedFile(page, source);
    await fillPassword(page, "james");
    await page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator('[data-page-index="0"] img').first()).toBeVisible(
      { timeout: 30_000 },
    );

    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: /download|export/i })
      .first()
      .click();
    const download = await downloadPromise;
    const destination = testInfo.outputPath("protected-viewer-download.pdf");
    await download.saveAs(destination);
    expect(download.suggestedFilename()).toBe("encrypted-ten-pages.pdf");
    expect(fs.readFileSync(destination)).toEqual(fs.readFileSync(source));
  });

  test("Split keeps ten protected results in a downloadable ZIP", async ({
    page,
  }, testInfo) => {
    const plain = await PDFDocument.create();
    for (let index = 0; index < 10; index++) plain.addPage([300, 400]);
    const workingPdf = Buffer.from(await plain.save());
    const singlePage = await PDFDocument.create();
    singlePage.addPage([300, 400]);
    const splitPage = await singlePage.save();
    singlePage.encrypt({ userPassword: "james", ownerPassword: "james" });
    const protectedPage = Buffer.from(await singlePage.save());
    const zip = new JSZip();
    for (let index = 1; index <= 10; index++)
      zip.file(`page-${index}.pdf`, splitPage);
    const splitZip = await zip.generateAsync({ type: "nodebuffer" });
    const restoredNames: string[] = [];

    await page.route("**/api/v1/security/prepare-pdf-session", (route) =>
      route.fulfill({ contentType: "application/pdf", body: workingPdf }),
    );
    await page.route(
      "**/api/v1/general/split-by-size-or-count",
      async (route) => {
        const request = new Request(route.request().url(), {
          method: "POST",
          headers: route.request().headers(),
          body: new Uint8Array(route.request().postDataBuffer()!),
        });
        const form = await request.formData();
        expect(form.get("splitType")).toBe("1");
        expect(form.get("splitValue")).toBe("1");
        await route.fulfill({ contentType: "application/zip", body: splitZip });
      },
    );
    await page.route(
      "**/api/v1/security/restore-pdf-protection",
      async (route) => {
        const request = new Request(route.request().url(), {
          method: "POST",
          headers: route.request().headers(),
          body: new Uint8Array(route.request().postDataBuffer()!),
        });
        const form = await request.formData();
        expect(form.get("password")).toBe("james");
        const source = form.get("sourceFile") as File;
        expect(source.name).toBe("encrypted-ten-pages.pdf");
        restoredNames.push((form.get("fileInput") as File).name);
        await route.fulfill({
          contentType: "application/pdf",
          body: protectedPage,
        });
      },
    );
    await page.goto("/split?bypassOnboarding=true");
    await uploadEncryptedFile(
      page,
      path.join(FIXTURES_DIR, "encrypted-ten-pages.pdf"),
    );
    await fillPassword(page, "james");
    await page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page
      .getByText(/Page Count/i)
      .first()
      .click();
    await page.getByPlaceholder("e.g. 5, 10").fill("1");
    await page.getByRole("button", { name: "Split", exact: true }).click();
    await expect.poll(() => restoredNames.length).toBe(10);
    await page
      .locator("label")
      .filter({ hasText: /^Active Files$/ })
      .click();
    await expect(
      page.getByText("result.zip", { exact: true }).first(),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: /download|export/i })
      .first()
      .click();
    const download = await downloadPromise;
    const destination = testInfo.outputPath("protected-split.zip");
    await download.saveAs(destination);
    const downloadedZip = await JSZip.loadAsync(fs.readFileSync(destination));
    const entries = Object.values(downloadedZip.files).filter(
      (entry) => !entry.dir,
    );
    expect(entries).toHaveLength(10);
    expect(entries.map((entry) => entry.name).sort()).toEqual(
      restoredNames.sort(),
    );
    for (const entry of entries) {
      const bytes = await entry.async("nodebuffer");
      expect(bytes).toEqual(protectedPage);
      await expect(PDFDocument.load(bytes)).rejects.toThrow(/encrypted/i);
      const document = await PDFDocument.load(bytes, { password: "james" });
      expect(document.getPageCount()).toBe(1);
    }
  });

  test("modal renders with title, password input, and action buttons", async ({
    page,
  }) => {
    await uploadEncryptedFile(page, ENCRYPTED_PDF);

    await expect(page.getByRole("heading", { name: MODAL_TITLE })).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByLabel(PASSWORD_LABEL, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "More options", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }),
    ).toBeDisabled();
    await expect(
      page.getByText("Create an unprotected copy", { exact: true }),
    ).toHaveCount(0);
    const details = page.getByRole("button", {
      name: "About session unlocking",
    });
    await details.focus();
    await expect(page.getByRole("tooltip")).toHaveText(
      "Open for this session. The PDF stays protected.",
    );
    await page.getByLabel(PASSWORD_LABEL, { exact: true }).focus();
    await expect(page.getByRole("tooltip")).toBeHidden();
  });

  test("explicit removal of all protection creates a usable copy and retains the protected source", async ({
    page,
  }) => {
    const sample = fs.readFileSync(path.join(FIXTURES_DIR, "sample.pdf"));
    let removals = 0;
    await page.route("**/api/v1/security/remove-password", (route) => {
      removals++;
      expect(route.request().postData()).toContain('name="removeAll"');
      return route.fulfill({ contentType: "application/pdf", body: sample });
    });

    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await fillPassword(page, "testpass123");
    await page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }).click();
    await page
      .getByRole("button", { name: "Manage protection", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create an unprotected copy", exact: true })
      .click();
    await expect(
      page.getByText(
        "The copy will have no passwords or restrictions. The original stays protected.",
      ),
    ).toBeVisible();
    expect(removals).toBe(0);
    await page
      .getByRole("button", { name: "Create an unprotected copy", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator('[data-page-index="0"] img').first()).toBeVisible(
      { timeout: 30_000 },
    );
    expect(removals).toBe(1);
    const stored = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("stirling-pdf-files");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const records = await new Promise<
        Array<{
          name: string;
          isEncrypted: boolean;
          data: Blob | ArrayBuffer;
        }>
      >((resolve, reject) => {
        const request = db
          .transaction("files", "readonly")
          .objectStore("files")
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return Promise.all(
        records.map(async (record) => {
          const bytes =
            record.data instanceof Blob
              ? await record.data.arrayBuffer()
              : record.data;
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          return {
            name: record.name,
            encrypted: record.isEncrypted,
            hash: Array.from(new Uint8Array(digest), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join(""),
          };
        }),
      );
    });
    expect(stored).toEqual(
      expect.arrayContaining([
        {
          name: "encrypted.pdf",
          encrypted: true,
          hash: createHash("sha256")
            .update(fs.readFileSync(ENCRYPTED_PDF))
            .digest("hex"),
        },
        {
          name: "encrypted_unprotected.pdf",
          encrypted: false,
          hash: createHash("sha256").update(sample).digest("hex"),
        },
      ]),
    );
  });

  test("successful unlock removes the modal and shows success alert", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const removalRequests: string[] = [];
    page.on("request", (request) => {
      if (
        /\/security\/remove-(password|pdf-protection|pdf-opening-password)/.test(
          request.url(),
        )
      )
        removalRequests.push(request.url());
    });

    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await expect(
      page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
    ).toBeVisible({ timeout: 10000 });

    await fillPassword(page, "testpass123");
    await page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }).click();

    await expect(
      page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
    ).toBeHidden({ timeout: 10000 });
    await expect(
      page
        .getByText("Permissions unlocked for this session", { exact: true })
        .first(),
    ).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
      timeout: 45000,
    });
    const renderedPage = page.locator('[data-page-index="0"] img').first();
    await expect(renderedPage).toBeVisible({ timeout: 15000 });
    await expect
      .poll(() =>
        renderedPage.evaluate(
          (element: HTMLImageElement) => element.naturalWidth,
        ),
      )
      .toBeGreaterThan(0);
    expect(removalRequests).toEqual([]);
    await page
      .locator("label")
      .filter({ hasText: /^Active Files$/ })
      .click();
    const unlockedIndicator = page
      .getByTestId("file-thumbnail")
      .getByRole("img", { name: "PDF opened", exact: true });
    await expect(unlockedIndicator).toBeVisible();
    await unlockedIndicator.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Protection retained.");
  });

  test("incorrect password keeps the modal open with an inline error", async ({
    page,
  }) => {
    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await expect(
      page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
    ).toBeVisible({ timeout: 10000 });

    await fillPassword(page, "wrongpassword");
    await page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }).click();

    await expect(page.getByText("Incorrect password")).toBeVisible({
      timeout: 5000,
    });
    await expect(
      page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
    ).toBeVisible();
  });

  test("unsupported tools show the protected file with details in a tooltip", async ({
    page,
  }) => {
    await page.route("**/api/v1/ui-data/ocr-pdf", (route) =>
      route.fulfill({ json: { languages: ["eng"] } }),
    );
    await page.goto("/ocr");

    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await fillPassword(page, "testpass123");
    await page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }).click();
    await expect(
      page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
    ).toBeHidden();
    const notice = page.getByTestId("tool-file-list");
    await expect(notice.getByRole("listitem")).toHaveText("encrypted.pdf");
    await expect(notice.getByText(/Add files to the workbench/)).toHaveCount(0);
    await notice
      .getByRole("button", { name: "Why encrypted.pdf is unavailable" })
      .hover();
    const details = page.getByRole("tooltip").filter({
      hasText:
        "This tool doesn't support encrypted PDFs. Remove the password first.",
    });
    await expect(details).toBeVisible();
    await notice.getByText("encrypted.pdf", { exact: true }).click();
    await expect(details).toBeHidden();
    const removePassword = notice.getByRole("button", {
      name: "Remove Password",
    });
    await removePassword.hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "Open Remove Password to choose which passwords to remove.",
    );
    await removePassword.click();
    await expect(page).toHaveURL(/\/remove-password$/);
    await expect(page.getByTestId("tool-file-list")).toContainText(
      "encrypted.pdf",
    );
    await expect(
      page.getByLabel("Password to open", { exact: true }),
    ).toBeVisible();
  });

  for (const legacy of [false, true]) {
    test(`cached protected previews stay hidden after reload${legacy ? " for legacy records" : ""}`, async ({
      page,
    }) => {
      await uploadEncryptedFile(page, ENCRYPTED_PDF);
      await expect(
        page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
      ).toBeVisible();
      await expect(page.locator('[data-page-index="0"]')).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Skip for now" }),
      ).toHaveCount(0);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
      ).toBeHidden();
      await expect
        .poll(() =>
          page.evaluate(async (legacyRecord) => {
            const db = await new Promise<IDBDatabase>((resolve, reject) => {
              const request = indexedDB.open("stirling-pdf-files");
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });
            const found = await new Promise<boolean>((resolve, reject) => {
              const transaction = db.transaction("files", "readwrite");
              const store = transaction.objectStore("files");
              let saved = false;
              const request = store.getAll();
              request.onsuccess = () => {
                for (const record of request.result) {
                  if (record.name !== "encrypted.pdf") continue;
                  record.thumbnail =
                    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
                  record.thumbnailStoredAt = Date.now();
                  if (legacyRecord) delete record.isEncrypted;
                  else record.isEncrypted = true;
                  store.put(record);
                  saved = true;
                }
              };
              transaction.oncomplete = () => resolve(saved);
              transaction.onerror = () => reject(transaction.error);
            });
            db.close();
            return found;
          }, legacy),
        )
        .toBe(true);
      await page.goto("/files");
      await page.getByRole("button", { name: "Recents", exact: true }).click();
      await page
        .locator('.files-page-view-toggle-icon[title="Grid view"]')
        .click();
      const card = page.locator('.files-page-card[aria-label="encrypted.pdf"]');
      await expect(card).toBeVisible();
      await expect(card.locator("img")).toHaveCount(0);
      await card.dblclick();
      await expect(
        page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
      ).toBeVisible();
      await expect(page.locator('[data-page-index="0"]')).toHaveCount(0);
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
      ).toBeHidden();
    });
  }

  test("pressing Enter in the password field triggers unlock", async ({
    page,
  }) => {
    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await expect(
      page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
    ).toBeVisible({ timeout: 10000 });

    await fillPassword(page, "testpass123");
    await page.getByLabel(PASSWORD_LABEL, { exact: true }).press("Enter");

    await expect(
      page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
    ).toBeHidden({ timeout: 10000 });
  });

  test("multi-file unlock-all closes the modal after one password entry", async ({
    page,
  }) => {
    // `files-button`'s native picker is mocked globally; click it, then set
    // the files on the hidden input directly.
    await page.getByTestId("files-button").click();
    await page.locator('[data-testid="file-input"]').setInputFiles([
      {
        name: "encrypted-a.pdf",
        mimeType: "application/pdf",
        buffer: fs.readFileSync(ENCRYPTED_PDF),
      },
      {
        name: "encrypted-b.pdf",
        mimeType: "application/pdf",
        buffer: fs.readFileSync(ENCRYPTED_PDF),
      },
    ]);

    await expect(
      page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
    ).toBeVisible({ timeout: 15000 });
    // The "Use for all" affordance only appears once BOTH files have been
    // detected as encrypted. PDF.js encryption probing runs per-file and
    // can lag the modal opening (which fires as soon as the first file
    // surfaces a password prompt). A 10s timeout was occasionally too tight
    // on heavily-loaded CI runners - bump to 20s.
    const unlockAllBtn = page.getByRole("button", { name: /Use for all/ });
    await expect(unlockAllBtn).toBeVisible({ timeout: 20000 });

    await fillPassword(page, "testpass123");
    await unlockAllBtn.click();

    await expect(
      page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
    ).toBeHidden({ timeout: 15000 });
  });
});
