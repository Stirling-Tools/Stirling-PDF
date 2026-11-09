import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ savesAvailable: false, connected: false }));

vi.mock("@editor/hooks/useOneDriveSavesAvailable", () => ({
  useOneDriveSavesAvailable: () => state.savesAvailable,
}));
vi.mock("@editor/hooks/useConnectedServer", () => ({
  useConnectedServer: () => state.connected,
}));

import { useOneDriveSaveBlockedHint } from "@editor/hooks/useOneDriveSaveBlockedHint";

describe("useOneDriveSaveBlockedHint", () => {
  beforeEach(() => {
    state.savesAvailable = false;
    state.connected = false;
  });

  it("asks to sign in when no server is connected", () => {
    const { result } = renderHook(useOneDriveSaveBlockedHint);
    expect(result.current).toBe("oneDriveSave.signInToSave");
  });

  it("says nothing when Save can reach OneDrive", () => {
    state.savesAvailable = true;
    const { result } = renderHook(useOneDriveSaveBlockedHint);
    expect(result.current).toBeNull();
  });

  it("says nothing when signed in to a server that has OneDrive saves off", () => {
    state.connected = true;
    const { result } = renderHook(useOneDriveSaveBlockedHint);
    expect(result.current).toBeNull();
  });
});
