/**
 * Account-link fixtures and the types api/link.ts shares with them.
 *
 * "Mode A" combined billing: a self-hosted instance links the org's SaaS account
 * so its unattended calls bill against the org wallet. Two surfaces:
 *
 *   - THIS instance: the local backend (`POST /api/v1/account-link/link`,
 *     `GET /status`, `POST /unlink`). Linking hands the local backend the admin's
 *     SaaS JWT; it registers with SaaS and stores the device secret SERVER-SIDE.
 *     The portal only ever sees a Linked / Not-linked status — never the secret.
 *   - TEAM-WIDE management: the SaaS backend (`GET /instances`,
 *     `POST /instances/{id}/revoke`), called with the admin's JWT.
 *
 * api/link.ts imports the types; the MSW handlers in mocks/handlers/link.ts serve
 * this fixture data over the intercepted apiClient.local.json() calls. Components never reach
 * into this module directly. Once the real backend is wired the handlers stop
 * being registered and these fixtures can be deleted (or kept as test seeds).
 */

/* ──────────────────────────────────────────────────────────────────────── */
/*  Local backend — link / status / unlink (this instance)                   */
/* ──────────────────────────────────────────────────────────────────────── */

/** Body for POST /api/v1/account-link/link — the SaaS JWT + optional name. */
export interface LinkInstanceRequest {
  /** Admin's SaaS session JWT, obtained via the hosted-login popup. */
  supabaseJwt: string;
  /** Optional label for this instance. */
  name?: string;
}

/** Link status for this instance (GET /api/v1/account-link/status). */
export interface LinkStatus {
  linked: boolean;
  /** Display name the local backend stored at link time; null when unset. */
  name: string | null;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  SaaS backend — team-wide instance management                             */
/* ──────────────────────────────────────────────────────────────────────── */

/** A linked instance row (GET /api/v1/account-link/instances). */
export interface LinkedInstanceRow {
  instanceId: number;
  deviceId: string;
  name: string | null;
  /** ISO timestamp the instance was registered. */
  createdAt: string | null;
  /** ISO timestamp the instance last presented its credential; null if never. */
  lastSeenAt: string | null;
  revoked: boolean;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Mock store — link/unlink/revoke mutate this so the surface feels live     */
/* ──────────────────────────────────────────────────────────────────────── */

function seedInstances(): LinkedInstanceRow[] {
  return [
    {
      instanceId: 1001,
      deviceId: "8f2c1d4a-6b3e-4a9f-9c10-2d5e7f1a0b34",
      name: "prod-eu-gateway",
      createdAt: daysAgo(28),
      lastSeenAt: minutesAgo(3),
      revoked: false,
    },
    {
      instanceId: 1002,
      deviceId: "1a9b8c7d-2e3f-4051-8a6b-9c0d1e2f3a4b",
      name: "staging-docker",
      createdAt: daysAgo(11),
      lastSeenAt: minutesAgo(140),
      revoked: false,
    },
    {
      instanceId: 1003,
      deviceId: "5d4c3b2a-1f0e-4d9c-8b7a-6e5f4d3c2b1a",
      name: "retired-poc",
      createdAt: daysAgo(96),
      lastSeenAt: daysAgo(40),
      revoked: true,
    },
  ];
}

let store: LinkedInstanceRow[] = seedInstances();
let nextId = 1004;
let localStatus: LinkStatus = { linked: false, name: null };

/** Resets the mock store + local link status to seed state (Storybook / tests). */
export function resetLinkStore(): void {
  store = seedInstances();
  nextId = 1004;
  localStatus = { linked: false, name: null };
}

/** Current local link status for this instance. */
export function getLocalStatus(): LinkStatus {
  return { ...localStatus };
}

/**
 * Links this instance: the local backend would register with SaaS and persist
 * the device secret itself. The mock just appends a row and flips local status —
 * no secret is ever surfaced.
 */
export function linkLocal(name?: string): LinkStatus {
  const instanceId = nextId++;
  store.push({
    instanceId,
    deviceId: crypto.randomUUID(),
    name: name ?? null,
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
    revoked: false,
  });
  localStatus = { linked: true, name: name ?? null };
  return getLocalStatus();
}

/** Unlinks this instance locally. */
export function unlinkLocal(): LinkStatus {
  localStatus = { linked: false, name: null };
  return getLocalStatus();
}

/** All instances for the org, newest first (includes revoked). */
export function listInstances(): LinkedInstanceRow[] {
  return [...store].sort((a, b) => b.instanceId - a.instanceId);
}

/** Revokes an instance by id. Returns false if not found. Idempotent. */
export function revokeInstance(instanceId: number): boolean {
  const row = store.find((i) => i.instanceId === instanceId);
  if (!row) return false;
  row.revoked = true;
  return true;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}
function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}
