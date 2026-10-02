import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@portal/DesktopProcessor", () => ({
  DesktopProcessor: () => <p>Processor page</p>,
}));
vi.mock("@app/components/layout/AppRoot", () => ({
  AppRoot: () => <p>Editor app</p>,
}));

import Landing from "@app/routes/Landing";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/*" element={<Landing />} />
      </Routes>
    </MemoryRouter>,
  );
}

it.each(["/processor", "/processor/pipelines/p-1"])(
  "renders the Processor inside the app on %s",
  async (path) => {
    renderAt(path);
    expect(await screen.findByText("Processor page")).toBeInTheDocument();
    expect(screen.queryByText("Editor app")).toBeNull();
  },
);

it.each(["/", "/settings/billing", "/processorish"])(
  "renders the editor app on %s",
  (path) => {
    renderAt(path);
    expect(screen.getByText("Editor app")).toBeInTheDocument();
  },
);
