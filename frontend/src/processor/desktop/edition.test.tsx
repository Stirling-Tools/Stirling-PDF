import { expect, it, vi } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expectConsole } from "@editor/tests/failOnConsole";

vi.mock("@editor/services/connectionModeService", () => ({
  connectionModeService: { getCachedMode: () => "saas" },
}));

import {
  ProcessorEditionContext,
  editionComponent,
  editionHook,
} from "@processor/edition";

const useSeam = editionHook(
  () => "cloud",
  () => "server",
);

function inBoundary(edition: "cloud" | "server" | null) {
  return ({ children }: { children: ReactNode }) => (
    <ProcessorEditionContext.Provider value={edition}>
      {children}
    </ProcessorEditionContext.Provider>
  );
}

it("runs the boundary's edition", () => {
  const { result } = renderHook(() => useSeam(), {
    wrapper: inBoundary("server"),
  });
  expect(result.current).toBe("server");
});

it("runs the base implementation in local mode", () => {
  const { result } = renderHook(() => useSeam(), { wrapper: inBoundary(null) });
  expect(result.current).toBe("server");
});

it("reports a hook used outside a boundary, then follows the cached mode", () => {
  expectConsole.error(/outside ProcessorEditionBoundary/);
  const { result } = renderHook(() => useSeam());
  expect(result.current).toBe("cloud");
});

it("reports a component used outside a boundary", () => {
  expectConsole.error(/outside ProcessorEditionBoundary/);
  const Seam = editionComponent(
    () => <p>Cloud</p>,
    () => <p>Server</p>,
  );
  render(<Seam />);
  expect(screen.getByText("Cloud")).toBeInTheDocument();
});
