import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";

// Deterministic labels; the view + DocsNav + MarkdownDoc all use useTranslation.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // 2nd arg may be a default string or i18next interpolation options ({count}).
    t: (key: string, opts?: unknown) => (typeof opts === "string" ? opts : key),
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import { DeveloperDocs } from "@portal/views/DeveloperDocs";

const renderDocs = (ui: ReactElement) =>
  render(
    <MemoryRouter initialEntries={["/processor/docs"]}>
      <MantineProvider>{ui}</MantineProvider>
    </MemoryRouter>,
  );

describe("DeveloperDocs — markdown browser over the generated manifest", () => {
  it("keeps Overview static (open, no toggle) and other sections collapsed", () => {
    renderDocs(<DeveloperDocs />);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    // Overview is static: its items show, and it has no toggle button.
    expect(
      screen.getByRole("button", { name: "Production Deployment Guide" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Overview/i }),
    ).not.toBeInTheDocument();
    // Other sections collapse, so their items are hidden until expanded.
    expect(
      screen.queryByRole("button", { name: "Kubernetes Guide" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Benefits of Stirling PDF/i)).toBeInTheDocument();
  });

  it("expands a collapsible section when its header is clicked", () => {
    renderDocs(<DeveloperDocs />);
    fireEvent.click(screen.getByRole("button", { name: /Installation/i }));
    expect(
      screen.getByRole("button", { name: "Kubernetes Guide" }),
    ).toBeInTheDocument();
  });

  it("searches doc content (not just titles), shows a snippet, and navigates", async () => {
    renderDocs(<DeveloperDocs />);
    // "Tesseract" appears in the OCR doc body but in no doc title — a result
    // whose snippet contains it proves full-text (content) search.
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Tesseract" },
    });
    const hits = await screen.findAllByRole("button", { name: /Tesseract/i });
    expect(hits.length).toBeGreaterThan(0);
    fireEvent.click(hits[0]);
    await waitFor(() =>
      expect(
        screen.queryByText(/Benefits of Stirling PDF/i),
      ).not.toBeInTheDocument(),
    );
  });

  it("follows an internal doc: link inside the rendered markdown", async () => {
    renderDocs(<DeveloperDocs />);
    // The Getting Started body links to the Migration guide via the doc: scheme.
    fireEvent.click(screen.getByRole("link", { name: /Migration Guide/i }));
    await waitFor(() =>
      expect(
        screen.queryByText(/Benefits of Stirling PDF/i),
      ).not.toBeInTheDocument(),
    );
  });
});
