import { expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { TestQueryProvider } from "@editor/tests/utils/TestQueryProvider";

const h = vi.hoisted(() => ({
  server: {
    connected: false,
    mode: null as "saas" | "selfhosted" | "local" | null,
    settled: true,
  },
}));
vi.mock("@editor/hooks/useConnectedServer", () => ({
  useConnectedServerState: () => h.server,
}));
vi.mock("@editor/auth/context", () => ({
  useAuth: () => ({ portalAccess: true, loading: false }),
}));
vi.mock("@editor/services/connectionIdentity", () => ({
  connectionIdentityKey: () => "identity",
  subscribeToConnectionIdentity: () => () => {},
}));
vi.mock("@editor/services/apiClient", () => ({ default: { get: vi.fn() } }));

import { usePortalAccessState } from "@editor/hooks/usePortalAccess";

const wrapper = ({ children }: { children: ReactNode }) => (
  <TestQueryProvider>{children}</TestQueryProvider>
);

it("settles without access when the connection mode could not be read", () => {
  h.server = { connected: false, mode: null, settled: true };
  const { result } = renderHook(() => usePortalAccessState(), { wrapper });
  expect(result.current).toEqual({ granted: false, settled: true });
});

it("waits while the connection is still being read", () => {
  h.server = { connected: false, mode: null, settled: false };
  const { result } = renderHook(() => usePortalAccessState(), { wrapper });
  expect(result.current).toEqual({ granted: false, settled: false });
});

it("lets a self-hosted session with the flag in", () => {
  h.server = { connected: true, mode: "selfhosted", settled: true };
  const { result } = renderHook(() => usePortalAccessState(), { wrapper });
  expect(result.current).toEqual({ granted: true, settled: true });
});
