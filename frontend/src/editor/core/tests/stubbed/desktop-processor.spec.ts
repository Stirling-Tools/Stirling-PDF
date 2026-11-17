import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import {
  dismissModals,
  installTauri,
  setDisk,
} from "@editor/tests/helpers/tauriDiskStub";

// The real desktop build, signed in to a self-hosted server the stubs stand in
// for. Desktop requests go through the native HTTP plugin, which the IPC stub
// hands to window.fetch, so the page.route stubs answer them at the server's
// own address.
const SERVER = "http://server.test";

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.sig`;
}

const TOKEN = jwt({ sub: "alice", exp: 4_102_444_800 });
const PDF_PATH = "C:/Docs/report.pdf";
const PDF_BYTES = Array.from(
  fs.readFileSync(
    path.resolve(
      "src/editor/core/tests/test-fixtures/annotation-text-sample.pdf",
    ),
  ),
);
const CLOUD_TOKEN = jwt({
  sub: "5f0c2a7e-0000-4000-8000-000000000001",
  email: "alice@example.com",
  role: "authenticated",
  exp: 4_102_444_800,
});

test.use({
  autoGoto: false,
  stubOptions: {
    enableLogin: true,
    isAdmin: true,
    user: {
      id: 1,
      username: "alice",
      email: "alice@example.com",
      role: "ROLE_ADMIN",
      roles: ["ROLE_ADMIN"],
      portalAccess: true,
      orgOwner: true,
    },
  },
});

async function signInToServer(page: Page) {
  await installTauri(page, {
    connection: {
      mode: "selfhosted",
      server_config: { url: SERVER },
      lock_connection_mode: false,
    },
    commands: {
      get_auth_token: TOKEN,
      get_refresh_token: null,
      get_user_info: { username: "alice", email: "alice@example.com" },
    },
  });
  await page.addInitScript((token) => {
    localStorage.setItem("stirling_jwt", token);
  }, TOKEN);
}

async function go(page: Page, to: string) {
  await page.evaluate((path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, to);
}

/** Opens a PDF from the OS, as a double-click in Explorer would: Rust queues it, then signals. */
async function openFromOs(page: Page) {
  await setDisk(page, {
    [PDF_PATH]: { bytes: PDF_BYTES, modifiedMs: 1_700_000_000_000 },
  });
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "__listeners")["files-changed"]),
    )
    .toBeDefined();
  await page.evaluate((path) => {
    Reflect.set(window, "__openedPaths", [path]);
    const callbacks = Reflect.get(window, "__callbacks");
    const listeners = Reflect.get(window, "__listeners");
    callbacks[listeners["files-changed"]]({
      event: "files-changed",
      payload: null,
    });
  }, PDF_PATH);
}

async function openEditorWithFile(page: Page) {
  await signInToServer(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await dismissModals(page);
  await openFromOs(page);
  await expect(page.locator(".file-sidebar-file-item")).toHaveCount(1, {
    timeout: 30_000,
  });
}

async function openProcessor(page: Page) {
  await go(page, "/processor");
  await expect(page.locator(".desktop-processor .portal-shell")).toBeVisible({
    timeout: 30_000,
  });
}

async function requestClose(page: Page) {
  await page.evaluate(() => {
    const callbacks = Reflect.get(window, "__callbacks");
    const listeners = Reflect.get(window, "__listeners");
    callbacks[listeners["tauri://close-requested"]]({
      event: "tauri://close-requested",
      id: 1,
      payload: null,
    });
  });
}

async function markStoredFilesUnsaved(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("stirling-pdf-files");
        request.onsuccess = () => {
          const db = request.result;
          const store = db
            .transaction("files", "readwrite")
            .objectStore("files");
          const read = store.getAll();
          read.onsuccess = () => {
            for (const record of read.result)
              store.put({ ...record, isDirty: true });
            store.transaction.oncomplete = () => {
              db.close();
              resolve();
            };
          };
          read.onerror = () => reject(read.error);
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

test("opens the Processor as a page of the desktop app", async ({ page }) => {
  await signInToServer(page);
  await page.goto("/processor", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".desktop-processor .portal-shell")).toBeVisible({
    timeout: 30_000,
  });
  // One search, in the title-bar strip, and it is the Processor's.
  await expect(page.locator("#portal-search-input")).toHaveCount(1);
  await expect(page.locator(".portal-searchbar")).toHaveCount(0);
  // The window's height below the strip, not the page's: the shell pins the web viewport.
  const sidebar = await page.locator(".portal-sidebar").boundingBox();
  expect(sidebar?.height).toBeGreaterThan(page.viewportSize()!.height - 60);
});

test("launches into the Processor when it is the default view", async ({
  page,
}) => {
  await signInToServer(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "stirlingpdf_preferences",
      JSON.stringify({ defaultStartupView: "processor" }),
    );
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/processor$/, { timeout: 30_000 });
  await expect(page.locator(".desktop-processor .portal-shell")).toBeVisible();
});

test("opens the Processor on Stirling Cloud", async ({ page }) => {
  // Context routes yield to the page stubs, so this only catches what they leave:
  // nothing reaches a real Stirling host.
  await page
    .context()
    .route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  await installTauri(page, {
    connection: {
      mode: "saas",
      server_config: { url: "https://auth.stirling.com" },
      lock_connection_mode: false,
    },
    commands: {
      get_auth_token: CLOUD_TOKEN,
      get_refresh_token: "refresh",
      get_user_info: { username: "alice", email: "alice@example.com" },
    },
  });
  await page.goto("/processor", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".desktop-processor .portal-shell")).toBeVisible({
    timeout: 30_000,
  });
});

test("sends local mode back to the editor", async ({ page }) => {
  await installTauri(page);
  await page.goto("/processor", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
  await expect(page.locator(".portal-shell")).toHaveCount(0);
});

test("keeps the editor's files across a trip to the Processor", async ({
  page,
}) => {
  await openEditorWithFile(page);
  await openProcessor(page);
  await expect(page.locator(".file-sidebar-file-item")).toHaveCount(0);

  await go(page, "/");
  await expect(page.locator(".file-sidebar-file-item")).toHaveCount(1, {
    timeout: 30_000,
  });
});

test("opens a file from the OS in the editor while on the Processor", async ({
  page,
}) => {
  await signInToServer(page);
  await page.goto("/processor", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".desktop-processor .portal-shell")).toBeVisible({
    timeout: 30_000,
  });

  await openFromOs(page);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".file-sidebar-file-item")).toHaveCount(1, {
    timeout: 30_000,
  });
});

test("warns about unsaved files when the window closes on the Processor", async ({
  page,
}) => {
  await openEditorWithFile(page);
  await openProcessor(page);
  await markStoredFilesUnsaved(page);
  await page.evaluate(() =>
    Reflect.set(window, "__dialogAnswer", "Open in the editor"),
  );

  await requestClose(page);

  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, "__dialogs")?.[0]?.message),
    )
    .toContain("report.pdf");
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => Reflect.get(window, "__destroyed"))).toBe(
    undefined,
  );
});

test("closes from the Processor without asking when nothing is unsaved", async ({
  page,
}) => {
  await openEditorWithFile(page);
  await openProcessor(page);

  await requestClose(page);

  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "__destroyed")))
    .toBe(true);
  expect(await page.evaluate(() => Reflect.get(window, "__dialogs"))).toBe(
    undefined,
  );
});
