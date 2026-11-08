import { describe, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ViewRouter } from "@processor/ViewRouter";
import { getAdminRouteExtensions } from "@editor/routes/adminRouteExtensions";

vi.mock("@editor/routes/hasPortal", () => ({ HAS_PORTAL: true }));
vi.mock("@processor/PortalApp", () => ({ PortalApp: () => <ViewRouter /> }));
vi.mock("@processor/EnterpriseApp", () => ({
  EnterpriseApp: () => <BillingLocation />,
}));

vi.mock("@processor/views/Home", () => ({ Home: () => <div>Home</div> }));
vi.mock("@processor/views/Users", () => ({ Users: () => null }));
vi.mock("@processor/views/Documents", () => ({ Documents: () => null }));
vi.mock("@processor/views/Review", () => ({ Review: () => null }));
vi.mock("@processor/views/Pipelines", () => ({ Pipelines: () => null }));
vi.mock("@processor/views/PipelineBuilder", () => ({
  PipelineBuilder: () => null,
}));
vi.mock("@processor/views/Sources", () => ({ Sources: () => null }));
vi.mock("@processor/views/Integrations", () => ({ Integrations: () => null }));

function BillingLocation() {
  const { pathname, search, hash } = useLocation();
  return (
    <output>
      {pathname}
      {search}
      {hash}
    </output>
  );
}

describe("procurement sales links", () => {
  it.each(["/", "/app"])(
    "sends the old /procurement link to the Enterprise page under basename %s",
    async (basename) => {
      render(
        <MemoryRouter
          basename={basename}
          initialEntries={[
            `${basename === "/" ? "" : basename}/procurement?source=sales`,
          ]}
        >
          <Suspense fallback={null}>
            <Routes>
              {getAdminRouteExtensions()}
              <Route path="/settings/billing" element={<BillingLocation />} />
            </Routes>
          </Suspense>
        </MemoryRouter>,
      );
      expect(
        await screen.findByText("/enterprise?source=sales"),
      ).toBeInTheDocument();
    },
  );

  it.each(["/", "/app"])(
    "sends an old usage bookmark that started the trial to the Enterprise page under %s",
    async (basename) => {
      render(
        <MemoryRouter
          basename={basename}
          initialEntries={[
            `${basename === "/" ? "" : basename}/processor/usage?procurement=start#ub-license`,
          ]}
        >
          <Suspense fallback={null}>
            <Routes>
              {getAdminRouteExtensions()}
              <Route path="/settings/billing" element={<BillingLocation />} />
            </Routes>
          </Suspense>
        </MemoryRouter>,
      );
      expect(await screen.findByText("/enterprise")).toBeInTheDocument();
    },
  );
});
