import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import AutomationStepCard from "@editor/components/tools/automate/AutomationStepCard";

describe("AutomationStepCard", () => {
  test("a click on the head calls onHeadClick, a click on a control in it does not", () => {
    const onHeadClick = vi.fn();
    const onAction = vi.fn();
    render(
      <MantineProvider>
        <AutomationStepCard
          index={0}
          title="Compress"
          meta="Configured"
          onHeadClick={onHeadClick}
          actions={
            <button type="button" onClick={onAction}>
              Step settings
            </button>
          }
        />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByText("Compress"));
    expect(onHeadClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Step settings" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onHeadClick).toHaveBeenCalledTimes(1);
  });
});
