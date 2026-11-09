import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickNavRailAccount } from "@editor/components/shared/quickNav/QuickNavRailAccount";
import type { QuickNavAccountMenu } from "@editor/contexts/QuickNavHostContext";

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

  it("focuses menu actions, supports keyboard navigation, and returns focus on Escape", () => {
    const { open } = setup({ shortcuts: [], signOut: vi.fn() });
    const trigger = screen.getByRole("button", { name: /Ada/ });
    trigger.focus();
    open();
    const [settings, signOut] = screen.getAllByRole("menuitem");
    expect(settings).toHaveFocus();
    fireEvent.keyDown(settings, { key: "ArrowDown" });
    expect(signOut).toHaveFocus();
    fireEvent.keyDown(signOut, { key: "ArrowUp" });
    expect(settings).toHaveFocus();
    fireEvent.keyDown(settings, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("masks the account identity in both the trigger and the portaled menu", () => {
    const { open } = setup();
    expect(screen.getByRole("button", { name: /Ada/ })).toHaveClass(
      "ph-sensitive",
    );
    open();
    const menu = screen.getByRole("menu");
    expect(menu.querySelector(".quick-nav-account-menu__header")).toHaveClass(
      "ph-sensitive",
    );
  });

  it("always offers Settings first, and sign out only with a session", () => {
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

  it("names local mode instead of a placeholder account when login is off", () => {
    const { open } = setup({ shortcuts: [], localMode: true });
    open();
    const header = screen
      .getByRole("menu")
      .querySelector(".quick-nav-account-menu__header");
    expect(header).toHaveTextContent("quickNav.accountMenu.localMode");
    expect(header).not.toHaveTextContent("Ada");
    expect(screen.getAllByRole("menuitem")[0]).toHaveTextContent(
      "quickNav.accountMenu.settings",
    );
  });

  it("hides sign out when there is no session to end", () => {
    const { open } = setup({ shortcuts: [] });
    open();
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });
});
