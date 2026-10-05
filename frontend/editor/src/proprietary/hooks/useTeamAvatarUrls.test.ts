import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  configured: true,
  session: { user: { id: "viewer" } } as unknown,
  createSignedUrls: vi.fn(),
}));

vi.mock("@app/services/supabaseClient", () => ({
  get isSupabaseConfigured() {
    return client.configured;
  },
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: client.session } }),
    },
    storage: { from: () => ({ createSignedUrls: client.createSignedUrls }) },
  },
}));

import { useTeamAvatarUrls } from "@app/hooks/useTeamAvatarUrls";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

/** The shape supabase-js returns: per-path outcomes inside a success. */
function signed(entries: Array<[string, string | null]>) {
  return {
    data: entries.map(([id, url]) => ({
      path: `${id}/avatar`,
      signedUrl: url,
    })),
    error: null,
  };
}

describe("useTeamAvatarUrls", () => {
  beforeEach(() => {
    client.configured = true;
    client.session = { user: { id: "viewer" } };
    client.createSignedUrls.mockReset();
    client.createSignedUrls.mockResolvedValue(signed([]));
  });

  it("keys signed urls by supabase id", async () => {
    client.createSignedUrls.mockResolvedValue(
      signed([
        [ALICE, "https://sb/alice?token=a"],
        [BOB, null],
      ]),
    );

    const { result } = renderHook(() =>
      useTeamAvatarUrls([{ supabaseId: ALICE }, { supabaseId: BOB }]),
    );

    await waitFor(() =>
      expect(result.current).toEqual({ [ALICE]: "https://sb/alice?token=a" }),
    );
    expect(client.createSignedUrls).toHaveBeenCalledWith(
      [`${ALICE}/avatar`, `${BOB}/avatar`],
      3600,
    );
  });

  it("does not re-sign when a poll returns the same members", async () => {
    client.createSignedUrls.mockResolvedValue(
      signed([[ALICE, "https://sb/alice"]]),
    );
    const members = [{ supabaseId: ALICE }];

    const { result, rerender } = renderHook(
      (m: typeof members) => useTeamAvatarUrls(m),
      { initialProps: members },
    );
    await waitFor(() => expect(result.current[ALICE]).toBeDefined());

    // A fresh array of the same ids, which is what each roster poll produces.
    rerender([{ supabaseId: ALICE }]);
    await waitFor(() => expect(result.current[ALICE]).toBeDefined());

    expect(client.createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it("signs again when the roster gains a member", async () => {
    client.createSignedUrls.mockResolvedValue(
      signed([[ALICE, "https://sb/alice"]]),
    );
    const { result, rerender } = renderHook(
      (m: Array<{ supabaseId: string }>) => useTeamAvatarUrls(m),
      { initialProps: [{ supabaseId: ALICE }] },
    );
    await waitFor(() => expect(result.current[ALICE]).toBeDefined());

    client.createSignedUrls.mockResolvedValue(
      signed([
        [ALICE, "https://sb/alice"],
        [BOB, "https://sb/bob"],
      ]),
    );
    rerender([{ supabaseId: ALICE }, { supabaseId: BOB }]);

    await waitFor(() => expect(result.current[BOB]).toBe("https://sb/bob"));
    expect(client.createSignedUrls).toHaveBeenCalledTimes(2);
  });

  it("never sends an id that is not a bare uuid", async () => {
    const { result } = renderHook(() =>
      useTeamAvatarUrls([
        { supabaseId: "../../etc/passwd" },
        { supabaseId: "" },
        { supabaseId: null },
      ]),
    );

    await waitFor(() => expect(result.current).toEqual({}));
    expect(client.createSignedUrls).not.toHaveBeenCalled();
  });

  it("skips storage entirely when signed out", async () => {
    client.session = null;

    const { result } = renderHook(() =>
      useTeamAvatarUrls([{ supabaseId: ALICE }]),
    );

    await waitFor(() => expect(result.current).toEqual({}));
    expect(client.createSignedUrls).not.toHaveBeenCalled();
  });

  it("falls back to initials when supabase is unconfigured", async () => {
    client.configured = false;

    const { result } = renderHook(() =>
      useTeamAvatarUrls([{ supabaseId: ALICE }]),
    );

    await waitFor(() => expect(result.current).toEqual({}));
    expect(client.createSignedUrls).not.toHaveBeenCalled();
  });

  it("falls back to initials when signing errors", async () => {
    client.createSignedUrls.mockResolvedValue({
      data: null,
      error: { message: "nope" },
    });

    const { result } = renderHook(() =>
      useTeamAvatarUrls([{ supabaseId: ALICE }]),
    );

    await waitFor(() => expect(client.createSignedUrls).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });
});
