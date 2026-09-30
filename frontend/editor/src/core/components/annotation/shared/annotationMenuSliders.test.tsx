import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, renderHook, act } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { ValueSlider } from "@app/components/annotation/shared/ValueSlider";
import { useEventCallback } from "@app/hooks/useEventCallback";
import { VALUE_SLIDER_RENDER_LABEL } from "@app/constants/renderLabels";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

const renders = () =>
  Number(
    (window as unknown as { __renderCounts?: Record<string, number> })
      .__renderCounts?.[VALUE_SLIDER_RENDER_LABEL] ?? 0,
  );

/** The composition every annotation control uses: stabilise, then memoise. */
function Harness({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const stable = useEventCallback(onChange);
  return <ValueSlider value={value} min={10} max={100} onChange={stable} />;
}

describe("annotation menu slider", () => {
  beforeEach(() => {
    (
      window as unknown as { __renderCounts?: Record<string, number> }
    ).__renderCounts = {};
  });

  // The viewer rebuilds the annotation menu on every annotation update, handing
  // each control a fresh handler while the value it draws is unchanged. The
  // track must not be rebuilt for that, or dragging one slider rebuilds every
  // sibling slider on every pointer move.
  test("does not rebuild when only the handler identity changes", () => {
    const view = render(<Harness value={60} onChange={vi.fn()} />, { wrapper });
    const before = renders();
    expect(before).toBeGreaterThan(0);

    view.rerender(<Harness value={60} onChange={vi.fn()} />);

    expect(renders()).toBe(before);
  });

  test("rebuilds when the value moves", () => {
    const view = render(<Harness value={60} onChange={vi.fn()} />, { wrapper });
    const before = renders();

    view.rerender(<Harness value={75} onChange={vi.fn()} />);

    expect(renders()).toBeGreaterThan(before);
  });

  test("delivers changes to the newest handler, not the first", () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<Harness value={60} onChange={first} />, { wrapper });
    view.rerender(<Harness value={60} onChange={second} />);

    const thumb = view.container.querySelector("[role='slider']");
    expect(thumb).not.toBeNull();
    act(() => {
      thumb!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
});

describe("useEventCallback", () => {
  test("keeps one identity while calling the newest function", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ fn }: { fn: (n: number) => void }) => useEventCallback(fn),
      { initialProps: { fn: first } },
    );
    const identity = result.current;

    rerender({ fn: second });
    expect(result.current).toBe(identity);

    act(() => result.current(7));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(7);
  });
});
