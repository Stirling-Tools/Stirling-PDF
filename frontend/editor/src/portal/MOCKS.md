# Portal data layer — mock backend & handover

The portal is **mock-driven**. Every screen fetches real HTTP requests through a
thin typed API layer; in dev and Storybook those requests are intercepted by
[MSW](https://mswjs.io/) and answered with fixture data. Pointing the portal at a
**real backend** is a matter of *not registering MSW* — no component or API-layer
code changes.

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

1. Stop registering MSW (`mocks/browser.ts` / the dev bootstrap) — or gate it on
   an env flag (it's already dev-only via `import.meta.env.DEV`).
2. Make `httpJson` hit your API origin (add a `baseURL`/proxy in `api/http.ts`).
3. Match the response shapes in `api/<surface>.ts` (the exported types are the spec).
4. Delete `mocks/` once parity is confirmed. Optionally relocate the types from
   `mocks/<surface>.ts` into `api/` (or a `types/` module) so they no longer live
   beside fixtures — purely cosmetic; the `api/` re-exports already shield consumers.

## Endpoint catalogue

| Surface | Method & path | Query | API fn | Response type |
|---|---|---|---|---|
| Home | `GET /v1/home/kpis` | `tier` | `fetchHomeKpis` | `KpiEntry[]` |
| Home | `GET /v1/analytics/usage` | — | `fetchUsageSeries` | `UsageSeriesResponse` |
| Home | `GET /v1/activity` | — | `fetchRecentActivity` | `ActivityEvent[]` |
| Home | `GET /v1/regions/health` | — | `fetchRegionHealth` | `RegionHealth[]` |
| Home | `GET /v1/onboarding` | — | `fetchOnboarding` | `OnboardingStep[]` |
| Users | `GET /v1/users` | `tier` | `fetchUsers` | `UsersResponse` |
| Documents | `GET /v1/documents` | `tier` | `fetchDocuments` | `DocumentsResponse` |
| Pipelines | `GET /v1/pipelines` · `POST /v1/pipelines/:id/promote-to-policy` | `tier` | `fetchPipelines` · `promoteToPolicy` | `PipelinesResponse` |
| Policies | `GET/POST /api/v1/policies` · `GET/DELETE /api/v1/policies/{id}` · `POST /api/v1/policies/{id}/run` | — | `fetchPolicies` · `savePolicy` · `deletePolicy` · `runPolicy` | `PoliciesResponse` · `Policy` |
| Agent Builder | `GET /v1/agents` | `tier` | `fetchAgents` | `AgentsResponse` |
| Sources | `GET /v1/sources` | `tier` | `fetchSources` | `SourcesResponse` |
| Components | `GET /v1/components` | `tier` | `fetchComponents` | `ComponentsResponse` |
| Infrastructure | `GET /v1/infrastructure/deployments` | `tier` | `fetchDeployments` | `DeploymentsResponse` |
| Infrastructure | `GET /v1/infrastructure/api-keys` | `tier` | `fetchApiKeys` | `ApiKey[]` |
| Infrastructure | `GET /v1/infrastructure/security` | `tier` | `fetchSecurity` | `SecurityConfig` |
| Infrastructure | `GET /v1/infrastructure/models` | `tier` | `fetchModels` | `ModelsResponse` |
| Infrastructure | `GET /v1/infrastructure/storage` | `tier` | `fetchStorage` | `StorageConfig` |
| Infrastructure | `GET /v1/infrastructure/audit-log` | `tier` | `fetchAuditLog` | `AuditLogResponse` |
| Usage & Billing | `GET /v1/billing/usage` | — | `fetchBillingUsage` | `UsageSeriesResponse` |
| Usage & Billing | `GET /v1/billing/summary` | `tier` | `fetchBillingSummary` | `BillingSummary` |
| Usage & Billing | `GET /v1/billing/plans` | — | `fetchPlanOptions` | `PlanOption[]` |
| Usage & Billing | `GET /v1/billing/history` | `tier` | `fetchBillingHistory` | `BillingHistoryRow[]` |
| Developer Docs | `GET /v1/docs/nav` | — | `fetchDocsNav` | `DocsNavSection[]` |
| Editor | `GET /v1/editor/deployment` | `tier` | `fetchEditorDeployment` | `EditorDeploymentResponse` |
| Settings | `GET /v1/settings` | `tier` | `fetchSettings` | `UserSettings` |
| Notifications | `GET /v1/notifications` · `POST /v1/notifications/mark-all-read` | — | — | `Notification[]` |
| Ops | `GET /v1/ops/featured` · `POST /v1/ops/:opId/run` | — | — | — |
| Assistant | `GET /v1/assistant/suggestions` · `POST /v1/assistant/messages` | — | — | — |
| Search | `GET /v1/search/quick-actions` | — | — | — |

> Catalogue generated from `mocks/handlers/*.ts`. The `api/<surface>.ts` JSDoc on
> each function is the authoritative per-endpoint reference.
>
> **Policies** targets the **real** backend base `/api/v1/policies` (Stirling's
> `PolicyController`) rather than the mock `/v1/...` convention — its contract
> mirrors the live policy engine, so MSW can be dropped with no code change.
