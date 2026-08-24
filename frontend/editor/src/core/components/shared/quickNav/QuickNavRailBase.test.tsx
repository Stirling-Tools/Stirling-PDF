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

const EDITOR = entry("editor", { isActive: true, currentKind: "app" });
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
  it("renders the switcher when there is more than one app", () => {
    const { labels, dividers } = renderRail([[EDITOR, PROCESSOR], WITHIN]);

    expect(labels).toEqual(["editor", "processor", "files", "reader"]);
    expect(dividers).toBe(1);
  });

  it("drops a switcher holding a single app, and its divider with it", () => {
    // Builds without the processor have nowhere to switch to, so the lone app
    // tile would be permanently current and do nothing. The divider goes too:
    // there is no longer a group above to divide from.
    const { labels, dividers } = renderRail([[EDITOR], WITHIN]);

    expect(labels).toEqual(["files", "reader"]);
    expect(dividers).toBe(0);
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
            [EDITOR, PROCESSOR],
            [entry("files", { isActive: true }), entry("reader")],
          ]}
        />,
      ),
    );

    const current = [...container.querySelectorAll("[aria-current]")].map(
      (el) => [el.getAttribute("aria-label"), el.getAttribute("aria-current")],
    );
    expect(current).toEqual([
      ["editor", "true"],
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
            [EDITOR, entry("processor", { disabled: true, reason: "no access" })],
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
