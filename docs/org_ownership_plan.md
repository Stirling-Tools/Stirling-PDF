# Organization ownership and team roles

One implementation branch, with at most two PRs. Account-link UI, linking/unlinking endpoints and their permission rules are outside this feature and remain exactly as they are on main; Connor owns that work.

## Current settings location

Main `77b325cf1` moves the shared roster to **Settings → Workspace → Users** (`/settings/users`). Ownership controls live in that roster. Existing People and Teams section keys alias to Users when the shared roster is available. Builds without the processor retain their existing People/Team settings surfaces.

## Self-hosted

The Role dropdown shows **Org Owner**, **Admin**, **Team Lead** and **Member**. Org Owner is presented as a role but remains an admin plus a single ownership record in the backend. Team Lead uses the existing team LEADER membership; the label replaces “Team Owner” without granting new permissions.

The current owner selects Org Owner on another eligible user's row and confirms. The recipient becomes an admin if necessary, and the former owner remains an admin. Ownership cannot be removed by changing the current owner's dropdown; transfer chooses the replacement in one transaction.

The service refuses owner demotion, disabling, deletion and password reset by another user. Boot, committed user creation and database restore reconcile a singleton pinned by both user ID and username. Activated enabled admins are preferred during initial election. A legitimate rename preserves the pin. Competing transfers serialize under a database lock and refresh the record before checking the caller.

The server operator can recover ownership by setting `STIRLING_ORG_OWNER_BREAK_GLASS` to an existing human username in the process environment and restarting. Recovery enables and promotes that user. Remove the variable afterward. It is not an admin-editable application setting.

Ownership changes produce BASIC audit events when auditing is enabled and trigger a post-commit H2 export. PostgreSQL backup remains operator-managed.

## SaaS

SaaS keeps its existing LEADER role as the organization/team owner. There is no separate delegated Team Lead role on SaaS in this feature, and no self-hosted owner singleton is used there.

The shared settings roster offers Org Owner in eligible members' role dropdowns. Confirmation explains that the former owner becomes a member. The existing cloud Team screen retains transfer and ownerless-team recovery for builds that use it. The shared roster also supports ownerless shared-team recovery. Personal teams cannot transfer ownership.

The team transaction leaves exactly one leader. Member departure, removal and seat updates use the same team lock. A former founder who leaves a now-shared home team is not silently re-added to it. Wallets, subscriptions and assets retain the same team ID.

Latest main's `UserTeamResolver` is retained for team-scoped backend behavior; this branch no longer introduces a competing membership query or reroutes billing controllers. The roster receives current-team and current-user metadata so it stays on the active shared team after a transfer instead of selecting the former owner's personal team.

## Desktop and fallback builds

Desktop does not ship the shared portal Users page. Its settings use the existing fallback sections, depending on connection mode. In SaaS mode, the cloud Team section exposes transfer, ownerless recovery and read-only member roles. Its LEADER badge is displayed as Org Owner. Local offline mode has no organization to transfer. Connected self-hosted administration remains subject to the server's authenticated permissions.

The walkthrough exercises the current desktop-flavor Team component with controlled context data. This verifies its rendered controls and transitions; it is not a native packaged-app or hosted Supabase end-to-end test.

## Read-only users

The Role column remains visible after a SaaS handover and for members without editing permissions. Org Owner, Team Lead and Member are readable without enabling role mutations. Self rows use read-only styling rather than low-contrast disabled text. New-team creation asks only for the team name. The first person added to a custom self-hosted team automatically becomes Team Lead; later additions remain members. Existing membership roles are preserved, including a deliberate demotion. Default and Internal teams are excluded, and SaaS keeps its own membership lifecycle. The existing Role menu handles subsequent changes.

## Scope boundaries

- No account-link frontend or backend changes relative to main.
- No new invitation or membership-management permissions for self-hosted team leads; those remain a separate decision.
- No separate delegated-manager role on SaaS.
- No narrowing of general admin, processor or server-resource rights.
- No automatic migration of existing linked instances or person-specific payment-provider metadata.
- Database operators and arbitrary database restores remain outside this application-level protection.

## Validation

Run the backend and frontend quality gates, the complete SaaS suite, and SaaS/desktop typechecks. Focused tests cover owner protection, concurrency, team leadership transfer, active-team selection and the Role dropdown's separate ownership and Team Lead operations. Update the HTML walkthrough against the current settings location and omit all account-link flows.
