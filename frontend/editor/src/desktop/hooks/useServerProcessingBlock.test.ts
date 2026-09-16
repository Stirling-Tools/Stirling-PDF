import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useConnectedServerMock } = vi.hoisted(() => ({
  useConnectedServerMock: vi.fn(),
}));

vi.mock("@app/hooks/useConnectedServer", () => ({
  useConnectedServer: useConnectedServerMock,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

import { useServerProcessingBlock } from "@app/hooks/useServerProcessingBlock";

describe("useServerProcessingBlock", () => {
  beforeEach(() => useConnectedServerMock.mockReset());
  afterEach(() => vi.clearAllMocks());

  it("allows processing once a server is connected", () => {
    useConnectedServerMock.mockReturnValue(true);
    const { result } = renderHook(() => useServerProcessingBlock());
    expect(result.current).toBeNull();
  });

  it("blocks with a reason naming both ways to connect", () => {
    useConnectedServerMock.mockReturnValue(false);
    const { result } = renderHook(() => useServerProcessingBlock());
    expect(result.current).toContain("Stirling Cloud");
    expect(result.current).toContain("self-hosted");
  });

  it("fails closed while the connection is unresolved", () => {
    // useConnectedServer starts pessimistically false, so an unresolved connection
    // must block rather than let the Downloads probe fire at the bundled backend.
    useConnectedServerMock.mockReturnValue(false);
    const { result } = renderHook(() => useServerProcessingBlock());
    expect(result.current).not.toBeNull();
  });
});
