import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { StorageSharingCard } from "@editor/components/shared/config/configSections/server/StorageSharingCard";
import type { StorageSharingSettingsData } from "@editor/components/shared/config/configSections/server/serverSettings";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@editor/hooks/useLoginRequired", () => ({
  useLoginRequired: () => ({ getDisabledStyles: () => ({}) }),
}));
vi.mock("@mantine/core", () => ({
  Paper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Stack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Anchor: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@editor/components/shared/config/SettingsToggleRow", () => ({
  SettingsToggleRow: ({
    label,
    checked,
    onChange,
    disabled,
    pending,
  }: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    pending?: boolean;
  }) => (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      data-pending={pending}
      onChange={(event) => onChange(event.currentTarget.checked)}
    />
  ),
}));

const label = "Enable Automatic File Sync";

function mount(
  settings: StorageSharingSettingsData = { enabled: true },
  loginEnabled = true,
) {
  const setSettings = vi.fn();
  const isFieldPending = vi.fn((field: string) => field === "autoSyncEnabled");
  render(
    <StorageSharingCard
      settings={settings}
      setSettings={setSettings}
      isFieldPending={isFieldPending}
      loginEnabled={loginEnabled}
    />,
  );
  return { toggle: screen.getByRole("checkbox", { name: label }), setSettings };
}

describe("StorageSharingCard automatic sync", () => {
  it("defaults off and places sync directly after server file storage", () => {
    const { toggle } = mount();
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute("data-pending", "true");
    expect(screen.getAllByRole("checkbox")[1]).toBe(toggle);
  });

  it("writes the server draft without losing other storage settings", () => {
    const settings = {
      enabled: true,
      autoSyncEnabled: false,
      sharing: { enabled: true },
    };
    const { toggle, setSettings } = mount(settings);
    fireEvent.click(toggle);
    expect(setSettings).toHaveBeenCalledWith({
      ...settings,
      autoSyncEnabled: true,
    });
  });

  it.each([
    [false, true],
    [true, false],
  ])("requires storage=%s and login=%s", async (enabled, loginEnabled) => {
    const { toggle, setSettings } = mount(
      { enabled, autoSyncEnabled: true },
      loginEnabled,
    );
    expect(toggle).toBeDisabled();
    await userEvent.click(toggle);
    expect(setSettings).not.toHaveBeenCalled();
  });
});
