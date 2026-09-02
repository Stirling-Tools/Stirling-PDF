import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  requestNavigation: vi.fn(),
  processorAccess: true,
}));

// The hook reads window.location for the return path (not useLocation), because
// the editor's raw history.pushState leaves react-router's location stale.
vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("@app/auth/context", () => ({
  useAuth: () => ({ processorAccess: mocks.processorAccess }),
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
  mocks.processorAccess = true;
  window.history.pushState({}, "", "/");
});

describe("useOtherAppSwitch", () => {
  it("offers no switch without processor access", () => {
    mocks.processorAccess = false;
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
    window.history.pushState({}, "", "/compress?mode=fast");
    const { result } = renderHook(() => useOtherAppSwitch());
    result.current?.onOpen();
    mocks.requestNavigation.mock.calls[0][0]();

    expect(takeEditorReturnPath()).toBe("/compress?mode=fast");
    expect(mocks.navigate).toHaveBeenCalledWith("/processor");
  });
});
