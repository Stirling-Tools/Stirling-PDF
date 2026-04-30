import type { Page, Route } from "@playwright/test";

/**
 * Shared Playwright API stubs for Stirling-PDF E2E tests.
 *
 * Import `mockAppApis(page)` from this module in any spec that doesn't need
 * a real backend. The helper installs `page.route()` handlers for the
 * endpoints the React app hits during bootstrap so the UI renders without
 * `ECONNREFUSED` proxy errors from the Vite dev server.
 *
 * Specs that mock tool-specific endpoints (e.g. `/api/v1/convert/pdf/img`)
 * should call `mockAppApis` first, then register their own narrower routes
 * before navigation. Playwright uses last-registered-wins for overlapping
 * patterns.
 */

/**
 * URL-path slugs for backend endpoints under `/api/v1/`. Used only to seed
 * the stub responses for `endpoints-availability` and `endpoints-enabled`
 * so the React app sees a populated map at startup.
 *
 * NOTE: this is *not* the frontend tool-registry IDs and several entries
 * here have already drifted from the real registry endpoints (e.g. `merge`
 * vs `merge-pdfs`, `compress` vs `compress-pdf`, `ocr` vs `ocr-pdf`).
 * Tests still pass because the frontend's `useEndpointConfig` defaults
 * absent keys to `enabled: true`, so a wrong key is functionally the same
 * as a missing key — every endpoint reports enabled either way.
 *
 * TODO: derive this from `getAllApplicationEndpoints(registry, …)` instead
 * of hand-maintaining it. That requires extracting endpoint metadata out of
 * `useTranslatedToolRegistry` (currently a React hook with deep i18n + tool
 * component imports — can't be called from Node-side Playwright setup) into
 * a pure-data module both the hook and this helper can import.
 */
const ALL_BACKEND_ENDPOINTS = [
  "pdf-to-img",
  "img-to-pdf",
  "pdf-to-word",
  "file-to-pdf",
  "pdf-to-text",
  "pdf-to-html",
  "pdf-to-xml",
  "pdf-to-csv",
  "pdf-to-xlsx",
  "pdf-to-pdfa",
  "pdf-to-pdfx",
  "pdf-to-presentation",
  "pdf-to-markdown",
  "pdf-to-cbz",
  "pdf-to-cbr",
  "pdf-to-epub",
  "html-to-pdf",
  "svg-to-pdf",
  "markdown-to-pdf",
  "eml-to-pdf",
  "cbz-to-pdf",
  "cbr-to-pdf",
  "add-password",
  "remove-password",
  "change-permissions",
  "watermark",
  "sanitize",
  "split",
  "merge",
  "convert",
  "ocr",
  "add-image",
  "rotate",
  "annotate",
  "scanner-image-split",
  "edit-table-of-contents",
  "scanner-effect",
  "auto-rename",
  "page-layout",
  "scale-pages",
  "adjust-contrast",
  "crop",
  "pdf-to-single-page",
  "repair",
  "compare",
  "add-page-numbers",
  "redact",
  "flatten",
  "remove-cert-sign",
  "unlock-pdf-forms",
  "compress",
  "sign",
  "cert-sign",
  "add-text",
  "remove-pages",
  "remove-blanks",
  "remove-annotations",
  "remove-image",
  "extract-pages",
  "reorganize-pages",
  "extract-images",
  "add-stamp",
  "add-attachments",
  "change-metadata",
  "overlay-pdfs",
  "get-pdf-info",
  "validate-signature",
  "timestamp-pdf",
  "replace-color",
  "show-j-s",
  "booklet-imposition",
  "pdf-text-editor",
  "form-fill",
  "multi-tool",
  "read",
  "automate",
];

const DEFAULT_ENDPOINTS_AVAILABILITY = Object.fromEntries(
  ALL_BACKEND_ENDPOINTS.map((k) => [k, { enabled: true }]),
);

export interface MockAppApiOptions {
  /** Override `enableLogin`. Default `false` — app loads in anonymous mode. */
  enableLogin?: boolean;
  /** Override the logged-in user returned by `/auth/me`. */
  user?: {
    id?: number;
    username?: string;
    email?: string;
    roles?: string[];
  };
  /** Languages advertised by `/config/app-config`. */
  languages?: string[];
  /** Default locale. */
  defaultLocale?: string;
  /** Merge overrides into the endpoint availability map. */
  endpointsAvailability?: Record<string, { enabled: boolean }>;
  /** Backend probe status. Set to `"DOWN"` to exercise offline-mode UI. */
  backendStatus?: "UP" | "DOWN";
}

/**
 * Register stub routes for the endpoints the app calls during bootstrap.
 * Call this inside `test.beforeEach` before any `page.goto(...)`.
 */
export async function mockAppApis(
  page: Page,
  opts: MockAppApiOptions = {},
): Promise<void> {
  const {
    enableLogin = false,
    user = {
      id: 1,
      username: "testuser",
      email: "test@example.com",
      roles: ["ROLE_USER"],
    },
    languages = ["en-GB"],
    defaultLocale = "en-GB",
    endpointsAvailability = {},
    backendStatus = "UP",
  } = opts;

  // Backend liveness probe — determines whether the UI shows the app or an offline screen
  await page.route("**/api/v1/info/status", (route: Route) =>
    route.fulfill({ json: { status: backendStatus } }),
  );

  // App config — drives the login flow, language list, and feature flags the UI reads at startup
  await page.route("**/api/v1/config/app-config", (route: Route) =>
    route.fulfill({
      json: {
        enableLogin,
        languages,
        defaultLocale,
      },
    }),
  );

  await page.route("**/api/v1/config/public-config", (route: Route) =>
    route.fulfill({ json: { enableLogin, languages, defaultLocale } }),
  );

  // Current user — anonymous by default, configurable for authenticated flows
  await page.route("**/api/v1/auth/me", (route: Route) =>
    route.fulfill({ json: user }),
  );

  // Tool availability — every tool enabled unless overridden
  await page.route("**/api/v1/config/endpoints-availability", (route: Route) =>
    route.fulfill({
      json: { ...DEFAULT_ENDPOINTS_AVAILABILITY, ...endpointsAvailability },
    }),
  );

  await page.route("**/api/v1/config/endpoints-enabled", (route: Route) =>
    route.fulfill({
      json: { ...DEFAULT_ENDPOINTS_AVAILABILITY, ...endpointsAvailability },
    }),
  );

  // Per-endpoint check hit by tool pages before enabling the run button
  await page.route("**/api/v1/config/endpoint-enabled*", (route: Route) =>
    route.fulfill({ json: true }),
  );

  await page.route("**/api/v1/config/group-enabled*", (route: Route) =>
    route.fulfill({ json: true }),
  );

  // Footer / branding — non-critical but proxied, so stub to avoid noise
  await page.route("**/api/v1/ui-data/footer-info", (route: Route) =>
    route.fulfill({ json: {} }),
  );

  // Proprietary bucket (login UI, audit, teams, …) — catch-all so the Vite
  // proxy doesn't log ECONNREFUSED for every call we haven't individually
  // stubbed. Specs can override with a narrower route registered afterwards.
  await page.route("**/api/v1/proprietary/ui-data/login", (route: Route) =>
    route.fulfill({
      json: { enabled: enableLogin, loginMethod: "form" },
    }),
  );

  await page.route("**/api/v1/proprietary/ui-data/account", (route: Route) =>
    route.fulfill({ json: user }),
  );

  await page.route("**/api/v1/proprietary/**", (route: Route) =>
    route.fulfill({ json: {} }),
  );

  // Settings sections touched by the settings page
  await page.route("**/api/v1/admin/settings", (route: Route) =>
    route.fulfill({ json: {} }),
  );

  await page.route("**/api/v1/admin/settings/section/**", (route: Route) =>
    route.fulfill({ json: {} }),
  );

  // Info sub-resources
  await page.route("**/api/v1/info/wau", (route: Route) =>
    route.fulfill({ json: { count: 0 } }),
  );
}

/**
 * Prevent the onboarding modal from appearing by seeding localStorage
 * before the React app boots.
 */
export async function skipOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("onboarding::completed", "true");
    localStorage.setItem("onboarding::tours-tooltip-shown", "true");
  });
}

/**
 * Stronger variant of {@link skipOnboarding}: also sets the session
 * `onboarding::bypass-all` flag honoured by `useBypassOnboarding`. This
 * suppresses the analytics opt-in modal, MFA setup prompt, and any other
 * onboarding step the orchestrator may try to render. Use this in specs
 * where SSO callbacks land on a page that would otherwise show overlays
 * intercepting clicks.
 */
export async function bypassOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("onboarding::bypass-all", "true");
      localStorage.setItem("onboarding::completed", "true");
      localStorage.setItem("onboarding::tours-tooltip-shown", "true");
    } catch {
      /* sessionStorage may be unavailable in some contexts — ignore */
    }
  });
}

/**
 * Seed the cookie-consent cookie so the banner (#cc-main) never renders.
 * The banner overlays the viewport and intercepts clicks on firefox/webkit.
 */
export async function seedCookieConsent(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: "cc_cookie",
      value: JSON.stringify({
        categories: ["necessary"],
        revision: 0,
        data: null,
        rfc_cookie: false,
        consentTimestamp: new Date().toISOString(),
        consentId: "playwright-test",
      }),
      domain: "localhost",
      path: "/",
    },
  ]);
}

/**
 * Close the tour tooltip if it's visible. The tooltip can intercept clicks
 * on firefox/webkit even when invisible on chromium.
 */
export async function dismissTourTooltip(page: Page): Promise<void> {
  const closeBtn = page.getByRole("button", { name: /close tooltip/i }).first();
  if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeBtn.click();
  }
}
