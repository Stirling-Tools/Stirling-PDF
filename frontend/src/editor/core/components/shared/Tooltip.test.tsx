import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Tooltip } from "@editor/components/shared/Tooltip";

vi.mock("@editor/hooks/useTooltipPosition", () => ({
  useTooltipPosition: () => ({
    coords: { top: 0, left: 0, arrowOffset: null },
    positionReady: true,
  }),
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("does not restore a hovered tooltip after disabling and enabling it", () => {
  const trigger = (disabled: boolean) => (
    <Tooltip
      content="More save options"
      disabled={disabled}
      openOnFocus={false}
    >
      <button>Save menu</button>
    </Tooltip>
  );
  const { rerender } = render(trigger(false));
  fireEvent.pointerEnter(screen.getByRole("button"));
  act(() => vi.runAllTimers());
  expect(screen.getByRole("tooltip")).toBeInTheDocument();

  rerender(trigger(true));
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  rerender(trigger(false));
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

  fireEvent.pointerLeave(screen.getByRole("button"));
  fireEvent.pointerEnter(screen.getByRole("button"));
  act(() => vi.runAllTimers());
  expect(screen.getByRole("tooltip")).toBeInTheDocument();
});

it("cancels a pending hover when disabled", () => {
  const trigger = (disabled: boolean) => (
    <Tooltip content="More save options" disabled={disabled} delay={100}>
      <button>Save menu</button>
    </Tooltip>
  );
  const { rerender } = render(trigger(false));
  fireEvent.pointerEnter(screen.getByRole("button"));
  rerender(trigger(true));
  act(() => vi.runAllTimers());
  rerender(trigger(false));
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
