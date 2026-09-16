import { describe, expect, it, vi } from "vitest";
import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ViewRouter } from "@processor/ViewRouter";
import { getAdminRouteExtensions } from "@app/routes/adminRouteExtensions";

vi.mock("@app/routes/hasProcessor", () => ({ HAS_PROCESSOR: true }));
vi.mock("@processor/ProcessorApp", () => ({ ProcessorApp: () => <ViewRouter /> }));

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
