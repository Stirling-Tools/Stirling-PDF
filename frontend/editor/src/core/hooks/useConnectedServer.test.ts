import { describe, expect, it } from "vitest";
import { useConnectedServer } from "@app/hooks/useConnectedServer";

describe("useConnectedServer (core)", () => {
  // Pins the stub: moving real logic in here would dark-ship the surfaces it gates
  // on every web build, with no error anywhere.
  it("is always true — a web build is served by the backend it calls", () => {
    expect(useConnectedServer()).toBe(true);
  });
});
