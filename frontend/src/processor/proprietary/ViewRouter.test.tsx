import { describe, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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
            <Routes>
              {getAdminRouteExtensions()}
              <Route path="/settings/billing" element={<BillingLocation />} />
            </Routes>
          </Suspense>
        </MemoryRouter>,
      );
      expect(
        await screen.findByText(
          "/settings/billing?source=sales&procurement=start",
        ),
      ).toBeInTheDocument();
    },
  );

  it.each(["/", "/app"])(
    "keeps the old usage bookmark's query and section under %s",
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
      expect(
        await screen.findByText(
          "/settings/billing?procurement=start#ub-license",
        ),
      ).toBeInTheDocument();
    },
  );
});
