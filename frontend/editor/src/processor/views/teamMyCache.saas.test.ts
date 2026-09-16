import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  getProcessorQueryClient,
  resetProcessorQueryClient,
} from "@processor/queryClient";
import { qk } from "@processor/queries/keys";
import { usersBackend } from "@app/processor/usersBackend";

/**
 * The SaaS team resolution (/team/my) is read through the shared query cache so
 * fetchUsers + fetchTeams dedupe to one request per mount. Regression guard for
 * the bug where a rename/remove "did nothing": the cache must also honour
 * invalidation, so a mutation's refresh() forces a re-resolve instead of
 * serving the stale team. (Uses fetchQuery, not ensureQueryData — the latter
 * returns cached data even when invalidated.)
 */

// Keep apiClient.local's transport hermetic (no real token at import).
vi.mock("@app/auth", () => ({
  getStoredToken: () => null,
  clearStoredToken: vi.fn(),
}));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => null,
  configureSupabase: vi.fn(),
}));
// The processor test project's @app points at proprietary; resolve the flavor seam
// to the real SaaS backend (same approach as Users.saas.test).
vi.mock("@app/processor/usersBackend", async () => ({
  // oxlint-disable-next-line no-restricted-imports -- resolve the real SaaS module past the mocked @app alias
  usersBackend: (await import("../../saas/processor/usersBackend"))
    .usersBackend,
}));

let teamMyFetches = 0;
let teamName = "Old name";
const server = setupServer(
  http.get("*/api/v1/team/my", () => {
    teamMyFetches += 1;
    return HttpResponse.json([
      {
        teamId: 1,
        name: teamName,
        teamType: "STANDARD",
        isPersonal: false,
        memberCount: 2,
        seatCount: 5,
        seatsUsed: 2,
        maxSeats: 5,
        isLeader: true,
      },
    ]);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  teamMyFetches = 0;
  teamName = "Old name";
});

// The client outlives a mount now, so each case starts from a cold one.
beforeEach(resetProcessorQueryClient);

describe("SaaS /team/my resolution cache", () => {
  it("dedupes within staleTime but re-resolves after invalidation", async () => {
    const client = getProcessorQueryClient();

    // Two resolves within staleTime → one network call (the collapse).
    expect((await usersBackend.fetchTeams())[0]?.name).toBe("Old name");
    expect((await usersBackend.fetchTeams())[0]?.name).toBe("Old name");
    expect(teamMyFetches).toBe(1);

    // Server-side rename + what a Users mutation's refresh() does.
    teamName = "New name";
    await client.invalidateQueries({ queryKey: qk.teamMy() });

    // Must refetch, not serve the stale cached team (the reported bug).
    expect((await usersBackend.fetchTeams())[0]?.name).toBe("New name");
    expect(teamMyFetches).toBe(2);
  });
});
