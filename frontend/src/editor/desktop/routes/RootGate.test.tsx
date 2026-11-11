import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const h = vi.hoisted(() => ({
  view: "processor" as string,
  server: { connected: true, settled: true },
}));
vi.mock("@editor/contexts/PreferencesContext", () => ({
  usePreferences: () => ({ preferences: { defaultStartupView: h.view } }),
}));
vi.mock("@editor/hooks/useConnectedServer", () => ({
  useConnectedServerState: () => h.server,
}));

function Where() {
  return <output aria-label="Path">{useLocation().pathname}</output>;
}

async function launch(path = "/") {
  // Once per launch is module state, so each case is a fresh launch.
  vi.resetModules();
  const { RootGate } = await import("@editor/routes/RootGate");
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <RootGate>
              <Where />
            </RootGate>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { ...view, RootGate };
}

beforeEach(() => {
  h.view = "processor";
  h.server = { connected: true, settled: true };
});

it("opens the Processor on launch when it is the chosen start", async () => {
  await launch();
  expect(screen.getByLabelText("Path")).toHaveTextContent("/processor");
});

it("leaves the editor alone for any other start", async () => {
  h.view = "read";
  await launch();
  expect(screen.getByLabelText("Path")).toHaveTextContent(/^\/$/);
});

it("holds the editor back until the connection is known", async () => {
  h.server = { connected: false, settled: false };
  await launch();
  expect(screen.queryByLabelText("Path")).toBeNull();
});

it("stays in the editor without a connected server", async () => {
  h.server = { connected: false, settled: true };
  await launch();
  expect(screen.getByLabelText("Path")).toHaveTextContent(/^\/$/);
});

it("keeps a deep link the app was opened on", async () => {
  await launch("/settings/general");
  expect(screen.getByLabelText("Path")).toHaveTextContent("/settings/general");
});

it("decides once, so coming back to the editor does not bounce", async () => {
  const { unmount, RootGate } = await launch();
  unmount();

  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="*"
          element={
            <RootGate>
              <Where />
            </RootGate>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByLabelText("Path")).toHaveTextContent(/^\/$/);
});
