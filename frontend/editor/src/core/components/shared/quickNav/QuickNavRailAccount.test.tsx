import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickNavRailAccount } from "@app/components/shared/quickNav/QuickNavRailAccount";
import type { QuickNavAccountMenu } from "@app/contexts/QuickNavHostContext";

function setup(menu?: QuickNavAccountMenu) {
  const onOpenSettings = vi.fn();
  const onOpenShortcut = vi.fn();
  const resolveMenu = vi.fn(() => menu);
  render(
    <QuickNavRailAccount
      identity={{ displayName: "Ada", profilePictureUrl: null }}
      onOpenSettings={onOpenSettings}
      onOpenShortcut={onOpenShortcut}
      resolveMenu={resolveMenu}
    />,
  );
  const open = () =>
    fireEvent.click(screen.getByRole("button", { name: /Ada/ }));
  return { onOpenSettings, onOpenShortcut, resolveMenu, open };
}

describe("QuickNavRailAccount menu", () => {
  it("opens a menu instead of navigating, and reads the menu only once open", () => {
    const { onOpenSettings, resolveMenu, open } = setup();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(resolveMenu).not.toHaveBeenCalled();

    open();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(resolveMenu).toHaveBeenCalled();
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it("routes a shortcut to its target and closes", () => {
    const { onOpenShortcut, open } = setup({
      shortcuts: [
        {
          id: "server",
          label: "Server settings",
          icon: "server",
          to: "/settings/adminGeneral",
        },
      ],
    });
    open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Server settings" }));
    expect(onOpenShortcut).toHaveBeenCalledWith("/settings/adminGeneral");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("always offers all settings, and sign out only with a session", () => {
    const signOut = vi.fn();
    const { onOpenSettings, open } = setup({ shortcuts: [], signOut });
    open();
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);

    fireEvent.click(items[1]);
    expect(signOut).toHaveBeenCalledOnce();

    open();
    fireEvent.click(screen.getAllByRole("menuitem")[0]);
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("hides sign out when there is no session to end", () => {
    const { open } = setup({ shortcuts: [] });
    open();
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });
});
