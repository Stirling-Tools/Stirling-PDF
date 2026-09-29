import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useIsScrolled } from "@app/hooks/useIsScrolled";

function Harness({ mounted }: { mounted: boolean }) {
  const { scrolled, scrollRef } = useIsScrolled();
  return (
    <>
      <span data-testid="scrolled">{String(scrolled)}</span>
      {mounted && <div data-testid="scroller" ref={scrollRef} />}
    </>
  );
}

function scrollTo(el: HTMLElement, top: number) {
  Object.defineProperty(el, "scrollTop", { value: top, configurable: true });
  fireEvent.scroll(el);
}

describe("useIsScrolled", () => {
  it("tracks whether the scroller is off its top", () => {
    render(<Harness mounted />);
    const scroller = screen.getByTestId("scroller");
    expect(screen.getByTestId("scrolled")).toHaveTextContent("false");

    scrollTo(scroller, 40);
    expect(screen.getByTestId("scrolled")).toHaveTextContent("true");

    scrollTo(scroller, 0);
    expect(screen.getByTestId("scrolled")).toHaveTextContent("false");
  });

  it("resets when the scroller detaches, so a remount starts unruled", () => {
    const { rerender } = render(<Harness mounted />);
    scrollTo(screen.getByTestId("scroller"), 40);
    expect(screen.getByTestId("scrolled")).toHaveTextContent("true");

    rerender(<Harness mounted={false} />);
    expect(screen.getByTestId("scrolled")).toHaveTextContent("false");

    rerender(<Harness mounted />);
    expect(screen.getByTestId("scrolled")).toHaveTextContent("false");
  });
});
