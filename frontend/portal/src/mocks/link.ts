/**
 * Account-link fixtures and the types api/link.ts shares with them.
 *
 * "Mode A" combined billing: a self-hosted instance links the org's SaaS account
 * so its unattended calls bill against the org wallet. The portal admin signs in
 * to the SaaS Supabase project, then registers/lists/revokes linked instances
 * through the org's local backend, which proxies to the SaaS account-link API
 * (`/api/v1/account-link/*`, see AccountLinkController).
 *
 * api/link.ts imports the types; the MSW handlers in mocks/handlers/link.ts serve
 * this fixture data over the intercepted httpJson() calls. Components never reach
 * into this module directly. Once the real backend is wired the handlers stop
 * being registered and these fixtures can be deleted (or kept as test seeds).
 */

/* ──────────────────────────────────────────────────────────────────────── */
/*  Register + list (mirrors AccountLinkController records)                   */
/* ──────────────────────────────────────────────────────────────────────── */

/** Body for POST /api/v1/account-link/register — optional display name. */
export interface RegisterInstanceRequest {
  name?: string;
}

/**
 * Response from register. `deviceSecret` is plaintext and returned exactly
 * once — the caller must store it; it is never retrievable again.
 */
export interface RegisterInstanceResponse {
  instanceId: number;
  deviceId: string;
  deviceSecret: string;
  name: string | null;
}

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
/*  Mock store — register/revoke mutate this so the surface feels live in dev */
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

/** Resets the mock store to seed state (used by Storybook / tests). */
export function resetLinkStore(): void {
  store = seedInstances();
  nextId = 1004;
}

/** All instances for the org, newest first (includes revoked). */
export function listInstances(): LinkedInstanceRow[] {
  return [...store].sort((a, b) => b.instanceId - a.instanceId);
}

/** Registers a new instance, returning the one-time secret. */
export function registerInstance(name?: string): RegisterInstanceResponse {
  const instanceId = nextId++;
  const deviceId = crypto.randomUUID();
  store.push({
    instanceId,
    deviceId,
    name: name ?? null,
    createdAt: new Date().toISOString(),
    lastSeenAt: null,
    revoked: false,
  });
  return {
    instanceId,
    deviceId,
    // Mock secret — high-entropy shape, never a real credential.
    deviceSecret: `sk_link_${crypto.randomUUID().replace(/-/g, "")}`,
    name: name ?? null,
  };
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
