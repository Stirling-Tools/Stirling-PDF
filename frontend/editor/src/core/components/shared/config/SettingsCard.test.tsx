import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { SettingsCard } from "@app/components/shared/config/SettingsCard";

function renderCard(openRequest?: string) {
  return (
    <MantineProvider>
      <SettingsCard
        id="hotkeys"
        title="Keyboard Shortcuts"
        defaultCollapsed
        lazy
        openRequest={openRequest}
      >
        <p>Shortcut rows</p>
      </SettingsCard>
    </MantineProvider>
  );
}

describe("SettingsCard", () => {
  it("opens on each new open request, even after the user folds it", () => {
    const { rerender } = render(renderCard());
    const toggle = screen.getByRole("button", { name: "Keyboard Shortcuts" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Shortcut rows")).not.toBeInTheDocument();

    rerender(renderCard("nav-1"));
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Shortcut rows")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Following the same link again is a new navigation, so a new key.
    rerender(renderCard("nav-2"));
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
