# Portal data layer — mock backend & handover

The portal is **mock-driven**. Every screen fetches real HTTP requests through a
thin typed API layer; in dev and Storybook those requests are intercepted by
[MSW](https://mswjs.io/) and answered with fixture data. Pointing the portal at a
**real backend** is a matter of *not registering MSW* — no component or API-layer
code changes.

The API layer calls the backend under `/api/v1/*` (the repo-wide convention). The
Stirling product API examples shown *inside* the portal UI — `/v1/extract`,
`/v1/invoice`, etc. — are a different surface (what customers call) and stay as-is.
In dev, `portal/vite.config.ts` proxies `/api` to the backend (default
`localhost:8080`, override with `BACKEND_URL`). Run both halves together with
**`task dev:portal`**, which spawns the backend and the portal on free ports and
wires the proxy automatically.

## The three layers

```
view (useAsync)  ──►  api/<surface>.ts  ──►  httpJson(fetch)  ──►  MSW handler (dev)   ──►  fixture builder
                          (the contract)                          └► real backend (prod) ─┘
```

1. **`api/<surface>.ts`** — thin, typed `httpJson` wrappers. **This is the backend
   contract.** Each function documents its endpoint (method, path, query params)
   and its response type. Nothing else in the app issues fetches.
2. **`mocks/handlers/<surface>.ts`** — MSW handlers that answer those endpoints
   with `mocks/<surface>.ts` fixtures. Registered in `mocks/handlers/index.ts`.
3. **`mocks/<surface>.ts`** — fixture builders **and the canonical TS types**
   (re-exported through `api/<surface>.ts`, so consumers import types from `api/`).

`api/http.ts` is the single `fetch` wrapper (sets headers, throws `HttpError` on
non-2xx). Views consume via `useAsync()` + `useSectionFlags()` (`hooks/useAsync.ts`).

## Conventions (consistent across every surface)

- **Tier**: tier-specific endpoints take `?tier=free|pro|enterprise`. The view
  passes `useTier().tier` and refetches on change (`useAsync(fn, [tier])`).
- **Latency**: handlers `await delay(120)` to exercise loading/skeleton states.
- **Read-only today**: surfaces are GET-driven. The few writes (mark-all-read,
  op run) exist; composer "Deploy", connect-source wizard, and create-key are
  **demo shells** (local state, no submit endpoint yet) — wire these to real
  POSTs during backend integration.

## Swapping in a real backend

The proxy is already wired (`portal/vite.config.ts` forwards `/api` to
`BACKEND_URL`), so a surface goes live the moment its mock handler is gone. The
incremental, per-surface flow:

1. Implement the surface's `/api/v1/*` endpoint(s) on the backend, matching the
   response shapes in `api/<surface>.ts` (**the exported types are the spec**).
2. Remove that surface's handler from `mocks/handlers/index.ts`. MSW is started
   with `onUnhandledRequest: "bypass"`, so its now-unhandled `/api/v1/*` calls
   fall through to the proxy and hit the backend — every *other* surface keeps
   serving fixtures.
3. Once a surface is live, delete its `mocks/<surface>.ts` fixtures. Optionally
   relocate the types into `api/` (or a `types/` module) so they no longer live
   beside fixtures — purely cosmetic; the `api/` re-exports already shield consumers.

To flip **all** surfaces to the network at once (full live check), use the header
"Mocks" toggle — it persists the choice and reloads. Mocks default ON in dev / OFF
in production (`mocks/preference.ts`).

## Endpoint catalogue

| Surface | Method & path | Query | API fn | Response type |
|---|---|---|---|---|
| Home | `GET /api/v1/home/kpis` | `tier` | `fetchHomeKpis` | `KpiEntry[]` |
| Home | `GET /api/v1/analytics/usage` | — | `fetchUsageSeries` | `UsageSeriesResponse` |
| Home | `GET /api/v1/activity` | — | `fetchRecentActivity` | `ActivityEvent[]` |
| Home | `GET /api/v1/regions/health` | — | `fetchRegionHealth` | `RegionHealth[]` |
| Home | `GET /api/v1/onboarding` | — | `fetchOnboarding` | `OnboardingStep[]` |
| Documents | `GET /api/v1/endpoints` | `vertical?` | `fetchVerticals` | `Vertical[]` |
| Pipelines | `GET /api/v1/pipelines` | `tier` | `fetchPipelines` | `PipelinesResponse` |
| Sources | `GET /api/v1/sources` | `tier` | `fetchSources` | `SourcesResponse` |
| Infrastructure | `GET /api/v1/infrastructure/deployments` | `tier` | `fetchDeployments` | `DeploymentsResponse` |
| Infrastructure | `GET /api/v1/infrastructure/api-keys` | `tier` | `fetchApiKeys` | `ApiKey[]` |
| Infrastructure | `GET /api/v1/infrastructure/security` | `tier` | `fetchSecurity` | `SecurityConfig` |
| Infrastructure | `GET /api/v1/infrastructure/storage` | `tier` | `fetchStorage` | `StorageConfig` |
| Infrastructure | `GET /api/v1/infrastructure/audit-log` | `tier` | `fetchAuditLog` | `AuditLogResponse` |
| Usage & Billing | `GET /api/v1/billing/usage` | — | `fetchBillingUsage` | `UsageSeriesResponse` |
| Usage & Billing | `GET /api/v1/billing/summary` | `tier` | `fetchBillingSummary` | `BillingSummary` |
| Usage & Billing | `GET /api/v1/billing/plans` | — | `fetchPlanOptions` | `PlanOption[]` |
| Usage & Billing | `GET /api/v1/billing/history` | `tier` | `fetchBillingHistory` | `BillingHistoryRow[]` |
| Developer Docs | `GET /api/v1/docs/nav` | — | `fetchDocsNav` | `DocsNavSection[]` |
| Settings | `GET /api/v1/settings` | `tier` | `fetchSettings` | `UserSettings` |
| Notifications | `GET /api/v1/notifications` · `POST /api/v1/notifications/mark-all-read` | — | — | `Notification[]` |
| Ops | `GET /api/v1/ops/featured` · `POST /api/v1/ops/:opId/run` | — | — | — |
| Assistant | `GET /api/v1/assistant/suggestions` · `POST /api/v1/assistant/messages` | — | — | — |
| Search | `GET /api/v1/search/quick-actions` | — | — | — |

> Catalogue generated from `mocks/handlers/*.ts`. The `api/<surface>.ts` JSDoc on
> each function is the authoritative per-endpoint reference.
