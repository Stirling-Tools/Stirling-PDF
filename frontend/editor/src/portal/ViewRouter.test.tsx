import { describe, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, useLocation } from "react-router-dom";
import { ViewRouter } from "@portal/ViewRouter";
import { getAdminRouteExtensions } from "@app/routes/adminRouteExtensions";

vi.mock("@app/routes/hasPortal", () => ({ HAS_PORTAL: true }));
vi.mock("@portal/PortalApp", () => ({ PortalApp: () => <ViewRouter /> }));

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
  it.each(["/", "/app"])(
    "accepts the short link under basename %s without duplicating the prefix",
    async (basename) => {
      render(
        <MemoryRouter
          basename={basename}
          initialEntries={[
            `${basename === "/" ? "" : basename}/procurement?source=sales`,
          ]}
        >
          <Suspense fallback={null}>
            <Routes>{getAdminRouteExtensions()}</Routes>
          </Suspense>
        </MemoryRouter>,
      );
      expect(
        await screen.findByText(
          "/processor/usage?source=sales&procurement=start",
        ),
      ).toBeInTheDocument();
    },
  );
});
