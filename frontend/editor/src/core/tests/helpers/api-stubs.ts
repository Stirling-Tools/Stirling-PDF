import type { BrowserContext, Page, Route } from "@playwright/test";

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
  /** Override `isAdmin` in app-config. Default `false`. */
  isAdmin?: boolean;
  /** Null leaves the server analytics choice unconfigured. */
  enableAnalytics?: boolean | null;
  /** Override `enableMobileScanner`. Default `true`. */
  enableMobileScanner?: boolean;
  /** Override the logged-in user returned by `/auth/me`. */
  user?: {
    id?: number;
    username?: string;
    email?: string;
    roles?: string[];
    /** Spring role string (e.g. "ROLE_ADMIN") — drives `isAdmin` in the auth seam. */
    role?: string;
    /** Portal (Processor) access flag — gates the super search's Processor lanes. */
    portalAccess?: boolean;
    orgOwner?: boolean;
  } | null;
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
 * Answers every `/api/v1` request no other route claims with the empty 500 the
 * dev proxy sends when no backend is listening. A request that reaches the proxy
 * instead hits whatever backend runs locally, and in CI a large upload can hang
 * there and crash the Chromium renderer.
 *
 * Register it before any other route on the context, so it is the last handler
 * Playwright tries.
 */
export async function fulfillUnstubbedApis(
  context: BrowserContext,
): Promise<void> {
  await context.route("**/api/v1/**", (route: Route) =>
    route.fulfill({ status: 500, contentType: "text/plain", body: "" }),
  );
}

/**
 * Register stub routes for the endpoints the app calls during bootstrap.
 * Call this inside `test.beforeEach` before any `page.goto(...)`.
 */
export interface AppApiStub {
  /** Playwright URL glob, also matched by the perf harness's HTTP stub server. */
  glob: string;
  body: unknown;
}

/**
 * The bootstrap API table, shared by the Playwright helper and the perf
 * harness's HTTP stub server so both measure the same UI.
 */
export function appApiStubs(opts: MockAppApiOptions = {}): AppApiStub[] {
  const {
    enableLogin = false,
    isAdmin = false,
    enableAnalytics = false,
    enableMobileScanner = true,
    user = {
      id: 1,
      username: "testuser",
      email: "test@example.com",
      roles: ["ROLE_USER"],
    },
    languages = ["en-US"],
    defaultLocale = "en-US",
    endpointsAvailability = {},
    backendStatus = "UP",
  } = opts;
  const endpoints = {
    ...DEFAULT_ENDPOINTS_AVAILABILITY,
    ...endpointsAvailability,
  };

  return [
    {
      glob: "**/api/v1/security/inspect-pdf-security",
      body: {
        encrypted: false,
        signed: false,
        ownerAuthenticated: false,
        permissions: -4,
        canModify: true,
        canAssemble: true,
        pageCount: 1,
      },
    },
    { glob: "**/api/v1/info/status", body: { status: backendStatus } },
    {
      glob: "**/api/v1/config/app-config",
      body: {
        enableLogin,
        isAdmin,
        enableAnalytics,
        enableMobileScanner,
        languages,
        defaultLocale,
      },
    },
    {
      glob: "**/api/v1/config/public-config",
      body: { enableLogin, languages, defaultLocale },
    },
    { glob: "**/api/v1/auth/me", body: { user } },
    { glob: "**/api/v1/team/my", body: [] },
    { glob: "**/api/v1/config/endpoints-availability", body: endpoints },
    { glob: "**/api/v1/config/endpoints-enabled", body: endpoints },
    { glob: "**/api/v1/config/endpoint-enabled*", body: true },
    { glob: "**/api/v1/config/group-enabled*", body: true },
    { glob: "**/api/v1/config/login-disclaimer*", body: { enabled: false } },
    { glob: "**/api/v1/ui-data/footer-info", body: {} },
    {
      glob: "**/api/v1/proprietary/ui-data/login",
      body: { enabled: enableLogin, loginMethod: "form" },
    },
    { glob: "**/api/v1/proprietary/ui-data/account", body: user },
    { glob: "**/api/v1/proprietary/**", body: {} },
    {
      glob: "**/api/v1/admin/license-info",
      body: { licenseType: "FREE", valid: true, maxUsers: 5 },
    },
    { glob: "**/api/v1/admin/settings", body: {} },
    { glob: "**/api/v1/admin/settings/section/**", body: {} },
    {
      glob: "**/api/v1/admin/settings/section/aiEngine",
      body: {
        enabled: false,
        url: "http://stirling-pdf-engine:5001",
        rag: { embeddingProvider: "voyageai", embeddingModel: "voyage-3" },
      },
    },
    {
      glob: "**/api/v1/admin/settings/policies/implied-folder-roots",
      body: { impliedRoots: [] },
    },
    {
      glob: "**/api/v1/admin/login-agreement/**",
      body: { content: "", enabled: false },
    },
    { glob: "**/api/v1/ui-data/tessdata-languages", body: { languages: [] } },
    { glob: "**/api/v1/info/wau", body: { count: 0 } },
    { glob: "**/api/v1/policies", body: [] },
    { glob: "**/api/v1/policies/runs", body: [] },
    { glob: "**/api/v1/processing-folders", body: [] },
    {
      glob: "**/api/v1/processing-folders/downloads-suggestion",
      body: { directory: "", available: false, pdfCount: 0, limit: 0 },
    },
    { glob: "**/api/v1/notifications*", body: { notifications: [] } },
  ];
}

/**
 * Register stub routes for the endpoints the app calls during bootstrap.
 * Call this inside `test.beforeEach` before any `page.goto(...)`.
 */
export async function mockAppApis(
  page: Page,
  opts: MockAppApiOptions = {},
): Promise<void> {
  for (const stub of appApiStubs(opts)) {
    await page.route(stub.glob, (route: Route) =>
      route.fulfill({ json: stub.body }),
    );
  }
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
