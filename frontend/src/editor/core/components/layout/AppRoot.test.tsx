import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppRoot } from "@editor/components/layout/AppRoot";

const setup = vi.hoisted(() => ({ pending: false }));
vi.mock("@editor/components/startup/ServerSetupGate", () => ({
  useServerSetupPending: () => setup.pending,
}));
vi.mock("@editor/components/startup/StartupPrompts", () => ({
  StartupPrompts: () => <div>Setup</div>,
}));
vi.mock("@editor/pages/HomePage", () => ({ default: () => <div>Editor</div> }));
vi.mock("@editor/hooks/usePdfEngineWarmUp", () => ({
  usePdfEngineWarmUp: () => {},
}));

function renderRoot() {
  render(
    <MemoryRouter>
      <AppRoot />
    </MemoryRouter>,
  );
}

describe("AppRoot", () => {
  beforeEach(() => {
    setup.pending = false;
  });

  it("shows the editor once setup is done", () => {
    renderRoot();
    expect(screen.getByText("Editor")).toBeInTheDocument();
  });

  it("keeps the editor out of the page while setup is pending", () => {
    setup.pending = true;
    renderRoot();
    expect(screen.getByText("Setup")).toBeInTheDocument();
    expect(screen.queryByText("Editor")).toBeNull();
  });
});
