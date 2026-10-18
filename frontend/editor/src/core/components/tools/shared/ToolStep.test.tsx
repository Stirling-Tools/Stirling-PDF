import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import ToolStep from "@app/components/tools/shared/ToolStep";

function renderStep(
  props: Partial<React.ComponentProps<typeof ToolStep>> = {},
): void {
  render(
    <MantineProvider>
      <ToolStep title="Settings" {...props} />
    </MantineProvider>,
  );
}

const settingsHeader = () => screen.getByRole("button", { name: /settings/i });

describe("ToolStep collapsible header", () => {
  it("is a button that reports its expanded state", () => {
    renderStep({ isCollapsed: true, onCollapsedClick: () => {} });
    expect(settingsHeader()).toHaveAttribute("aria-expanded", "false");
  });

  it("reports the expanded state when open", () => {
    renderStep({ isCollapsed: false, onCollapsedClick: () => {} });
    expect(settingsHeader()).toHaveAttribute("aria-expanded", "true");
  });

  it("is reachable by keyboard and activates with Enter", async () => {
    const onCollapsedClick = vi.fn();
    renderStep({ isCollapsed: true, onCollapsedClick });

    const user = userEvent.setup();
    await user.tab();
    expect(settingsHeader()).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onCollapsedClick).toHaveBeenCalledTimes(1);
  });

  it("calls the handler on click", async () => {
    const onCollapsedClick = vi.fn();
    renderStep({ isCollapsed: true, onCollapsedClick });

    await userEvent.setup().click(settingsHeader());
    expect(onCollapsedClick).toHaveBeenCalledTimes(1);
  });

  it("renders a plain header when the step cannot collapse", () => {
    renderStep();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
