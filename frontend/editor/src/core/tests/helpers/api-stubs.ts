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
 * One bootstrap stub: the URL glob Playwright registers it under and the JSON
 * body the app receives. Playwright-free on purpose — the UI walkthrough's stub
 * backend serves this same table over HTTP, so an audit that cannot use
 * Playwright routes (Lighthouse drives its own browser) renders the same app
 * instead of a second, drifting copy of these responses.
 */
export interface AppApiStub {
  /** Playwright URL glob. The stub backend matches the same globs on a path. */
  glob: string;
  /** JSON body the app receives. */
  body: unknown;
}

/**
 * Stubs for the endpoints the app calls during bootstrap.
 *
 * Order matters: Playwright keeps the last handler matching a request, so a
 * broad glob registered later wins over a narrower one registered earlier. The
 * stub backend reproduces this by scanning the table in reverse.
 */
export function appApiStubs(opts: MockAppApiOptions = {}): AppApiStub[] {
  const {
    enableLogin = false,
    isAdmin = false,
    enableAnalytics = false,
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
    // Liveness probe — decides whether the UI shows the app or an offline screen
    { glob: "**/api/v1/info/status", body: { status: backendStatus } },
    // App config — login flow, language list, and startup feature flags
    {
      glob: "**/api/v1/config/app-config",
      body: { enableLogin, isAdmin, enableAnalytics, languages, defaultLocale },
    },
    {
      glob: "**/api/v1/config/public-config",
      body: { enableLogin, languages, defaultLocale },
    },
    // Current user — anonymous by default, configurable for authenticated flows
    { glob: "**/api/v1/auth/me", body: { user } },
    // The signed-in user's teams. Unstubbed this 401s, and the API client reads
    // a 401 here as an expired session: refresh, fail, bounce to /login — so
    // any page that asks (login-landing setting, account tab) logs out.
    { glob: "**/api/v1/team/my", body: [] },
    // Tool availability — every tool enabled unless overridden
    { glob: "**/api/v1/config/endpoints-availability", body: endpoints },
    { glob: "**/api/v1/config/endpoints-enabled", body: endpoints },
    // Per-endpoint check hit by tool pages before enabling the run button
    { glob: "**/api/v1/config/endpoint-enabled*", body: true },
    { glob: "**/api/v1/config/group-enabled*", body: true },
    // Login agreement / disclaimer — disabled so the blocking modal never
    // shows; specs exercising it register a narrower route afterwards.
    { glob: "**/api/v1/config/login-disclaimer*", body: { enabled: false } },
    // Footer / branding — non-critical but proxied, so stub to avoid noise
    { glob: "**/api/v1/ui-data/footer-info", body: {} },
    // Proprietary bucket (login UI, audit, teams, …)
    {
      glob: "**/api/v1/proprietary/ui-data/login",
      body: { enabled: enableLogin, loginMethod: "form" },
    },
    { glob: "**/api/v1/proprietary/ui-data/account", body: user },
    // Catch-all so the Vite proxy doesn't log ECONNREFUSED for every call we
    // haven't individually stubbed.
    { glob: "**/api/v1/proprietary/**", body: {} },
    // License info — stubbed so admin settings doesn't log proxy errors
    {
      glob: "**/api/v1/admin/license-info",
      body: { licenseType: "FREE", valid: true, maxUsers: 5 },
    },
    // Settings sections touched by the settings page
    { glob: "**/api/v1/admin/settings", body: {} },
    { glob: "**/api/v1/admin/settings/section/**", body: {} },
    // An empty section never gets a dirty-tracking snapshot, so anything that
    // compares saved-vs-current reads as unchanged. Give aiEngine real values.
    {
      glob: "**/api/v1/admin/settings/section/aiEngine",
      body: {
        enabled: false,
        url: "http://stirling-pdf-engine:5001",
        rag: { embeddingProvider: "voyageai", embeddingModel: "voyage-3" },
      },
    },
    // Folder access reads this on every visit to the System page; unstubbed it
    // 401s in a retry loop and the refresh failures sign the session out.
    {
      glob: "**/api/v1/admin/settings/policies/implied-folder-roots",
      body: { impliedRoots: [] },
    },
    // Same trap on the merged Legal and Advanced pages, which each pull in a
    // card that fetches on mount.
    {
      glob: "**/api/v1/admin/login-agreement/**",
      body: { content: "", enabled: false },
    },
    { glob: "**/api/v1/ui-data/tessdata-languages", body: { languages: [] } },
    // Info sub-resources
    { glob: "**/api/v1/info/wau", body: { count: 0 } },
    // Policies (proprietary): the reconcile fires GET /api/v1/policies on app
    // load. An empty list keeps the stubbed (backend-free) env clean — no
    // failed request polluting the console, and the auto-run controller has
    // nothing to dispatch.
    { glob: "**/api/v1/policies", body: [] },
    // The controller also reconciles server-side runs on load via
    // GET /api/v1/policies/runs, which the glob above doesn't cover; unstubbed
    // it hits the absent backend and the console error fails the page's
    // no-unexpected-output guard.
    { glob: "**/api/v1/policies/runs", body: [] },
    { glob: "**/api/v1/processing-folders", body: [] },
    {
      glob: "**/api/v1/processing-folders/downloads-suggestion",
      body: { directory: "", available: false, pdfCount: 0, limit: 0 },
    },
    // The bell polls this on load. The hook swallows the failure, but the
    // browser still logs the request, which the console-hygiene guard counts.
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
