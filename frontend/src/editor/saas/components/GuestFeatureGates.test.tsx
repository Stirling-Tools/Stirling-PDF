import { beforeEach, expect, it, vi } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import { usePoliciesEnabled } from "@editor/components/policies/usePoliciesEnabled";
import { QuickNavRailNotifications } from "@editor/components/shared/quickNav/QuickNavRailNotifications";

const state = vi.hoisted(() => ({
  user: { id: "guest" } as { id: string } | null,
  loading: false,
  isAnonymous: true,
  accountId: "guest" as string | null,
  subscribe: vi.fn(),
}));

vi.mock("@editor/auth/UseSession", () => ({ useAuth: () => state }));
vi.mock("@editor/contexts/QuickNavHostContext", () => ({
  useQuickNavHost: () => state,
}));
vi.mock("@editor/hooks/useNotifications", () => ({
  useNotifications: () => {
    state.subscribe();
    return { unreadCount: 0 };
  },
}));
vi.mock("@editor/components/notifications/NotificationPanel", () => ({
  NOTIFICATIONS_PANEL_ID: "notifications",
}));
vi.mock("@editor/components/shared/quickNav/QuickNavRailBase", () => ({
  RailButton: () => <button>Notifications</button>,
}));
vi.mock("@editor/ui/Icon", () => ({ Icon: () => null }));

beforeEach(() => {
  state.user = { id: "guest" };
  state.accountId = "guest";
  state.loading = false;
  state.isAnonymous = true;
  state.subscribe.mockClear();
});

it("does not mount notification polling for a guest with a valid account ID", () => {
  render(<QuickNavRailNotifications />);
  expect(state.subscribe).not.toHaveBeenCalled();
  expect(screen.queryByRole("button")).toBeNull();
});

it("starts notification polling after login and unmounts it on returning to a guest", () => {
  const view = render(<QuickNavRailNotifications />);
  state.isAnonymous = false;
  view.rerender(<QuickNavRailNotifications />);
  expect(state.subscribe).toHaveBeenCalledOnce();
  expect(
    screen.getByRole("button", { name: "Notifications" }),
  ).toBeInTheDocument();
  state.isAnonymous = true;
  view.rerender(<QuickNavRailNotifications />);
  expect(screen.queryByRole("button")).toBeNull();
});

it("does not start notification polling before account data has resolved", () => {
  state.accountId = null;
  state.isAnonymous = false;
  render(<QuickNavRailNotifications />);
  expect(state.subscribe).not.toHaveBeenCalled();
});

it("keeps the policy controller, including local classification, disabled until registered login", () => {
  const { result, rerender } = renderHook(() => usePoliciesEnabled());
  expect(result.current).toBe(false);
  state.isAnonymous = false;
  state.loading = true;
  rerender();
  expect(result.current).toBe(false);
  state.loading = false;
  rerender();
  expect(result.current).toBe(true);
  state.user = null;
  rerender();
  expect(result.current).toBe(false);
});
