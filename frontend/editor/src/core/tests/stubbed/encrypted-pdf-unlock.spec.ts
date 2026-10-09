/**
 * Backend-free coverage for session unlocks and cached preview privacy.
 * Security inspection is stubbed; EmbedPDF renders the actual encrypted fixture.
 */

import { test, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import { createHash } from "node:crypto";
import { mockAppApis } from "@app/tests/helpers/api-stubs";
import { suppressNativeFilePicker } from "@app/tests/helpers/ui-helpers";

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
const ENCRYPTED_PDF = path.join(FIXTURES_DIR, "encrypted.pdf");

function mockUnlockSuccess(page: Page) {
  return page.route("**/api/v1/security/inspect-pdf-security", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        encrypted: true,
        signed: false,
        ownerAuthenticated: true,
        permissions: -4,
        canModify: true,
        canAssemble: true,
        pageCount: 1,
      }),
    }),
  );
}

function mockUnlockWrongPassword(page: Page) {
  return page.route("**/api/v1/security/inspect-pdf-security", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "/errors/pdf-password",
        title: "PDF password incorrect",
        status: 400,
        detail:
          "The PDF is passworded and requires the correct password to open.",
      }),
    }),
  );
}

async function uploadEncryptedFile(page: Page, filePath: string) {
  // `files-button`'s native picker is mocked globally
  // (suppressNativeFilePicker), so the click is safe cross-browser; set the
  // files on the hidden input directly.
  await page.getByTestId("files-button").click();
  await page.locator('[data-testid="file-input"]').setInputFiles(filePath);
}

const MODAL_TITLE = /^Unlock PDF/;
const PASSWORD_PLACEHOLDER = "Enter the PDF password";
const UNLOCK_BUTTON_TEXT = /^Unlock$/;

/**
 * Fill the password field and wait until the modal has registered it: the
 * unlock button is disabled while the password is empty, so its becoming enabled
 * proves the value landed in state. Retried because on WebKit the modal can
 * remount mid open-transition and drop a one-shot fill, leaving it disabled.
 */
async function fillPassword(page: Page, password: string): Promise<void> {
  const field = page.getByPlaceholder(PASSWORD_PLACEHOLDER);
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

  test("modal renders with title, password input, and action buttons", async ({
    page,
  }) => {
    await uploadEncryptedFile(page, ENCRYPTED_PDF);

    await expect(page.getByRole("heading", { name: MODAL_TITLE })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByPlaceholder(PASSWORD_PLACEHOLDER)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel opening" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "More options", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }),
    ).toBeVisible();
    await expect(
      page.getByText("Unlock for this session.", { exact: true }),
    ).toHaveCount(0);
    const details = page.getByRole("heading").getByRole("button", {
      name: "About session unlocking",
    });
    await page.getByPlaceholder(PASSWORD_PLACEHOLDER).focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(details).toBeFocused();
    const sessionDetails = page.getByRole("tooltip").filter({
      hasText: "Access ends when you close the file",
    });
    await expect(sessionDetails).toContainText(
      "Closing this dialog keeps the saved copy in your library.",
    );
    await page.getByPlaceholder(PASSWORD_PLACEHOLDER).focus();
    await expect(sessionDetails).toBeHidden();
  });

  test("Remove Password creates a usable copy and retains the protected source", async ({
    page,
  }) => {
    const sample = fs.readFileSync(path.join(FIXTURES_DIR, "sample.pdf"));
    let removals = 0;
    await page.route("**/api/v1/security/remove-password", (route) => {
      removals++;
      return route.fulfill({ contentType: "application/pdf", body: sample });
    });
    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "More options", exact: true })
      .click();
    await expect(
      page.getByRole("menuitem", { name: /Remove Password/ }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await fillPassword(page, "testpass123");
    await dialog
      .getByRole("button", { name: "More options", exact: true })
      .click();
    await page.getByRole("menuitem", { name: /Remove Password/ }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText("Unprotected copy created", { exact: true }),
    ).toBeVisible();
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
      if (request.url().includes("/security/remove-password"))
        removalRequests.push(request.url());
    });
    await mockUnlockSuccess(page);

    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await expect(
      page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
    ).toBeVisible({ timeout: 10000 });

    await fillPassword(page, "testpass123");
    await page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }).click();

    await expect(
      page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
    ).toBeHidden({ timeout: 10000 });
    await expect(page.getByText("PDF unlocked", { exact: true })).toBeVisible({
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
  });

  test("incorrect password keeps the modal open with an inline error", async ({
    page,
  }) => {
    await mockUnlockWrongPassword(page);

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
    await mockUnlockSuccess(page);
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
      hasText: "this tool cannot preserve its password protection",
    });
    await expect(details).toBeVisible();
    await notice.getByText("encrypted.pdf", { exact: true }).click();
    await expect(details).toBeHidden();
    const removePassword = notice
      .getByRole("listitem")
      .getByRole("button", { name: "Remove Password" });
    await removePassword.hover();
    await expect(
      page.getByRole("tooltip").filter({
        hasText: "Open Remove Password to create an unprotected copy.",
      }),
    ).toBeVisible();
    await removePassword.click();
    await expect(page).toHaveURL(/\/remove-password$/);
    await expect(page.getByTestId("tool-file-list")).toContainText(
      "encrypted.pdf",
    );
    await expect(page.getByPlaceholder("Enter current password")).toBeVisible();
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
    await mockUnlockSuccess(page);

    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await expect(
      page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
    ).toBeVisible({ timeout: 10000 });

    await fillPassword(page, "testpass123");
    await page.getByPlaceholder(PASSWORD_PLACEHOLDER).press("Enter");

    await expect(
      page.getByRole("heading", { name: MODAL_TITLE, exact: true }),
    ).toBeHidden({ timeout: 10000 });
  });

  test("multi-file unlock-all closes the modal after one password entry", async ({
    page,
  }) => {
    await mockUnlockSuccess(page);

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
