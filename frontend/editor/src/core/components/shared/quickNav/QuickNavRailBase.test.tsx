import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  QuickNavRailBase,
  type QuickNavEntry,
} from "@app/components/shared/quickNav/QuickNavRailBase";

/** The rail needs no providers. */
function withProviders(ui: React.ReactNode) {
  return <>{ui}</>;
}

function entry(
  id: string,
  overrides: Partial<QuickNavEntry> = {},
): QuickNavEntry {
  return {
    id,
    label: id,
    icon: null,
    onClick: () => {},
    ...overrides,
  };
}

const PROCESSOR = entry("processor");
const WITHIN = [entry("files"), entry("reader")];

function renderRail(groups: QuickNavEntry[][]) {
  const { container } = render(
    withProviders(<QuickNavRailBase groups={groups} />),
  );
  return {
    labels: [...container.querySelectorAll(".quick-nav-rail-item")].map((b) =>
      b.getAttribute("aria-label"),
    ),
    dividers: container.querySelectorAll(".quick-nav-rail-divider").length,
  };
}

describe("QuickNavRailBase — app switcher", () => {
  it("renders the switcher for the app you are not in", () => {
    // The app you are in is the brand mark, so the switcher holds only the other.
    const { labels, dividers } = renderRail([[PROCESSOR], WITHIN]);

    expect(labels).toEqual(["processor", "files", "reader"]);
    expect(dividers).toBe(1);
  });

  it("drops an empty switcher, and its divider with it", () => {
    // Nothing to switch to, so the divider has nothing to divide.
    const { labels, dividers } = renderRail([[], WITHIN]);

    expect(labels).toEqual(["files", "reader"]);
    expect(dividers).toBe(0);
  });

  it("tags the switcher group, not whichever group renders first", () => {
    // Tagging by rendered position would hand the tag to the group below.
    const { container } = render(
      withProviders(<QuickNavRailBase groups={[[], WITHIN]} />),
    );

    const groups = container.querySelectorAll(".quick-nav-rail-group");
    expect(groups).toHaveLength(1);
    expect(groups[0].getAttribute("data-switcher")).toBeNull();
  });
});

describe("QuickNavRailBase — entry state", () => {
  it("reports on/off for a toggle and nothing for the rest", () => {
    // Nothing here is a view you occupy, so only a real toggle has state.
    const { container } = render(
      withProviders(
        <QuickNavRailBase
          groups={[
            [PROCESSOR],
            [entry("reader", { pressed: true }), entry("files")],
          ]}
        />,
      ),
    );

    const state = [...container.querySelectorAll(".quick-nav-rail-item")].map(
      (b) => [b.getAttribute("aria-label"), b.getAttribute("aria-pressed")],
    );
    expect(state).toEqual([
      ["processor", null],
      ["reader", "true"],
      ["files", null],
    ]);
    expect(container.querySelectorAll("[aria-current]")).toHaveLength(0);
  });

  it("keeps a disabled entry in the tab order so its reason stays reachable", () => {
    // The tooltip carrying the reason is only reachable while it can be focused.
    const { container } = render(
      withProviders(
        <QuickNavRailBase
          groups={[
            [
              entry("automate", {
                disabled: true,
                reason: "Disabled by server administrator",
              }),
            ],
          ]}
        />,
      ),
    );

    const automate = container.querySelector('[aria-label="automate"]')!;
    expect(automate.getAttribute("aria-disabled")).toBe("true");
    expect(automate.hasAttribute("disabled")).toBe(false);
  });

  it("keeps an unavailable entry rendered, disabled rather than dropped", () => {
    // Slots must not appear and vanish as access resolves.
    const { container } = render(
      withProviders(
        <QuickNavRailBase
          groups={[
            [entry("processor", { disabled: true, reason: "no access" })],
            WITHIN,
          ]}
        />,
      ),
    );

    const processor = container.querySelector('[aria-label="processor"]');
    expect(processor).not.toBeNull();
    expect(processor?.getAttribute("aria-disabled")).toBe("true");
    // aria-disabled, not the disabled attribute: it must stay focusable so its
    // tooltip can explain why.
    expect(processor?.hasAttribute("disabled")).toBe(false);
  });
});
