import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { FrontendThirdPartyLicensesSection } from "@app/components/shared/config/configSections/ThirdPartyLicensesSection";

const viewport = vi.hoisted(() => ({ phone: false }));

vi.mock("@app/hooks/useIsMobile", () => ({
  useIsPhone: () => viewport.phone,
}));

vi.mock("@app/services/apiClient", () => ({
  default: { get: vi.fn() },
}));

// jsdom reports no scroll geometry, so the real virtualizer renders nothing.
// Returning every item keeps the layout branch under test fully mounted.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    count: number;
    getItemKey: (i: number) => string;
  }) => {
    const items = Array.from({ length: options.count }, (_, index) => ({
      index,
      start: index,
      end: index + 1,
      size: 1,
      key: options.getItemKey(index),
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => options.count,
      measureElement: () => {},
    };
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

function renderSection() {
  return render(
    <MantineProvider>
      <FrontendThirdPartyLicensesSection />
    </MantineProvider>,
  );
}

describe("third-party licenses layout", () => {
  it("renders the three-column table on wide viewports", () => {
    viewport.phone = false;
    const { container } = renderSection();

    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Module" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Version" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "License" })).toBeTruthy();
    expect(
      container.querySelectorAll("tbody tr[data-index]").length,
    ).toBeGreaterThan(0);
  });

  it("drops the table for a card list on phones", () => {
    viewport.phone = true;
    const { container } = renderSection();

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByPlaceholderText("Search dependencies")).toBeTruthy();
    const cards = container.querySelectorAll("div[data-index]");
    expect(cards.length).toBe(73);
    // Each card carries the module, its version and the license label.
    expect(cards[0].textContent).toContain("@atlaskit/pragmatic-drag-and-drop");
    expect(cards[0].textContent).toContain("2.0.2");
    expect(cards[0].textContent).toContain("Apache-2.0");
  });

  it("clears the search from the field when nothing matches", () => {
    viewport.phone = false;
    renderSection();

    const search = screen.getByPlaceholderText(
      "Search dependencies",
    ) as HTMLInputElement;
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();

    fireEvent.change(search, { target: { value: "zzz-no-such-dependency" } });

    expect(screen.getByText("No matching dependencies.")).toBeTruthy();
    const clear = screen.getByRole("button", { name: "Clear search" });
    // The reset lives in the field, not as a button under the empty state.
    expect(search.parentElement?.contains(clear)).toBe(true);

    fireEvent.click(clear);

    expect(search.value).toBe("");
    expect(screen.queryByText("No matching dependencies.")).toBeNull();
  });

  it("widens and wraps the version column instead of clipping it", () => {
    viewport.phone = false;
    const { container } = renderSection();

    const versionHeader = screen.getByRole("columnheader", { name: "Version" });
    expect(versionHeader.style.width).toBe("20%");
    const versionCell = container.querySelector(
      "tbody tr[data-index] td:nth-child(2)",
    );
    expect(versionCell?.firstElementChild?.getAttribute("style")).toContain(
      "overflow-wrap: anywhere",
    );
  });
});
