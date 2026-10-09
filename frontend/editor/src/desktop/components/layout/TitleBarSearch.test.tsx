import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const slot = vi.hoisted(() => ({ element: null as HTMLElement | null }));
vi.mock("@app/contexts/TitleBarStripContext", () => ({
  useTitleBarStrip: () => ({ enabled: true, searchSlot: slot.element }),
}));
vi.mock("@app/components/shared/superSearch/SuperSearch", () => ({
  default: () => <input aria-label="Editor search" />,
}));
vi.mock("@app/hooks/useSuperSearch", () => ({
  useEditorSearchScopes: () => [],
}));

import { TitleBarSearch } from "@app/components/layout/TitleBarSearch";

function renderAt(path: string) {
  slot.element = document.createElement("div");
  document.body.appendChild(slot.element);
  render(
    <MemoryRouter initialEntries={[path]}>
      <TitleBarSearch />
    </MemoryRouter>,
  );
  return slot.element;
}

it("fills the strip's search slot on editor pages", () => {
  const strip = renderAt("/settings/general");
  expect(strip).toContainElement(screen.getByLabelText("Editor search"));
});

it("leaves the slot to the Processor's own search on its pages", () => {
  renderAt("/processor/pipelines");
  expect(screen.queryByLabelText("Editor search")).toBeNull();
});
