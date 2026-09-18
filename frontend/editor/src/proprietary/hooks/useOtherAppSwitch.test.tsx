import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  switchToApp: vi.fn(),
  requestNavigation: vi.fn(),
  portalAccess: true,
}));

vi.mock("@app/components/shared/AppSwitchProvider", () => ({
  useAppSwitch: () => ({ switchToApp: mocks.switchToApp }),
}));
vi.mock("@app/auth/context", () => ({
  useAuth: () => ({ portalAccess: mocks.portalAccess }),
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
  window.history.pushState({}, "", "/");
});

describe("useOtherAppSwitch", () => {
  it("offers no switch without portal access", () => {
    mocks.portalAccess = false;
    const { result } = renderHook(() => useOtherAppSwitch());
    expect(result.current).toBeNull();
  });

  it("routes the switch through the unsaved-changes guard", () => {
    const { result } = renderHook(() => useOtherAppSwitch());
    result.current?.onOpen();

    expect(mocks.switchToApp).not.toHaveBeenCalled();
    expect(mocks.requestNavigation).toHaveBeenCalledTimes(1);
  });

  it("records where to return to, then plays the switch to the processor", () => {
    window.history.pushState({}, "", "/compress?mode=fast");
    const { result } = renderHook(() => useOtherAppSwitch());
    result.current?.onOpen();
    mocks.requestNavigation.mock.calls[0][0]();

    expect(takeEditorReturnPath()).toBe("/compress?mode=fast");
    expect(mocks.switchToApp).toHaveBeenCalledWith("processor");
  });
});
