import { beforeEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const h = vi.hoisted(() => ({
  mode: "selfhosted" as "saas" | "selfhosted" | "local" | null,
  access: { granted: false, settled: false },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@app/hooks/useConnectionMode", () => ({
  useConnectionMode: () => h.mode,
}));
vi.mock("@app/hooks/usePortalAccess", () => ({
  usePortalAccessState: () => h.access,
}));

import { PortalAuthBoundary } from "@app/portal/auth/PortalAuthBoundary";
import { OPEN_SIGN_IN_EVENT } from "@app/constants/signInEvents";

function renderAt(path: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/processor/*"
            element={
              <PortalAuthBoundary>
                <p>Processor</p>
              </PortalAuthBoundary>
            }
          />
          <Route path="*" element={<p>Editor</p>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  h.mode = "selfhosted";
  h.access = { granted: false, settled: false };
});

it("lets an account with Processor access in", () => {
  h.access = { granted: true, settled: true };
  renderAt("/processor/pipelines");
  expect(screen.getByText("Processor")).toBeInTheDocument();
});

it("waits while access is still being worked out", () => {
  renderAt("/processor");
  expect(screen.queryByText("Processor")).toBeNull();
  expect(screen.queryByText("Editor")).toBeNull();
  expect(screen.getByRole("status")).toBeInTheDocument();
});

it("sends a connected account without access to the editor", () => {
  const signIn = vi.fn();
  window.addEventListener(OPEN_SIGN_IN_EVENT, signIn);
  h.access = { granted: false, settled: true };

  renderAt("/processor");

  expect(screen.getByText("Editor")).toBeInTheDocument();
  expect(signIn).not.toHaveBeenCalled();
  window.removeEventListener(OPEN_SIGN_IN_EVENT, signIn);
});

it("asks a local-mode user to sign in on the way back to the editor", () => {
  const signIn = vi.fn();
  window.addEventListener(OPEN_SIGN_IN_EVENT, signIn);
  h.mode = "local";
  h.access = { granted: false, settled: true };

  renderAt("/processor");

  expect(screen.getByText("Editor")).toBeInTheDocument();
  expect(signIn).toHaveBeenCalledOnce();
  window.removeEventListener(OPEN_SIGN_IN_EVENT, signIn);
});
