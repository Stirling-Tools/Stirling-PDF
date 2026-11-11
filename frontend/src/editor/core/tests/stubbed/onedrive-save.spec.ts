import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Locator, Page, Request, Route } from "@playwright/test";
import path from "path";
import { uploadFiles } from "@editor/tests/helpers/ui-helpers";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
const SHOTS = process.env.ONEDRIVE_SAVE_SHOTS;

interface SaveCall {
  itemId: string | null;
  parentId: string | null;
  name: string | null;
}

interface MicrosoftConfig {
  allowEditorSaves?: boolean;
  personal?: boolean;
}

async function stubMicrosoft(
  page: Page,
  config: MicrosoftConfig = {},
): Promise<SaveCall[]> {
  await page.route("**/api/v1/config/app-config", (route: Route) =>
    route.fulfill({
      json: {
        enableLogin: false,
        isAdmin: false,
        languages: ["en-US"],
        defaultLocale: "en-US",
        microsoftEnabled: true,
        microsoftClientId: "00000000-0000-0000-0000-000000000000",
        microsoftTenant: "organizations",
        microsoftAccountConnections: true,
        microsoftAllowEditorSaves: config.allowEditorSaves ?? true,
      },
    }),
  );
  await page.route("**/api/v1/connected-accounts", (route: Route) =>
    route.fulfill({
      json: {
        providers: { microsoft: true, google: false },
        accounts: [
          {
            id: 9,
            provider: "microsoft",
            email: "pat@contoso.com",
            displayName: "Pat",
            status: "CONNECTED",
            personal: config.personal ?? false,
            lastError: null,
            createdAt: null,
          },
        ],
      },
    }),
  );
  const calls: SaveCall[] = [];
  await page.route("**/api/v1/connected-accounts/9/drive/save", (route) => {
    const call = parseSave(route.request());
    calls.push(call);
    const copy = call.itemId === null;
    return route.fulfill({
      json: {
        driveId: "drive-1",
        itemId: copy ? `copy-${calls.length}` : call.itemId,
        parentId: "folder-1",
        name: call.name ?? "Report.pdf",
        eTag: `"{E},${calls.length + 1}"`,
        webUrl: "https://contoso.sharepoint.com/Report.pdf",
      },
    });
  });
  return calls;
}

function parseSave(request: Request): SaveCall {
  const body = request.postDataBuffer()?.toString("latin1") ?? "";
  const field = (name: string) =>
    body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1] ?? null;
  return {
    itemId: field("itemId"),
    parentId: field("parentId"),
    name: field("name"),
  };
}

/** Marks the uploaded file as opened from OneDrive, then reloads. */
async function openFromOneDrive(page: Page, unsaved: boolean): Promise<void> {
  await uploadFiles(page, SAMPLE_PDF);
  await page.evaluate(
    (dirty) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("stirling-pdf-files");
        open.onsuccess = () => {
          const store = open.result
            .transaction("files", "readwrite")
            .objectStore("files");
          const all = store.getAll();
          all.onsuccess = () => {
            for (const record of all.result) {
              record.cloudOrigin = {
                provider: "onedrive",
                accountId: 9,
                driveId: "drive-1",
                itemId: "item-1",
                parentId: "folder-1",
                name: "Report.pdf",
                eTag: '"{E},1"',
                webUrl: "https://contoso.sharepoint.com/Report.pdf",
                savedFileId: dirty ? "older-version" : record.id,
              };
              store.put(record);
            }
            store.transaction.oncomplete = () => resolve();
          };
          all.onerror = () => reject(all.error);
        };
        open.onerror = () => reject(open.error);
      }),
    unsaved,
  );
  await page.reload();
  await expect(page.getByTestId("file-onedrive-badge").first()).toBeVisible({
    timeout: 15_000,
  });
}

async function startWithOneDriveFile(
  page: Page,
  { unsaved, ...config }: MicrosoftConfig & { unsaved: boolean },
): Promise<SaveCall[]> {
  const calls = await stubMicrosoft(page, config);
  await page.goto("/editor");
  await openFromOneDrive(page, unsaved);
  return calls;
}

async function openInViewer(page: Page): Promise<void> {
  const item = page.locator(".file-sidebar-file-item").first();
  await item.hover();
  // The reload keeps the viewed-file marker but not the workbench, so reopen it.
  const close = item.getByRole("button", { name: "Close viewer" });
  if (await close.count()) await close.click();
  await item.getByRole("button", { name: "Open in viewer" }).click();
  await expect(
    page.getByRole("button", { name: /Close PDF/ }).first(),
  ).toBeVisible({ timeout: 15_000 });
  // Save exports through the viewer, which can only do so once the document loaded.
  await expect(page.getByText("/ 1", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForFunction(() =>
    document.querySelector("canvas, img[src^='blob:']"),
  );
}

async function openFileCards(page: Page): Promise<Locator> {
  // The segmented control's radio sits off-screen; its label takes the click.
  const radio = page.getByRole("radio", { name: /Active Files/i });
  const id = await radio.getAttribute("id");
  await page.locator(`label[for="${id}"]`).click();
  const card = page.getByTestId("file-thumbnail").first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.hover();
  return card;
}

async function nthSave(calls: SaveCall[], n: number): Promise<SaveCall> {
  await expect.poll(() => calls.length).toBe(n);
  return calls[n - 1];
}

async function expectOtherDestinations(page: Page): Promise<void> {
  await expect(
    page.getByRole("menuitem", { name: "Download", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: /Upload copy to OneDrive/ }),
  ).toBeVisible();
}

function toolbarUnsavedDot(page: Page): Locator {
  return page.locator(".workbench-bar-unsaved-dot");
}

function sidebarUnsavedDot(page: Page): Locator {
  return page
    .getByTestId("file-onedrive-badge")
    .locator(".file-sidebar-cloud-badge-dot");
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

test.describe("Saving files opened from OneDrive", () => {
  test.use({ autoGoto: false });

  test("Save updates the original in OneDrive by default", async ({ page }) => {
    const calls = await startWithOneDriveFile(page, { unsaved: true });
    await openInViewer(page);

    const save = page.getByRole("button", {
      name: "Update Report.pdf in OneDrive",
    });
    await expect(save).toBeVisible();
    await expect(toolbarUnsavedDot(page)).toBeVisible();
    await shot(page, "1-replace-unsaved");
    await save.click();

    expect(await nthSave(calls, 1)).toMatchObject({ itemId: "item-1" });
    await expect(page.getByText("Saved to OneDrive").first()).toBeVisible();
    await expect(toolbarUnsavedDot(page)).toHaveCount(0);
  });

  test("the menu offers the other destinations", async ({ page }) => {
    await startWithOneDriveFile(page, { unsaved: true });
    await openInViewer(page);

    const more = page.getByRole("button", { name: "More save options" });
    await more.click();
    await expectOtherDestinations(page);
    await expect(
      page.getByRole("menuitem", { name: /Update Report\.pdf/ }),
    ).toHaveCount(0);
    await shot(page, "3-save-menu");
    await page.keyboard.press("Escape");

    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });

  test("a personal account is not offered a folder save", async ({ page }) => {
    await startWithOneDriveFile(page, { unsaved: false, personal: true });
    await openInViewer(page);

    await page.getByRole("button", { name: "More save options" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Download", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /Upload copy to OneDrive/ }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    const item = page.locator(".file-sidebar-file-item").first();
    await item.hover();
    await item.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByTestId("file-save-onedrive")).toBeVisible();
    await expect(page.getByTestId("file-save-onedrive-folder")).toHaveCount(0);
  });

  test("the file menu's OneDrive rows fit on one line", async ({ page }) => {
    await startWithOneDriveFile(page, { unsaved: true });
    const item = page.locator(".file-sidebar-file-item").first();
    await item.hover();
    await item.getByRole("button", { name: "More actions" }).click();
    const rows = [
      page
        .getByTestId("file-save-onedrive")
        .locator(".file-sidebar-kebab-item-stack > span")
        .first(),
      page.getByTestId("file-save-onedrive-target"),
      page.getByTestId("file-save-onedrive-copy"),
      page.getByTestId("file-save-onedrive-folder"),
      page.getByTestId("file-open-onedrive"),
    ];
    for (const row of rows) {
      await expect(row).toBeVisible();
      const lines = await row.evaluate((el) => {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let most = 0;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const tops = [...range.getClientRects()]
            .filter((r) => r.width > 0)
            .map((r) => Math.round(r.top));
          most = Math.max(most, new Set(tops).size);
        }
        return most;
      });
      expect(lines, await row.innerText()).toBe(1);
    }
  });

  test("the result of a tool offers the same save menu", async ({ page }) => {
    await page.route("**/api/v1/general/rotate-pdf", (route: Route) =>
      route.fulfill({
        path: SAMPLE_PDF,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="Report.pdf"',
        },
      }),
    );
    const calls = await startWithOneDriveFile(page, { unsaved: false });
    await openInViewer(page);

    await page.getByText("Rotate", { exact: true }).first().click();
    await page.getByRole("button", { name: "Rotate Clockwise" }).click();
    await page.getByRole("button", { name: /Apply Rotation/ }).click();
    await expect(page.getByTestId("download-result-button")).toHaveText(
      "Update Report.pdf in OneDrive",
      { timeout: 15_000 },
    );

    await page.getByTestId("download-result-menu").click();
    await expectOtherDestinations(page);
    await shot(page, "7-result-save-menu");
    await page.keyboard.press("Escape");
    await page.getByTestId("download-result-button").click();

    expect(await nthSave(calls, 1)).toMatchObject({ itemId: "item-1" });
  });

  test("turning off editor saves hides OneDrive saving", async ({ page }) => {
    const calls = await startWithOneDriveFile(page, {
      unsaved: true,
      allowEditorSaves: false,
    });
    await openInViewer(page);

    await expect(
      page.getByRole("button", { name: "More save options" }),
    ).toHaveCount(0);
    await expect(toolbarUnsavedDot(page)).toHaveCount(0);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download", exact: true }).click();
    await download;
    expect(calls).toHaveLength(0);
  });

  test("a file card saves to OneDrive like the toolbar", async ({ page }) => {
    const calls = await startWithOneDriveFile(page, { unsaved: true });
    const card = await openFileCards(page);

    await expect(card.getByTestId("file-card-save-status")).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Download", exact: true }),
    ).toBeVisible();
    await expect(sidebarUnsavedDot(page)).toBeVisible();
    await shot(page, "5-file-card");
    await card
      .getByRole("button", { name: "Update Report.pdf in OneDrive" })
      .click();

    expect(await nthSave(calls, 1)).toMatchObject({ itemId: "item-1" });
    await expect(card.getByTestId("file-card-save-status")).toHaveCount(0);
    await expect(sidebarUnsavedDot(page)).toHaveCount(0);
  });

  test("Save in the page editor sends its unsaved edits to OneDrive", async ({
    page,
  }) => {
    const calls = await startWithOneDriveFile(page, { unsaved: false });
    await openFileCards(page);
    await page
      .locator('[data-tour="view-switcher"]')
      .first()
      .locator(".mantine-SegmentedControl-label", { hasText: "Page Editor" })
      .click();
    const track = page.getByTestId("page-tracks").locator("section").first();
    const firstPage = track.locator("[data-page-id]").first();
    await expect(firstPage).toBeVisible({ timeout: 30_000 });
    await firstPage.hover();
    await firstPage.getByRole("button", { name: "Rotate right" }).click();
    await expect(track).toContainText("edited");

    await page
      .getByRole("button", { name: "Update Report.pdf in OneDrive" })
      .click();

    expect(await nthSave(calls, 1)).toMatchObject({ itemId: "item-1" });
    await expect(track).toContainText("v2", { timeout: 30_000 });
    await expect(track).not.toContainText("edited");
    await expect(toolbarUnsavedDot(page)).toHaveCount(0);
  });

  test("closing a card with unsaved OneDrive edits offers to save them", async ({
    page,
  }) => {
    const calls = await startWithOneDriveFile(page, { unsaved: true });
    const card = await openFileCards(page);

    await card.getByRole("button", { name: "Close", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("This file has unsaved changes.");
    await shot(page, "6-close-unsaved");
    await dialog.getByRole("button", { name: /Save and close/i }).click();

    await nthSave(calls, 1);
    await expect(page.getByTestId("file-thumbnail")).toHaveCount(0);
  });
});
