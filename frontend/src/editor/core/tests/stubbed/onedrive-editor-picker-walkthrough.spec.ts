import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Locator, Page, Route } from "@playwright/test";
import path from "path";
import {
  expandSettingsGroups,
  openSettings,
  uploadFiles,
} from "@editor/tests/helpers/ui-helpers";

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const PDF_A = path.join(FIXTURES, "compare_sample_a.pdf");
const PDF_B = path.join(FIXTURES, "compare_sample_b.pdf");
const OUT = path.join(
  import.meta.dirname,
  "../../../../../screenshots/onedrive-editor-picker-walkthrough-2026-11-13",
);

interface Flags {
  allowEditorSaves?: boolean;
  personal?: boolean;
  accounts?: unknown[];
  saveStatus?: number;
  saveCode?: string;
}

const WORK_ACCOUNT = {
  id: 9,
  provider: "microsoft",
  email: "pat@contoso.com",
  displayName: "Pat Jones",
  status: "CONNECTED",
  personal: false,
  lastError: null,
  createdAt: "2026-11-01T10:00:00",
};

async function stubCloud(page: Page, flags: Flags = {}): Promise<void> {
  await page.route("**/api/v1/config/app-config", (route: Route) =>
    route.fulfill({
      json: {
        enableLogin: false,
        isAdmin: false,
        enableAnalytics: false,
        languages: ["en-US", "ar-AR"],
        defaultLocale: "en-US",
        microsoftEnabled: true,
        microsoftClientId: "00000000-0000-0000-0000-000000000000",
        microsoftTenant: "organizations",
        microsoftAccountConnections: true,
        microsoftAllowEditorSaves: flags.allowEditorSaves ?? true,
        googleDriveEnabled: true,
        googleDriveClientId: "google-client",
        googleDriveApiKey: "google-key",
        googleDriveAppId: "123",
        googleDriveAccountConnections: true,
      },
    }),
  );
  await page.route("**/api/v1/connected-accounts", (route: Route) =>
    route.fulfill({
      json: {
        providers: { microsoft: true, google: true },
        accounts: flags.accounts ?? [
          { ...WORK_ACCOUNT, personal: flags.personal ?? false },
        ],
      },
    }),
  );
  await page.route("**/api/v1/connected-accounts/9/drive/save", (route) =>
    flags.saveStatus
      ? route.fulfill({
          status: flags.saveStatus,
          json: { code: flags.saveCode, message: "refused" },
        })
      : route.fulfill({
          json: {
            driveId: "drive-1",
            itemId: "item-1",
            parentId: "folder-1",
            name: "Q3-Board-Report.pdf",
            eTag: '"{E},2"',
            webUrl: "https://contoso.sharepoint.com/Q3-Board-Report.pdf",
          },
        }),
  );
}

interface Seed {
  upload: string;
  name: string;
  origin?: { name: string; unsaved: boolean; itemId: string };
}

/** Uploads the fixtures, then rewrites their stored records as OneDrive files. */
async function seedFiles(page: Page, seeds: Seed[]): Promise<void> {
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await uploadFiles(
    page,
    seeds.map((s) => s.upload),
  );
  await page.evaluate(
    (all) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("stirling-pdf-files");
        open.onsuccess = () => {
          const store = open.result
            .transaction("files", "readwrite")
            .objectStore("files");
          const req = store.getAll();
          req.onsuccess = () => {
            for (const record of req.result) {
              const seed = all.find((s) => record.name === s.uploadName);
              if (!seed) continue;
              record.name = seed.name;
              if (seed.origin) {
                record.cloudOrigin = {
                  provider: "onedrive",
                  accountId: 9,
                  driveId: "drive-1",
                  itemId: seed.origin.itemId,
                  parentId: "folder-1",
                  name: seed.origin.name,
                  eTag: '"{E},1"',
                  webUrl: `https://contoso.sharepoint.com/${seed.origin.name}`,
                  savedFileId: seed.origin.unsaved ? "older" : record.id,
                };
              }
              store.put(record);
            }
            store.transaction.oncomplete = () => resolve();
          };
          req.onerror = () => reject(req.error);
        };
        open.onerror = () => reject(open.error);
      }),
    seeds.map((s) => ({
      uploadName: path.basename(s.upload),
      name: s.name,
      origin: s.origin,
    })),
  );
  await page.reload();
  if (seeds.some((s) => s.origin)) {
    await expect(page.getByTestId("file-onedrive-badge").first()).toBeVisible({
      timeout: 15_000,
    });
  } else {
    await expect(page.locator(".file-sidebar-file-item").first()).toBeVisible({
      timeout: 15_000,
    });
  }
}

const REPORT = (
  unsaved: boolean,
  originName = "Q3-Board-Report.pdf",
): Seed => ({
  upload: PDF_A,
  name: "Q3-Board-Report.pdf",
  origin: { name: originName, unsaved, itemId: "item-1" },
});
const BUDGET: Seed = {
  upload: PDF_B,
  name: "Budget-2027.pdf",
  origin: { name: "Budget-2027.pdf", unsaved: false, itemId: "item-2" },
};
const LOCAL_B: Seed = { upload: PDF_B, name: "Minutes-Nov.pdf" };

function row(page: Page, name: string): Locator {
  return page.locator(".file-sidebar-file-item").filter({ hasText: name });
}

async function openRowMenu(page: Page, name: string): Promise<void> {
  const item = row(page, name);
  await item.hover();
  await item.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

async function openInViewer(page: Page, name: string): Promise<void> {
  const item = row(page, name);
  await item.hover();
  const close = item.getByRole("button", { name: "Close viewer" });
  if (await close.count()) await close.click();
  await item.getByRole("button", { name: "Open in viewer" }).click();
  await expect(page.getByText(/\/ \d+$/).first()).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForFunction(() =>
    document.querySelector("canvas, img[src^='blob:']"),
  );
}

async function openActiveFiles(page: Page): Promise<void> {
  const radio = page.getByRole("radio", { name: /Active Files/i });
  const id = await radio.getAttribute("id");
  await page.locator(`label[for="${id}"]`).click();
  await expect(page.getByTestId("file-thumbnail").first()).toBeVisible({
    timeout: 15_000,
  });
}

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) =>
          a.playState !== "running" ||
          a.effect?.getComputedTiming().iterations === Infinity,
      ),
  );
}

/** Captures the current state in light, then dark, without reloading. */
async function themed(page: Page, id: string, clip?: Locator): Promise<void> {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      scheme,
    );
    await settle(page);
    const file = path.join(OUT, `${id}_${scheme}.png`);
    if (clip) await clip.screenshot({ path: file });
    else await page.screenshot({ path: file });
  }
  await page.emulateMedia({ colorScheme: "light" });
}

async function rtl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "ar-AR");
    localStorage.setItem("stirling-language", "ar-AR");
    localStorage.setItem("i18nextLng-source", "3");
    const applyDir = () => {
      document.documentElement.setAttribute("dir", "rtl");
      document.documentElement.setAttribute("lang", "ar-AR");
    };
    if (document.documentElement) applyDir();
    else document.addEventListener("DOMContentLoaded", applyDir);
  });
}

test.describe("OneDrive in the editor", () => {
  test.use({ autoGoto: false });
  test.setTimeout(120_000);

  test("01 add-files menu offers the cloud drives", async ({ page }) => {
    await stubCloud(page);
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await page.getByTestId("pdf-library-add-files").first().click();
    await expect(page.getByTestId("onedrive-button")).toBeVisible();
    await themed(page, "01_add_files_menu");
  });

  test("02 OneDrive picker overlay while it connects", async ({ page }) => {
    await stubCloud(page);
    await page.route("**/api/v1/connected-accounts/9/access-token", (route) =>
      route.fulfill({ json: { accessToken: "token" } }),
    );
    await page.route("https://graph.microsoft.com/**", (route) =>
      route.fulfill({
        json: { webUrl: "https://contoso-my.sharepoint.com/personal/pat" },
      }),
    );
    await page.route("https://contoso-my.sharepoint.com/**", () => {
      // Never answered: the overlay stays in its connecting state.
    });
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await page.getByTestId("pdf-library-add-files").first().click();
    await page.getByTestId("onedrive-button").click();
    await expect(page.getByText("Connecting to OneDrive...")).toBeVisible({
      timeout: 15_000,
    });
    await themed(page, "02_picker_connecting");
  });

  test("03 sidebar rows: saved, unsaved and local", async ({ page }) => {
    await stubCloud(page);
    await seedFiles(page, [REPORT(true), LOCAL_B]);
    await row(page, "Q3-Board-Report.pdf")
      .getByTestId("file-onedrive-badge")
      .hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await themed(page, "03_sidebar_unsaved_badge_tooltip");
  });

  test("04 OneDrive file menu, names match", async ({ page }) => {
    await stubCloud(page);
    await seedFiles(page, [REPORT(false), LOCAL_B]);
    await openRowMenu(page, "Q3-Board-Report.pdf");
    await themed(page, "04_onedrive_file_menu");
  });

  test("05 OneDrive file menu after a rename", async ({ page }) => {
    await stubCloud(page);
    await seedFiles(page, [REPORT(false, "Q3 Board Report (draft).pdf")]);
    await openRowMenu(page, "Q3-Board-Report.pdf");
    await expect(page.getByTestId("file-save-onedrive-target")).toBeVisible();
    await themed(page, "05_onedrive_file_menu_renamed");
  });

  test("06 local file menu offers an upload", async ({ page }) => {
    await stubCloud(page);
    await seedFiles(page, [REPORT(false), LOCAL_B]);
    await openRowMenu(page, "Minutes-Nov.pdf");
    await expect(page.getByTestId("file-save-onedrive-folder")).toBeVisible();
    await themed(page, "06_local_file_menu");
  });

  test("07 viewer Save names the OneDrive file", async ({ page }) => {
    await stubCloud(page);
    await seedFiles(page, [REPORT(true)]);
    await openInViewer(page, "Q3-Board-Report.pdf");
    const save = page.getByRole("button", {
      name: "Update Q3-Board-Report.pdf in OneDrive",
    });
    await save.hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await themed(page, "07_viewer_save_unsaved");
  });

  test("08 Save menu lists the other destinations", async ({ page }) => {
    await stubCloud(page);
    await seedFiles(page, [REPORT(true)]);
    await openInViewer(page, "Q3-Board-Report.pdf");
    await page.mouse.move(0, 0);
    await page.getByRole("button", { name: "More save options" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("menuitem", { name: /Upload to OneDrive/ }),
    ).toBeVisible();
    await themed(page, "08_save_menu");
  });

  test("09 saved toast", async ({ page }) => {
    await stubCloud(page);
    await seedFiles(page, [REPORT(true)]);
    await openInViewer(page, "Q3-Board-Report.pdf");
    await page
      .getByRole("button", { name: "Update Q3-Board-Report.pdf in OneDrive" })
      .click();
    await expect(page.getByText("Saved to OneDrive").first()).toBeVisible();
    await page.mouse.move(0, 0);
    await themed(page, "09_saved_toast");
  });

  for (const [id, status, code, text] of [
    ["10_conflict_toast", 409, "conflict", /changed in OneDrive/],
    ["11_missing_toast", 410, "missing", /moved or deleted/],
    ["12_reconnect_toast", 401, undefined, /sign in again/],
  ] as const) {
    test(`${id}`, async ({ page }) => {
      await stubCloud(page, { saveStatus: status, saveCode: code });
      await seedFiles(page, [REPORT(true)]);
      await openInViewer(page, "Q3-Board-Report.pdf");
      await page
        .getByRole("button", {
          name: "Update Q3-Board-Report.pdf in OneDrive",
        })
        .click();
      await expect(page.getByText(text).first()).toBeVisible();
      await page.mouse.move(0, 0);
      await themed(page, id);
    });
  }

  test("13 Active Files with two OneDrive files", async ({ page }) => {
    await stubCloud(page);
    await seedFiles(page, [REPORT(true), BUDGET]);
    await openActiveFiles(page);
    await page.getByRole("button", { name: "Update all in OneDrive" }).hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await themed(page, "13_active_files_update_all");
  });

  test("14 Active Files card actions", async ({ page }) => {
    await stubCloud(page);
    await seedFiles(page, [REPORT(true), BUDGET]);
    await openActiveFiles(page);
    await page.getByTestId("file-thumbnail").first().hover();
    await themed(page, "14_active_files_card_hover");
  });

  test("15 personal account: no folder upload", async ({ page }) => {
    await stubCloud(page, { personal: true });
    await seedFiles(page, [REPORT(false)]);
    await openRowMenu(page, "Q3-Board-Report.pdf");
    await themed(page, "15_personal_account_menu");
  });

  test("16 editor saves turned off", async ({ page }) => {
    await stubCloud(page, { allowEditorSaves: false });
    await seedFiles(page, [REPORT(false)]);
    await openRowMenu(page, "Q3-Board-Report.pdf");
    await themed(page, "16_editor_saves_off_menu");
  });

  test("17 files page shows where a file came from", async ({ page }) => {
    await stubCloud(page);
    await seedFiles(page, [REPORT(false), LOCAL_B]);
    await page.goto("/files?view=recent", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Q3-Board-Report.pdf").first()).toBeVisible({
      timeout: 15_000,
    });
    await themed(page, "17_files_page_origin");
  });

  test("R1 RTL: OneDrive file menu after a rename", async ({ page }) => {
    await rtl(page);
    await stubCloud(page);
    await seedFiles(page, [REPORT(false, "Q3 Board Report (draft).pdf")]);
    const item = row(page, "Q3-Board-Report.pdf");
    await item.hover();
    await item.locator(".file-sidebar-file-actions button").last().click();
    await expect(page.getByTestId("file-save-onedrive-target")).toBeVisible();
    await settle(page);
    await page.screenshot({
      path: path.join(OUT, "R1_rtl_file_menu_light.png"),
    });
  });
});

const SETTINGS_ACCOUNTS = [
  WORK_ACCOUNT,
  {
    id: 10,
    provider: "microsoft",
    email: "pat.jones@outlook.com",
    displayName: "Pat Jones",
    status: "NEEDS_RECONNECT",
    personal: true,
    lastError: "sign-in refused",
    createdAt: "2026-10-12T10:00:00",
  },
  {
    id: 11,
    provider: "google",
    email: "pat@contoso.dev",
    displayName: "Pat Jones",
    status: "CONNECTED",
    personal: false,
    lastError: null,
    createdAt: "2026-11-02T10:00:00",
  },
];

async function stubSettings(page: Page, accounts: unknown[]): Promise<void> {
  await page.route("**/api/v1/config/app-config", (route: Route) =>
    route.fulfill({
      json: {
        enableLogin: true,
        isAdmin: true,
        enableAnalytics: false,
        languages: ["en-US", "ar-AR"],
        defaultLocale: "en-US",
        microsoftEnabled: true,
        microsoftClientId: "00000000-0000-0000-0000-000000000000",
        microsoftTenant: "common",
        microsoftAccountConnections: true,
        microsoftAllowEditorSaves: true,
        googleDriveEnabled: true,
        googleDriveClientId: "google-client",
        googleDriveApiKey: "google-key",
        googleDriveAppId: "123",
        googleDriveAccountConnections: true,
      },
    }),
  );
  await page.route("**/api/v1/connected-accounts", (route: Route) =>
    route.fulfill({
      json: { providers: { microsoft: true, google: true }, accounts },
    }),
  );
  await page.route("**/api/v1/connected-accounts/redirect-uris", (route) =>
    route.fulfill({
      json: {
        microsoft:
          "https://pdf.example.com/api/v1/connected-accounts/callback/microsoft",
        google:
          "https://pdf.example.com/api/v1/connected-accounts/callback/google",
      },
    }),
  );
  await page.route("**/api/v1/admin/settings/section/*", (route) => {
    const section = new URL(route.request().url()).pathname.split("/").pop();
    if (section !== "premium") return route.fulfill({ json: {} });
    return route.fulfill({
      json: {
        proFeatures: {
          googleDrive: {
            enabled: true,
            clientId: "1234-abc.apps.googleusercontent.com",
            clientSecret: "********",
            allowAccountConnections: true,
            accountScope: "drive",
          },
          microsoft: {
            enabled: true,
            clientId: "00000000-0000-0000-0000-000000000000",
            tenant: "common",
            clientSecret: "********",
            allowAccountConnections: true,
            allowEditorSaves: true,
          },
        },
      },
    });
  });
}

test.describe("OneDrive settings", () => {
  test.use({
    autoGoto: false,
    seedJwt: true,
    stubOptions: {
      enableLogin: true,
      isAdmin: true,
      user: {
        id: 1,
        username: "pat",
        email: "pat@contoso.com",
        roles: ["ROLE_ADMIN"],
        role: "ROLE_ADMIN",
      },
    },
  });
  test.setTimeout(120_000);

  test("18 connected accounts", async ({ page }) => {
    await stubSettings(page, SETTINGS_ACCOUNTS);
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await openSettings(page, "Connected accounts");
    await expect(page.getByTestId("connected-account-9")).toBeVisible();
    await themed(page, "18_connected_accounts");
  });

  test("19 connected accounts, none yet", async ({ page }) => {
    await stubSettings(page, []);
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await openSettings(page, "Connected accounts");
    await expect(page.getByTestId("connect-microsoft")).toBeVisible();
    await themed(page, "19_connected_accounts_empty");
  });

  test("20 disconnect confirmation", async ({ page }) => {
    await stubSettings(page, SETTINGS_ACCOUNTS);
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await openSettings(page, "Connected accounts");
    await page
      .getByTestId("connected-account-9")
      .getByRole("button", { name: /Disconnect/i })
      .click();
    await expect(page.getByTestId("confirm-disconnect")).toBeVisible();
    await themed(page, "20_disconnect_confirm");
  });

  async function openMicrosoftCard(page: Page): Promise<Locator> {
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await page.locator('[data-testid="config-button"]').first().click();
    await expandSettingsGroups(page);
    await page
      .locator(".modal-nav-item")
      .filter({ hasText: "Integrations" })
      .first()
      .click();
    const card = page
      .locator(".mantine-Paper-root")
      .filter({ hasText: "Microsoft 365 (OneDrive & SharePoint)" })
      .last();
    await expect(card).toBeVisible({ timeout: 15_000 });
    return card;
  }

  test("21 Microsoft 365 settings card", async ({ page }) => {
    await stubSettings(page, SETTINGS_ACCOUNTS);
    const card = await openMicrosoftCard(page);
    await card.getByRole("button", { name: /Expand|Connect/ }).click();
    await expect(card.getByText("Redirect URI", { exact: true })).toBeVisible();
    await themed(page, "21_microsoft_card", card);
  });

  test("22 Microsoft 365 setup steps", async ({ page }) => {
    await stubSettings(page, SETTINGS_ACCOUNTS);
    const card = await openMicrosoftCard(page);
    await card.getByRole("button", { name: /How to set up/ }).hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await themed(page, "22_microsoft_setup_steps");
  });

  test("R2 RTL: connected accounts", async ({ page }) => {
    await rtl(page);
    await stubSettings(page, SETTINGS_ACCOUNTS);
    await page.goto("/settings/connectedAccounts", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("connected-account-9")).toBeVisible({
      timeout: 15_000,
    });
    await settle(page);
    await page.screenshot({
      path: path.join(OUT, "R2_rtl_connected_accounts_light.png"),
    });
  });
});
