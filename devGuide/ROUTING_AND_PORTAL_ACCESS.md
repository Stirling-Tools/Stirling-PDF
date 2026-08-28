# Routing, base paths and Processor access

Three rules that the editor's routing depends on. Each has bitten a subpath or
SaaS deploy, so the tests named below exist to keep them honest.

## 1. Two path spaces: browser and router

The app can be served under a subpath (`SYSTEM_ROOTURIPATH=/app` on self-hosted,
`RUN_SUBPATH=app` at build time). When it is, `index.html` carries
`<base href="/app/">`, `BASE_PATH` resolves to `/app`, and the app mounts as
`<BrowserRouter basename={BASE_PATH}>`.

That leaves two different kinds of path, and mixing them is the single most
common subpath bug:

| Space | Example under `/app` | Where it appears |
| --- | --- | --- |
| Browser | `/app/compress` | `window.location.pathname`, `<a href>`, `window.location.href` |
| Router | `/compress` | `useLocation()`, `navigate()`, `<Route path>`, `<Navigate to>` |

`react-router` applies the basename itself, so handing it a browser path
double-prefixes: `navigate("/app/compress")` under `basename="/app"` lands on
`/app/app/compress`.

Converting between them, both from `@app/constants/app`:

- `withBasePath(routerPath)` - router space to browser space. Use when assigning
  `window.location.href` or building an `href`.
- `stripBasePath(browserPath)` - browser space to router space. Use whenever you
  read `window.location.pathname` and then compare it to a route or feed it to
  `navigate()`.

**Rule:** anything read from `window.location` and later replayed through the
router must go through `stripBasePath` first. This applies to post-login return
paths in particular, since they are captured from `window.location` at the time
of a 401 and replayed with `navigate()` after sign-in.

Covered by `src/core/services/httpErrorHandler.basePath.test.ts`.

## 2. The URL outranks the startup-view preference

`Settings > General > Default startup view` (`defaultStartupView`, stored per
browser in `localStorage` under `stirlingpdf_preferences`) chooses what the
editor shows when you arrive at its home. It selects a tool, which is how the
Reader and Automate views are entered.

Two constraints follow, both enforced in
`src/core/contexts/ToolWorkflowContext.tsx` and `src/core/hooks/useUrlSync.ts`:

- It applies **only at the editor home** (`/` in core and desktop builds,
  `EDITOR_BASENAME` elsewhere). A deep link such as `/compress` names its own
  destination, and the preference must not override it.
- The selection it makes **is not written to the URL**. It sets the view, not the
  address. `useNavigationUrlSync` receives the applied tool via
  `startupSelectedToolRef` and skips the URL write for it.

The marker deliberately survives until the selection moves off that tool, rather
than being consumed on first sight: the URL-writing effect re-runs whenever the
tool registry identity changes, and a marker consumed on the first run lets the
second run write the address anyway.

Covered by `src/core/hooks/useUrlSync.test.tsx`.

## 3. Processor access comes from the backend, over the configured API base

Access to the Processor is granted by the backend, not by Supabase claims. It
arrives as `portalAccess` on `/api/v1/auth/me`, and it is what
`RequirePortalAccess` (self-hosted) and `SaasPortalGate` (SaaS) gate on.

The SaaS portal mounts outside the editor's providers with its own
`AuthProvider mode="supabase"`, so `src/proprietary/auth/supabase/UseSession.tsx`
fetches `/me` directly rather than through `apiClient`. It still has to honour
the same API base:

- SaaS serves the frontend and the API from **different hosts**
  (`VITE_API_BASE_URL`, for example `https://api.example.com`). A root-relative
  `fetch("/api/v1/auth/me")` resolves against the page origin and never reaches
  the API.
- A non-ok response must reach the failure path. Resolving it to `null` and
  returning early leaves `portalAccess` `undefined`, which `SaasPortalGate`
  reads as "access not known yet" and renders as a spinner that never resolves.

When the lookup genuinely fails, `portalAccess` falls back to the role check.
That is deliberate and fails closed: a grant-based, non-admin user is denied
while `/me` is unreachable, because grants cannot be known without it. A later
refetch on tab focus recovers access.

Both failure shapes are visible to the user as a redirect to the editor, because
`SaasPortalGate` bounces with `window.location.href = EDITOR_URL` and shows no
denial state. Keep that in mind when diagnosing "the Processor sends me to the
editor" reports: it is an access result, not a routing loop.

Covered by `src/proprietary/auth/supabase/portalAccessFetch.test.tsx`.

## Flavour layering

`@app/*` resolves through the build's layer chain, so a file can be shadowed per
flavour. `frontend/editor/src/saas/tsconfig.json` resolves
`saas > cloud > proprietary > core`. Two consequences worth remembering:

- A fix applied to `src/proprietary/services/apiClientSetup.ts` does not reach a
  SaaS build, because `src/saas/services/apiClientSetup.ts` shadows it.
- `src/core/services/httpErrorHandler.ts` has no SaaS override, so it does run on
  SaaS. It writes both `?from=` and the `stirling_post_login_path` stash, but
  SaaS's `Login.tsx` reads only `?next=`, so the return path is currently
  discarded there.

Check which layer actually ships before assuming a change lands.
