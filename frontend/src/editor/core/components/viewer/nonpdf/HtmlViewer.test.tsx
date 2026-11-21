import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HtmlViewer } from "@editor/components/viewer/nonpdf/HtmlViewer";

const mobile = vi.hoisted(() => ({ value: false }));

vi.mock("@editor/hooks/useIsMobile", () => ({
  useIsMobile: () => mobile.value,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | { defaultValue?: string }) =>
      key === "viewer.nonPdf.htmlPreview"
        ? "HTML preview"
        : typeof options === "string"
          ? options
          : (options?.defaultValue ?? key),
  }),
}));

const FILE = new File(["<html><body>Preview</body></html>"], "sample.html", {
  type: "text/html",
});

function renderViewer() {
  return render(
    <MantineProvider>
      <HtmlViewer file={FILE} />
    </MantineProvider>,
  );
}

beforeEach(() => {
  mobile.value = false;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:html-preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HtmlViewer", () => {
  it("shows the sandboxed preview on desktop", () => {
    renderViewer();

    expect(screen.getByTitle("HTML preview")).toHaveAttribute(
      "sandbox",
      "allow-scripts",
    );
    expect(URL.createObjectURL).toHaveBeenCalledWith(FILE);
  });

  it("keeps the preview opt-in on mobile and can hide it again", () => {
    mobile.value = true;
    renderViewer();

    expect(screen.getByText("Preview off on mobile")).toBeInTheDocument();
    expect(screen.queryByTitle("HTML preview")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Show preview anyway" }),
    );
    expect(screen.getByTitle("HTML preview")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
    expect(screen.queryByTitle("HTML preview")).not.toBeInTheDocument();
    expect(screen.getByText("Preview off on mobile")).toBeInTheDocument();
  });
});
