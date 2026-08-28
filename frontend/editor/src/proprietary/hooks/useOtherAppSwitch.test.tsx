import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  requestNavigation: vi.fn(),
  portalAccess: true,
  processorEnabled: true,
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => ({ pathname: "/compress", search: "?mode=fast" }),
}));
vi.mock("@app/auth/context", () => ({
  useAuth: () => ({ portalAccess: mocks.portalAccess }),
}));
// Stubbed rather than provider-wrapped: the real hook reads app-config, which
// this suite never fetches.
vi.mock("@app/hooks/useProcessorEnabled", () => ({
  useProcessorEnabled: () => mocks.processorEnabled,
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationActions: () => ({
    actions: { requestNavigation: mocks.requestNavigation },
  }),
}));

import { useOtherAppSwitch } from "@app/hooks/useOtherAppSwitch";
import { takeEditorReturnPath } from "@app/services/workbenchSession";

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.portalAccess = true;
  mocks.processorEnabled = true;
});

describe("useOtherAppSwitch", () => {
  it("offers no switch without portal access", () => {
    mocks.portalAccess = false;
    const { result } = renderHook(() => useOtherAppSwitch());
    expect(result.current).toBeNull();
  });

  it("offers no switch on an editor-only server", () => {
    mocks.processorEnabled = false;
    const { result } = renderHook(() => useOtherAppSwitch());
    expect(result.current).toBeNull();
  });

  it("routes the switch through the unsaved-changes guard", () => {
    const { result } = renderHook(() => useOtherAppSwitch());
    result.current?.onOpen();

    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.requestNavigation).toHaveBeenCalledTimes(1);
  });

  it("records where to return to, then navigates to the processor", () => {
    const { result } = renderHook(() => useOtherAppSwitch());
    result.current?.onOpen();
    mocks.requestNavigation.mock.calls[0][0]();

    expect(takeEditorReturnPath()).toBe("/compress?mode=fast");
    expect(mocks.navigate).toHaveBeenCalledWith("/processor");
  });
});
