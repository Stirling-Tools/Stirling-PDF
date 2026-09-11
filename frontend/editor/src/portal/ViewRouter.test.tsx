import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ViewRouter } from "@portal/ViewRouter";

vi.mock("@portal/views/Home", () => ({ Home: () => <div>Home</div> }));
vi.mock("@portal/views/Users", () => ({ Users: () => null }));
vi.mock("@portal/views/Documents", () => ({ Documents: () => null }));
vi.mock("@portal/views/Review", () => ({ Review: () => null }));
vi.mock("@portal/views/Pipelines", () => ({ Pipelines: () => null }));
vi.mock("@portal/views/PipelineBuilder", () => ({
  PipelineBuilder: () => null,
}));
vi.mock("@portal/views/Sources", () => ({ Sources: () => null }));
vi.mock("@portal/views/Integrations", () => ({ Integrations: () => null }));
vi.mock("@portal/views/Infrastructure", () => ({ Infrastructure: () => null }));
vi.mock("@portal/components/billing/PortalBillingGate", () => ({
  PortalBillingGate: BillingLocation,
}));

function BillingLocation() {
  const { pathname, search } = useLocation();
  return (
    <output>
      {pathname}
      {search}
    </output>
  );
}

describe("procurement sales links", () => {
  it("lands on billing with a resumable request and preserves other query parameters", async () => {
    render(
      <MemoryRouter initialEntries={["/processor/procurement?source=sales"]}>
        <Routes>
          <Route path="/processor/*" element={<ViewRouter />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(
        "/processor/usage?source=sales&procurement=start",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
  });
});
