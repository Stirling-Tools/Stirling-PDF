import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";
import { OpacityControl } from "@app/components/annotation/shared/OpacityControl";

const wrapper = ({ children }: { children: ReactNode }) => (
  <MantineProvider env="test">{children}</MantineProvider>
);

const renderControl = (value: number, onChange = vi.fn(), disabled = false) =>
  render(
    <OpacityControl value={value} onChange={onChange} disabled={disabled} />,
    {
      wrapper,
    },
  );

const open = () =>
  fireEvent.click(screen.getByRole("button", { name: "annotation.opacity" }));

describe("OpacityControl", () => {
  it("opens the track from the droplet button", () => {
    renderControl(40);

    open();

    expect(screen.getByRole("slider")).toBeDefined();
  });

  it("keeps an opacity the presets do not cover", () => {
    renderControl(40);

    open();

    // The exact value reads beside the label; the presets are marks, not the
    // only choices, so a document arriving at 40% still shows 40%.
    expect(screen.getByText("40%")).toBeDefined();
    for (const mark of ["25%", "50%", "75%", "100%"]) {
      expect(screen.getByText(mark)).toBeDefined();
    }
  });

  it("reports the whole percent the track moves to", () => {
    const onChange = vi.fn();
    renderControl(40, onChange);

    open();
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });

    expect(onChange).toHaveBeenCalledWith(41);
  });

  it("ignores the track once the control is disabled", () => {
    const onChange = vi.fn();
    const view = renderControl(40, onChange);

    open();
    view.rerender(<OpacityControl value={40} onChange={onChange} disabled />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables the trigger with the control", () => {
    renderControl(40, vi.fn(), true);

    expect(
      (
        screen.getByRole("button", {
          name: "annotation.opacity",
        }) as HTMLButtonElement | null
      )?.disabled,
    ).toBe(true);
  });
});
