import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

vi.mock("@app/portal/auth/saasSupabase", () => ({
  ensureSaasSupabase: vi.fn(),
}));

const key = "sb-renewal-session-auth-token";
const config = {
  url: "https://renewal-session.supabase.co",
  key: "public-key",
  authOptions: { autoRefreshToken: false, detectSessionInUrl: false },
};
const user = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.test",
};
const jwt = (exp: number) =>
  [
    btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })),
    btoa(JSON.stringify({ exp, sub: user.id })),
    btoa("test-signature"),
  ]
    .map((part) =>
      part.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"),
    )
    .join(".");
const tokenResponse = (exp: number) => ({
  access_token: jwt(exp),
  refresh_token: "rotated-refresh",
  token_type: "bearer",
  expires_in: 3600,
  user,
});
const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

// Separate SDK clients share storage and exchange messages through a browser channel.
class BrowserChannel extends EventTarget {
  static channels = new Set<BrowserChannel>();
  constructor(readonly name: string) {
    super();
    BrowserChannel.channels.add(this);
  }
  postMessage(data: unknown) {
    for (const other of BrowserChannel.channels) {
      if (other !== this && other.name === this.name) {
        queueMicrotask(() =>
          other.dispatchEvent(new MessageEvent("message", { data })),
        );
      }
    }
  }
  close() {
    BrowserChannel.channels.delete(this);
  }
}

let storage: typeof import("@app/auth/supabase/supabaseClient");
let session: typeof import("@app/portal/auth/portalSaasSession");
let stopClients: (() => Promise<void>)[];
let windowListeners: [string, EventListenerOrEventListenerObject][];

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  stopClients = [];
  windowListeners = [];
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation(
    (type, listener, options) => {
      windowListeners.push([type, listener]);
      add(type, listener, options);
    },
  );
  vi.stubGlobal("BroadcastChannel", BrowserChannel);
  storage = await import("@app/auth/supabase/supabaseClient");
  session = await import("@app/portal/auth/portalSaasSession");
});

afterEach(async () => {
  storage.clearSupabaseSession();
  await Promise.all(stopClients.map((stop) => stop()));
  for (const [type, listener] of windowListeners)
    window.removeEventListener(type, listener);
  for (const channel of BrowserChannel.channels) channel.close();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function persist(exp: number) {
  localStorage.setItem(
    key,
    JSON.stringify({
      ...tokenResponse(exp),
      refresh_token: "old-refresh",
      expires_at: exp,
    }),
  );
}

it("renews an expired persisted session through the real Supabase SDK", async () => {
  const now = Math.floor(Date.now() / 1000);
  persist(now - 60);
  const fetch = vi.fn().mockResolvedValue(json(tokenResponse(now + 3600)));
  vi.stubGlobal("fetch", fetch);
  const client = storage.configureSupabase(config);
  stopClients.push(() => client.auth.stopAutoRefresh());
  await expect(session.getPortalSaasToken()).resolves.toBe(jwt(now + 3600));
  expect(fetch).toHaveBeenCalledOnce();
  expect(String(fetch.mock.calls[0][0])).toContain(
    "/auth/v1/token?grant_type=refresh_token",
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body).refresh_token).toBe(
    "old-refresh",
  );
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
    refresh_token: "rotated-refresh",
    access_token: jwt(now + 3600),
  });
});

it("clears recovery when another tab renews through the SDK broadcast channel", async () => {
  const now = Math.floor(Date.now() / 1000);
  persist(now + 1800);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(json(tokenResponse(now + 3600))),
      ),
  );
  const client = storage.configureSupabase(config);
  const otherTab = createClient(config.url, config.key, {
    auth: config.authOptions,
  });
  stopClients.push(
    () => client.auth.stopAutoRefresh(),
    () => otherTab.auth.stopAutoRefresh(),
  );
  await Promise.all([client.auth.getSession(), otherTab.auth.getSession()]);
  await expect(
    session.withPortalSaasSession(
      async () => 401,
      (status) => status === 401,
    ),
  ).rejects.toBeInstanceOf(session.SaasSessionRequiredError);
  const revision = session.getPortalSaasSessionState().revision;
  expect(session.getPortalSaasSessionState().required).toBe(true);
  expect((await otherTab.auth.refreshSession()).error).toBeNull();
  await vi.waitFor(() =>
    expect(session.getPortalSaasSessionState()).toEqual({
      required: false,
      revision: revision + 1,
    }),
  );
  const read = vi.fn(async () => 200);
  await session.withPortalSaasSession(read, (status) => status === 401, true);
  expect(read).toHaveBeenCalledWith(jwt(now + 3600));
});

it.each(["same tab", "another tab"])(
  "blocks a late SDK refresh after logout in %s and preserves the next session",
  async (tab) => {
    const now = Math.floor(Date.now() / 1000);
    persist(now + 1800);
    let release!: (response: Response) => void;
    const fetch = vi.fn().mockImplementation((url: string) =>
      url.includes("/token?")
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(json(user)),
    );
    vi.stubGlobal("fetch", fetch);
    const oldClient = storage.configureSupabase(config);
    stopClients.push(() => oldClient.auth.stopAutoRefresh());
    await oldClient.auth.getSession();
    let otherStorage = storage;
    if (tab === "another tab") {
      vi.resetModules();
      otherStorage = await import("@app/auth/supabase/supabaseClient");
      const otherClient = otherStorage.configureSupabase(config);
      stopClients.push(() => otherClient.auth.stopAutoRefresh());
      await otherClient.auth.getSession();
    }
    const pending = oldClient.auth.refreshSession();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    otherStorage.clearSupabaseSession();
    expect(localStorage.getItem(key)).toBeNull();
    const currentClient = storage.configureSupabase(config);
    stopClients.push(() => currentClient.auth.stopAutoRefresh());
    expect(
      (
        await currentClient.auth.setSession({
          access_token: jwt(now + 7200),
          refresh_token: "current-refresh",
        })
      ).error,
    ).toBeNull();
    await expect(
      session.withPortalSaasSession(
        async () => 401,
        (status) => status === 401,
      ),
    ).rejects.toBeInstanceOf(session.SaasSessionRequiredError);
    const before = session.getPortalSaasSessionState();
    release(json(tokenResponse(now + 3600)));
    await pending;
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({
      access_token: jwt(now + 7200),
      refresh_token: "current-refresh",
    });
    expect(session.getPortalSaasSessionState()).toEqual(before);
    expect(storage.getSupabaseClient()).toBe(currentClient);
  },
);
