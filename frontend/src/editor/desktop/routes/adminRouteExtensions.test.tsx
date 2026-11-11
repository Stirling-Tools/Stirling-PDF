import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Suspense } from "react";

vi.mock("@processor/DesktopProcessor", () => ({
  DesktopProcessor: () => <p>Processor page</p>,
}));

import { getAdminRouteExtensions } from "@editor/routes/adminRouteExtensions";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={null}>
        <Routes>
          {getAdminRouteExtensions()}
          <Route path="*" element={<p>Editor app</p>} />
        </Routes>
      </Suspense>
    </MemoryRouter>,
  );
}

it.each(["/processor", "/processor/pipelines/p-1"])(
  "renders the Processor instead of the editor on %s",
  async (path) => {
    renderAt(path);
    expect(await screen.findByText("Processor page")).toBeInTheDocument();
    expect(screen.queryByText("Editor app")).toBeNull();
  },
);

it.each(["/", "/settings/billing", "/processorish"])(
  "renders the editor on %s",
  (path) => {
    renderAt(path);
    expect(screen.getByText("Editor app")).toBeInTheDocument();
  },
);
