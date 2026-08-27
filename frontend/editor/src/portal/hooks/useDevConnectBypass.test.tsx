import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * The bypass exists for developers on a flag-on instance and must not exist for anyone else.
 *
 * The connect gate is currently the only thing enforcing that teams, the processor, pipelines and
 * policies need a linked account, so a switch a customer could reach would hand those over for
 * free. The last test here is the one that matters: with DEV folded to false, which is what every
 * build does, the parameter does nothing at all.
 */
import { useDevConnectBypass } from "@portal/hooks/useDevConnectBypass";

function Probe() {
  return <span data-testid="bypass">{String(useDevConnectBypass())}</span>;
}

/** Mounts fresh at the given URL, so a second call models a later visit rather than a re-render. */
const at = (search: string) => {
  cleanup();
  window.history.replaceState({}, "", `/processor${search}`);
  render(<Probe />);
  return screen.getByTestId("bypass").textContent;
};

describe("useDevConnectBypass", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    vi.unstubAllEnvs();
    window.history.replaceState({}, "", "/");
  });

  it("is off by default, so dev still sees what customers see", () => {
    expect(at("")).toBe("false");
  });

  it("turns on with the parameter", () => {
    expect(at("?bypassConnect=true")).toBe("true");
  });

  it("survives the navigation the gate itself performs", () => {
    at("?bypassConnect=true");
    expect(at("")).toBe("true");
  });

  it("ignores any other value", () => {
    expect(at("?bypassConnect=1")).toBe("false");
  });

  it("does nothing in a build, which is what ships to customers", () => {
    vi.stubEnv("DEV", false);
    expect(at("?bypassConnect=true")).toBe("false");
    // And nothing was left behind for a later dev session to pick up.
    expect(sessionStorage.getItem("accountLink::dev-bypass")).toBeNull();
  });
});
