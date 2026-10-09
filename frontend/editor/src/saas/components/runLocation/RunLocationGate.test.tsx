import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunLocationGate } from "@app/components/runLocation/RunLocationGate";
import { startDownload } from "@app/components/runLocation/startDownload";
import { DOWNLOAD_URLS } from "@app/constants/downloads";

vi.mock("@app/components/PublicRouteProviders", () => ({
  PublicRouteProviders: ({ children }: { children: ReactNode }) => (
    <MantineProvider>{children}</MantineProvider>
  ),
}));
vi.mock("react-i18next", () => ({
  Trans: ({ defaults }: { defaults: string }) => defaults,
  useTranslation: () => ({
    t: (_key: string, fallback: string, options: Record<string, string> = {}) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_, name: string) => options[name]),
  }),
}));
vi.mock("@app/components/runLocation/startDownload", () => ({
  startDownload: vi.fn(),
}));

const SEEN_KEY = "stirling.runLocationChosen.v1";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RunLocationGate />}>
          <Route path="*" element={<div>The app</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function choose(label: string) {
  fireEvent.click(screen.getByLabelText(new RegExp(label)));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("RunLocationGate", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(startDownload).mockClear();
  });

  it("shows the chooser instead of the app on a first visit", () => {
    renderAt("/");
    expect(
      screen.getByRole("heading", {
        name: "Where do you want to run Stirling?",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("The app")).not.toBeInTheDocument();
  });

  it("goes straight to the app once a choice has been confirmed", () => {
    window.localStorage.setItem(SEEN_KEY, "true");
    renderAt("/");
    expect(screen.getByText("The app")).toBeInTheDocument();
  });

  it("lets flow links through without recording a choice", () => {
    renderAt("/auth/callback");
    expect(screen.getByText("The app")).toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN_KEY)).toBeNull();
  });

  it("opens the app and records the choice when browser is confirmed", () => {
    renderAt("/login");
    choose("In your browser");
    expect(screen.getByText("The app")).toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN_KEY)).toBe("true");
  });

  it("records the choice before the desktop step and downloads on request", () => {
    renderAt("/");
    choose("On your computer");
    expect(window.localStorage.getItem(SEEN_KEY)).toBe("true");
    expect(
      screen.getByRole("heading", { name: "Get the desktop app" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Download for/ }));
    expect(startDownload).toHaveBeenCalledWith(DOWNLOAD_URLS.MAC);
    expect(
      screen.getByRole("heading", { name: "Your download has started" }),
    ).toBeInTheDocument();

    expect(screen.queryByText("The app")).not.toBeInTheDocument();
  });

  it("shows the server setup with a run command", () => {
    renderAt("/");
    choose("On your server");
    expect(window.localStorage.getItem(SEEN_KEY)).toBe("true");
    expect(
      screen.getByRole("heading", { name: "Set up your server" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/stirlingtools\/stirling-pdf:latest/),
    ).toBeInTheDocument();
  });

  it("returns to the choices from a step, keeping what was picked", () => {
    renderAt("/");
    choose("On your server");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", {
        name: "Where do you want to run Stirling?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/On your server/)).toBeChecked();
  });
});
