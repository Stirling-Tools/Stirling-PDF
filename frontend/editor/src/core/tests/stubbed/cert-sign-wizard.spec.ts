import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import type { Page, Route } from "@playwright/test";
import path from "path";

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");

// app-config the desktop bundle would return: hardware signing is offered only there.
const DESKTOP_APP_CONFIG = {
  enableLogin: false,
  isAdmin: false,
  languages: ["en-GB"],
  defaultLocale: "en-GB",
  hardwareSigningAvailable: true,
};

async function mockHardwareEndpoints(page: Page) {
  await page.route(
    "**/api/v1/security/cert-sign/hardware/capabilities",
    (route: Route) =>
      route.fulfill({
        json: {
          desktop: true,
          osName: "Windows 11",
          windowsStoreSupported: true,
          pkcs11Supported: true,
          detectedLibraries: [
            {
              name: "OpenSC",
              path: "C:/Program Files/OpenSC Project/OpenSC/pkcs11/opensc-pkcs11.dll",
            },
          ],
        },
      }),
  );
  await page.route(
    "**/api/v1/security/cert-sign/hardware/windows-certificates",
    (route: Route) =>
      route.fulfill({
        json: [
          {
            alias: "Anthony Stirling",
            source: "WINDOWS_STORE",
            subject: "CN=Anthony Stirling",
            issuer: "CN=Anthony Stirling",
            subjectCommonName: "Anthony Stirling",
            issuerCommonName: "Anthony Stirling",
            serialNumber: "abc123",
            keyAlgorithm: "RSA",
            notBefore: "2026-01-01T00:00:00Z",
            notAfter: "2028-01-01T00:00:00Z",
            expired: false,
            notYetValid: false,
          },
        ],
      }),
  );
}

test.describe("CertSign tool - certificate source model", () => {
  test("renders, accepts a PDF, and exposes the Upload source", async ({
    page,
  }) => {
    await page.route("**/api/v1/security/cert-sign", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        headers: { "Content-Disposition": 'attachment; filename="signed.pdf"' },
        body: Buffer.from("%PDF-1.4 stub\n"),
      }),
    );

    await page.goto("/cert-sign");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, SAMPLE_PDF);

    await expect(page).toHaveURL(/\/cert-sign/);
    // Source step always offers "Upload" (the former "Manual" mode).
    await expect(
      page.getByRole("button", { name: /^upload$/i }).first(),
    ).toBeAttached({ timeout: 10_000 });
  });

  test("does NOT offer 'This device' when not running as desktop", async ({
    page,
  }) => {
    await page.goto("/cert-sign");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, SAMPLE_PDF);

    await expect(
      page.getByRole("button", { name: /^upload$/i }).first(),
    ).toBeAttached({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /this device/i }),
    ).toHaveCount(0);
  });
});

test.describe("CertSign tool - hardware on mac/Linux (no Windows store)", () => {
  test.use({ autoGoto: false });

  test("'This device' goes straight to the USB-token path, no Windows-store toggle", async ({
    page,
  }) => {
    await page.route("**/api/v1/config/app-config", (route: Route) =>
      route.fulfill({ json: DESKTOP_APP_CONFIG }),
    );
    await page.route(
      "**/api/v1/security/cert-sign/hardware/capabilities",
      (route: Route) =>
        route.fulfill({
          json: {
            desktop: true,
            osName: "macOS 14",
            windowsStoreSupported: false,
            pkcs11Supported: true,
            detectedLibraries: [
              {
                name: "OpenSC",
                path: "/Library/OpenSC/lib/opensc-pkcs11.so",
              },
            ],
          },
        }),
    );

    await page.goto("/cert-sign");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, SAMPLE_PDF);

    const deviceBtn = page.getByRole("button", { name: /this device/i });
    await expect(deviceBtn).toBeVisible({ timeout: 10_000 });
    await deviceBtn.click();

    // Only one hardware kind applies -> no Windows-store toggle.
    await expect(
      page.getByRole("button", { name: /windows certificate store/i }),
    ).toHaveCount(0);
    // The USB-token (PKCS#11) driver picker is shown instead.
    await expect(page.getByText(/PKCS#11 driver/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("CertSign tool - server deployment (no hardware)", () => {
  test.use({ autoGoto: false });

  test("offers Server but never 'This device' when an org cert is configured", async ({
    page,
  }) => {
    // Non-desktop instance with a configured server certificate: Upload + Server, no hardware.
    await page.route("**/api/v1/config/app-config", (route: Route) =>
      route.fulfill({
        json: {
          enableLogin: false,
          isAdmin: false,
          languages: ["en-GB"],
          defaultLocale: "en-GB",
          hardwareSigningAvailable: false,
          serverCertificateEnabled: true,
        },
      }),
    );

    await page.goto("/cert-sign");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, SAMPLE_PDF);

    await expect(
      page.getByRole("button", { name: /^upload$/i }).first(),
    ).toBeAttached({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /^server$/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /this device/i }),
    ).toHaveCount(0);
  });
});

test.describe("CertSign tool - hardware signing (desktop)", () => {
  test.use({ autoGoto: false });

  test("offers 'This device' and lists Windows store certificates", async ({
    page,
  }) => {
    // Override app-config BEFORE bootstrap so hardwareSigningAvailable is true.
    await page.route("**/api/v1/config/app-config", (route: Route) =>
      route.fulfill({ json: DESKTOP_APP_CONFIG }),
    );
    await mockHardwareEndpoints(page);

    await page.goto("/cert-sign");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, SAMPLE_PDF);

    // The desktop-only source appears.
    const deviceBtn = page.getByRole("button", { name: /this device/i });
    await expect(deviceBtn).toBeVisible({ timeout: 10_000 });
    await deviceBtn.click();

    // The Windows store / USB token kind toggle renders.
    await expect(
      page.getByRole("button", { name: /windows certificate store/i }),
    ).toBeVisible({ timeout: 10_000 });

    // The single enumerated cert is auto-selected into the picker input.
    await expect(
      page.getByRole("textbox", { name: /^certificate$/i }),
    ).toHaveValue(/Anthony Stirling/, { timeout: 10_000 });
  });
});
