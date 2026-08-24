import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import {
  QuickNavRailBase,
  type QuickNavEntry,
} from "@app/components/shared/quickNav/QuickNavRailBase";

/** The rail's tooltips need Mantine's theme context. */
function withProviders(ui: React.ReactNode) {
  return <MantineProvider>{ui}</MantineProvider>;
}

function entry(
  id: string,
  overrides: Partial<QuickNavEntry> = {},
): QuickNavEntry {
  return {
    id,
    label: id,
    icon: null,
    kind: "destination",
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
    // The app you ARE in is the brand mark above the bar, so the switcher holds
    // only the other one.
    const { labels, dividers } = renderRail([[PROCESSOR], WITHIN]);

    expect(labels).toEqual(["processor", "files", "reader"]);
    expect(dividers).toBe(1);
  });

  it("drops an empty switcher, and its divider with it", () => {
    // Builds with no second app have nothing to switch to. The divider goes too:
    // there is no longer a group above to divide from.
    const { labels, dividers } = renderRail([[], WITHIN]);

    expect(labels).toEqual(["files", "reader"]);
    expect(dividers).toBe(0);
  });

  it("tags the switcher group, not whichever group renders first", () => {
    // The swap animation targets the switcher; tagging by rendered position would
    // hand it to the group below once the switcher was dropped.
    const { container } = render(
      withProviders(<QuickNavRailBase groups={[[], WITHIN]} />),
    );

    const groups = container.querySelectorAll(".quick-nav-rail-group");
    expect(groups).toHaveLength(1);
    expect(groups[0].getAttribute("data-switcher")).toBeNull();
  });
});

describe("QuickNavRailBase — current state", () => {
  it("marks the current app and the current page differently", () => {
    // Both are active at once in My Files. Two aria-current="page" in one nav
    // would have a screen reader announce two current pages.
    const { container } = render(
      withProviders(
        <QuickNavRailBase
          groups={[
            [entry("processor", { isActive: true, currentKind: "app" })],
            [entry("files", { isActive: true }), entry("reader")],
          ]}
        />,
      ),
    );

    const current = [...container.querySelectorAll("[aria-current]")].map(
      (el) => [el.getAttribute("aria-label"), el.getAttribute("aria-current")],
    );
    expect(current).toEqual([
      ["processor", "true"],
      ["files", "page"],
    ]);
  });

  it("keeps an unavailable entry rendered, disabled rather than dropped", () => {
    // The rail's slots must not appear and vanish as access resolves, so
    // position stays meaningful.
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
