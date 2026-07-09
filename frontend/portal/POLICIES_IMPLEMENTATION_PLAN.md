# Portal Policies — full implementation plan

> **Goal.** Make the portal's Policies surface the real org/team admin plane for
> Stirling policies: an admin authors a policy in the portal, it persists to the
> live `/api/v1/policies` backend, and every member's **editor** enforces it on
> upload/export — exactly as the editor's own policy UI does today, including the
> input and export modes.

---

## 1. Scope & ground rules

- **Policies are org-scoped (OSS) / team-scoped (SaaS) — functionally the same.**
  There is **no such thing as a personal policy.** Every policy applies to the
  whole org/team. The portal is the **admin/team-leader authoring + monitoring
  plane**; the editor is where members' documents actually get enforced.
- **SaaS-first.** Build and verify against the `saas` profile (team scoping via
  `TeamLeaderPolicyManagementAuthority`). OSS (`!saas`, global-admin scoping via
  `AdminPolicyManagementAuthority`) is the same contract with a different
  authority impl, so it comes along for free; we don't special-case it now.
- **Follow the editor.** The editor already reconciled the UI model with the
  backend. We mirror its mapping rather than invent a portal-specific one.

---

## 2. Current state (verified)

### 2a. Backend — already on `main`, ready
`app/proprietary/.../policy/`, gated by `@Profile("saas")`. Endpoints:

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/v1/policies` | `Policy` (JSON) | `Policy` (create if blank id, else update) |
| GET | `/api/v1/policies` | — | `List<Policy>` (filtered to caller's team) |
| GET | `/api/v1/policies/{id}` | — | `Policy` (404 if not in team) |
| DELETE | `/api/v1/policies/{id}` | — | 204 |
| POST | `/api/v1/policies/{id}/run` | multipart: `fileInput[]` + `assets[]` | `JobResponse<Void>` (runId) |
| POST | `/api/v1/policies/run` | multipart: `json` (PipelineDefinition) + files | runId |
| POST | `/api/v1/policies/run/stream` | multipart | `SseEmitter` |
| GET | `/api/v1/policies/run/{runId}` | — | `PolicyRunView` |
| GET | `/api/v1/policies/runs` | — | `List<PolicyRunView>` |

`Policy` record: `{ id, name, owner, enabled, trigger: TriggerConfig|null,
sources: InputSpec[], steps: PipelineStep[], output: OutputSpec, teamId }`.
`PipelineStep { operation /* endpoint path */, parameters, fileParameters }`.
`OutputSpec { type, options: Map<String,Object> }`.
`PolicyRunView { runId, policyId, status (PENDING|RUNNING|WAITING_FOR_INPUT|
COMPLETED|FAILED|CANCELLED), currentStep, stepCount, error, errorCode,
errorSubscribed, outputs[], createdAt }`.

**Authorization:** `PolicyManagementAuthority.canEditPolicies()` — team leader
(SaaS) or global admin (OSS). `PolicyAccessGuard.visible()` filters reads to the
caller's team; cross-team access → 404. `owner`/`teamId` are stamped
server-side on create and immutable on update. When `enableLogin=false`
(single-user) all checks pass — not relevant to the SaaS portal.

### 2b. Editor — the reference model
The editor never uses the backend's folder/schedule trigger. It sets
`trigger: null`, maps its tool chain to endpoint-path `steps`, and packs the
**entire UI model into `output.options`** (`policyPipeline.ts`):

```
output = {
  type: "inline",
  options: {
    runOn,                        // "upload" | "export"      ← INPUT MODE
    mode, name, position,         // new_file|new_version, rename text, prefix|suffix|auto-number  ← EXPORT MODE
    maxRetries, retryDelayMinutes,
    categoryId, sources, scopeTypes, reviewerEmail, fieldValues,  // policy metadata
    automation,                   // full editor AutomationConfig — lossless UI round-trip (editor-only)
  }
}
```

- **Input mode** (`runOn`): `upload` (enforce on file entry) | `export` (gate
  before a file leaves). **Export mode** (`mode`): `new_version` (versioned
  child, default) | `new_file`; with `name`/`position` rename rules.
- **Stats & activity** are derived client-side from `GET /api/v1/policies/runs`
  (`policyLiveData.ts`: `runsToStats`, `runsToActivity`) — not a backend
  resource.
- **Gating:** `canConfigure = !enableLogin || isTeamLeader || isAdmin`;
  non-admins see a read-only "Managed by your organization" state.

### 2c. Portal — close, but speaking the wrong wire dialect
`frontend/portal/src/` already: calls the real `/api/v1/policies` base; has a
stateful MSW mock; and has an authoring UX (`PolicySetupWizard`,
`PolicyDetailPanel`, `PolicyCategoryCard`, `CatalogueSummary`, `PolicyFieldRow`)
whose **UI state already matches the editor** (`runOn`, `outputMode`,
`outputName`, sources, scope, fields).

**But its wire serialization diverges from the backend/editor:**
- Portal sends `Policy` with top-level `categoryId`/`sources`, `trigger:{event}`,
  `output:{mode,name,namePosition}` — this won't deserialize into the backend
  record nor be enforceable by editor clients.
- Portal expects `GET` to return a decorated `{summary, catalogue}`; the backend
  returns a bare `List<Policy>`.
- `runPolicy` expects `{status,fileId,message}`; backend run is multipart-with-
  documents returning a job — and the portal has no files to send.

---

## 3. Decisions locked

1. **Mirror the editor's mapping** (`buildBackendPolicy`/`fromBackendPolicy`):
   `trigger:null`, endpoint-path `steps`, everything else in `output.options`.
2. **Catalogue/categories stay a frontend taxonomy.** The backend has no
   "category" concept (`categoryId` is just a string in `output.options`). The
   portal assembles the decorated catalogue client-side from static category
   defs + the decoded `List<Policy>`.
3. **Stats & activity derived from `GET /api/v1/policies/runs`** (the editor's
   approach). No new backend endpoints.
4. **No "Run Now" in the portal.** Runs need documents; the portal is a control
   plane. Policies execute in members' editors (on upload/export). Portal =
   author + monitor.
5. **Org/team scoping is the whole model.** Portal never sends `owner`/`teamId`
   (server stamps them); every policy is org/team-wide; members' editors get
   them read-only.

---

## 4. The central change — wire realignment + a shared core

The portal's UI state is right; only the **serialization** and the **GET
assembly** are wrong. Fix both by mirroring the editor and sharing the
dependency-free pieces so the two surfaces can't drift (they now write the same
records).

### 4a. Extract a shared, framework-free core → `frontend/shared/policies/`
- `types.ts` — the wire `Policy`, `PolicyRunView`, and the decoded frontend
  shape (`runOn`/`outputMode`/`outputName`/`position`/retries/`sources`/
  `scopeTypes`/`reviewerEmail`/`fieldValues`).
- `codec.ts` — `toWirePolicy()` / `fromWirePolicy()`, the `output.options`
  bag contract, lifted from the editor's `buildBackendPolicy`/`fromBackendPolicy`
  (minus the editor-only `automation` blob and toolRegistry coupling).
- `runs.ts` — `runsToStats()` / `runsToActivity()` from `PolicyRunView[]`.

**Not shared:** the editor's `toolRegistry` operation→endpoint mapping and
`AutomationConfig`. The portal stores endpoint-path steps directly, so it
doesn't need them. (Follow-up: have the editor consume the shared codec/types
too, so there's one contract. Out of scope for v1 — propose as a fast-follow.)

### 4b. Rework the portal data layer
- `api/policies.ts` — `savePolicy` sends `toWirePolicy(state)`; `fetchPolicies`
  becomes a client-side assembly: `GET /api/v1/policies` (decode each via
  `fromWirePolicy`) + static category defs + `GET /api/v1/policies/runs`
  (`runsToStats`/`runsToActivity`) → the `{summary, catalogue}` the UI consumes.
  Drop `runPolicy`.
- `mocks/handlers/policies.ts` — update the stateful mock to speak the **real**
  contract (return `List<Policy>` with the `output.options` bag; add a `/runs`
  handler returning `PolicyRunView[]`) so dev/Storybook still works and the
  swap-to-real is transparent.

---

## 5. Phased plan

### Phase 0 — Shared core + wire realignment (still on MSW)
Extract `shared/policies/*`; rewrite portal serialization + GET assembly + MSW to
the real contract. Portal behaves identically in dev but now speaks the backend's
dialect. **Verify:** unit tests for the codec (round-trip `state → wire → state`)
and `runsTo*`; portal `tsc`/`eslint`/`build`; existing surface still renders.

### Phase 1 — Go real (CRUD + RBAC)
- Stop registering the policies MSW handler (behind an env flag so dev can still
  mock). Add a dev proxy from the portal to a `saas`-profile backend; forward
  auth (session cookie / bearer per the unified-auth seam).
- **RBAC:** read the caller's `canEditPolicies` (team leader / admin) from auth;
  non-admins get the editor's read-only "Managed by your organization" state.
  Hide create/edit/delete accordingly. Handle 403 (not allowed) and 404
  (cross-team) cleanly.
- **Verify:** run the backend locally with `saas`; author/edit/delete a policy
  from the portal; confirm it appears in a team member's editor and enforces.

### Phase 2 — Monitoring
- Wire `CatalogueSummary` + `PolicyDetailPanel` stats/activity to the real
  `GET /api/v1/policies/runs` via the shared `runsTo*`. `dataProcessed` (bytes)
  may be partial until the backend exposes it — show what `PolicyRunView`
  affords, omit the rest.

### Phase 3 — Parity & polish
- Categories beyond `security` (the rest are "coming soon" placeholders today),
  classification-gated scope narrowing, reviewer routing — as the backend
  supports them. Fast-follow: migrate the **editor** onto the shared codec/types
  so there is a single contract.

---

## 6. Dependencies, open questions & risks

- **Caller role source.** RBAC needs the portal to know "am I a team
  leader/admin." Confirm the auth layer exposes role + team (a `/me`/session
  endpoint). **Blocker for Phase 1 if absent.**
- **Editing a portal-authored policy in the editor.** The editor's edit UI reads
  `output.options.automation` (its `AutomationConfig`); a portal-authored policy
  won't have it, so the editor couldn't reconstruct the authoring UI. Acceptable
  for v1 because team policies are **read-only** in members' editors and
  team-leaders author in the portal. Revisit only if we want cross-surface
  editing (would need a shared authoring representation).
- **Steps contract.** The portal must emit `steps` as the same endpoint paths +
  params the engine runs (the editor derives these via `toolRegistry`). The
  portal's `TOOL_ENDPOINTS` registry already stores endpoint paths; confirm the
  param shapes match what each endpoint expects.
- **`run/{id}` polling / SSE** — only needed if the portal ever shows live run
  progress. Not required for v1 (portal shows aggregate stats/activity).
- **One-policy-per-category** — the backend/editor assume at most one policy per
  category. The portal authoring flow must enforce the same (create replaces, or
  edit-in-place) so it can't create duplicates a team member's editor can't
  resolve.

---

## 7. Verification strategy

- **Codec + runs**: pure unit tests in `shared/policies/` (round-trip + derivations).
- **Portal handler**: keep the MSW handler honest against the real shape; test it.
- **End-to-end (manual, Phase 1)**: backend on `saas` profile → author in portal
  → confirm enforcement in a member's editor on upload and on export, for both
  `new_version` and `new_file` output modes.
- Standard gates throughout: `tsc`, `eslint`, `prettier`, portal `vite build`,
  Storybook.
