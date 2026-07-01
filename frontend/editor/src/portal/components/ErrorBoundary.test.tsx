import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "@portal/components/ErrorBoundary";

// Deterministic i18n: return the key so assertions don't depend on the async
// TOML backend ever loading. Mirrors the editor's test setup convention.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

function Boom(): never {
  throw new Error("kaboom");
}

describe("ErrorBoundary", () => {
  it("renders the default fallback when a child throws", () => {
    // The boundary logs the caught error; silence it for a clean test run.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("errorBoundary.title")).toBeInTheDocument();
    expect(screen.getByText("errorBoundary.description")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("recovers when retry is clicked and the child stops throwing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    // A child that throws once, then renders fine after an external toggle.
    let shouldThrow = true;
    function Toggleable() {
      const [, force] = useState(0);
      // Expose a way for the test to flip the flag and re-render is driven by
      // ErrorBoundary remounting the subtree on reset.
      if (shouldThrow) throw new Error("kaboom");
      void force;
      return <div>recovered content</div>;
    }

    render(
      <ErrorBoundary>
        <Toggleable />
      </ErrorBoundary>,
    );

    // Fallback is shown.
    expect(screen.getByText("errorBoundary.title")).toBeInTheDocument();

    // Stop throwing, then click retry to clear the boundary's error state.
    shouldThrow = false;
    fireEvent.click(screen.getByText("errorBoundary.retry"));

    expect(screen.getByText("recovered content")).toBeInTheDocument();
    expect(screen.queryByText("errorBoundary.title")).not.toBeInTheDocument();
    spy.mockRestore();
  });
});
