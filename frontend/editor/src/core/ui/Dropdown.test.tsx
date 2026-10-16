import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Dropdown } from "@app/ui/Dropdown";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("preserves command-menu keyboard navigation and closes on selection", () => {
  const onSelect = vi.fn();
  render(
    <Dropdown.Root defaultOpen>
      <Dropdown.Trigger>
        <button>Commands</button>
      </Dropdown.Trigger>
      <Dropdown.Menu autoFocus>
        <Dropdown.Item disabled>Unavailable</Dropdown.Item>
        <Dropdown.Item>First</Dropdown.Item>
        <Dropdown.Item onSelect={onSelect}>Second</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown.Root>,
  );
  expect(screen.getByRole("button", { name: "Commands" })).toHaveAttribute(
    "aria-haspopup",
    "menu",
  );
  expect(screen.getByRole("menuitem", { name: "First" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
  const second = screen.getByRole("menuitem", { name: "Second" });
  expect(second).toHaveFocus();
  fireEvent.click(second);
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});

it.each([
  {
    width: 1280,
    height: 720,
    triggerY: 400,
    panelWidth: 400,
    panelHeight: 660,
    top: "52px",
    bottom: "auto",
    left: "52px",
    maxHeight: "704px",
  },
  {
    width: 390,
    height: 844,
    triggerY: 800,
    panelWidth: 366,
    panelHeight: 660,
    top: "auto",
    bottom: "48px",
    left: "8px",
    maxHeight: "788px",
  },
])(
  "keeps a side popover inside a $width by $height viewport",
  ({
    width,
    height,
    triggerY,
    panelWidth,
    panelHeight,
    top,
    bottom,
    left,
    maxHeight,
  }) => {
    vi.stubGlobal("innerWidth", width);
    vi.stubGlobal("innerHeight", height);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, triggerY, 48, 36),
    );
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(
      panelWidth,
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(
      panelHeight,
    );
    render(
      <Dropdown.Root defaultOpen align="start">
        <Dropdown.Trigger popupRole="dialog">
          <button>Open sessions</button>
        </Dropdown.Trigger>
        <Dropdown.Menu role="dialog" ariaLabel="Sessions" placement="side">
          <button>Browse</button>
        </Dropdown.Menu>
      </Dropdown.Root>,
    );
    expect(
      screen.getByRole("button", { name: "Open sessions" }),
    ).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getByRole("dialog", { name: "Sessions" })).toHaveStyle({
      top,
      bottom,
      left,
      maxHeight,
    });
  },
);
