import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const slot = vi.hoisted(() => ({ element: null as HTMLElement | null }));
vi.mock("@editor/contexts/TitleBarStripContext", () => ({
  useTitleBarStrip: () => ({ enabled: true, searchSlot: slot.element }),
}));
vi.mock("@editor/components/shared/superSearch/SuperSearch", () => ({
  default: ({ inputId }: { inputId?: string }) => (
    <input aria-label="Processor search" id={inputId} />
  ),
}));
vi.mock("@processor/hooks/usePortalSearchResults", () => ({
  usePortalSearchResults: () => [],
  usePortalSearchScopes: () => [],
}));
vi.mock("@processor-proprietary/components/PortalSearchBar", () => ({
  PortalSearchBar: () => <input aria-label="Inline search" />,
}));

import { PortalSearchBar } from "@editor/portal/components/PortalSearchBar";

it("puts the Processor's search in the title-bar strip", () => {
  slot.element = document.createElement("div");
  document.body.appendChild(slot.element);

  render(<PortalSearchBar />);

  expect(slot.element).toContainElement(
    screen.getByLabelText("Processor search"),
  );
  expect(screen.queryByLabelText("Inline search")).toBeNull();
});

it("keeps its own row where there is no strip", () => {
  slot.element = null;

  render(<PortalSearchBar />);

  expect(screen.getByLabelText("Inline search")).toBeInTheDocument();
});
