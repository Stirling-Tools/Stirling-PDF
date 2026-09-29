/**
 * Which document the PDF/UA descriptions belong to.
 *
 * A description is keyed by an image's position inside one file, so it is only meaningful for the
 * file it was written against. The panel therefore offers the description fields for a single
 * selection only, and forgets what was typed as soon as the selection changes.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import ConvertToPdfUaSettings from "@app/components/tools/convert/ConvertToPdfUaSettings";
import { defaultParameters } from "@app/hooks/tools/convert/useConvertParameters";
import type { ConvertParameters } from "@app/hooks/tools/convert/useConvertParameters";
import type { StirlingFile } from "@app/types/fileContext";

// Render the English fallbacks (the test i18n instance has no loaded locale).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown, options?: Record<string, unknown>) => {
      const text = typeof fallback === "string" ? fallback : key;
      return options
        ? text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options[name]))
        : text;
    },
  }),
}));

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@app/services/apiClient", () => ({ default: { post: api.post } }));

// The real hook parses the PDF in a worker, which is not what this file is about.
vi.mock("@app/hooks/usePdfSignatureDetection", () => ({
  usePdfSignatureDetection: () => ({
    hasDigitalSignatures: false,
    isChecking: false,
  }),
}));

const file = (name: string, content = "%PDF-1.7") =>
  new File([content], name, { type: "application/pdf" }) as StirlingFile;

const parametersWith = (altText: string): ConvertParameters => ({
  ...defaultParameters,
  fromExtension: "pdf",
  toExtension: "pdfua",
  pdfUaOptions: { ...defaultParameters.pdfUaOptions, altText },
});

function renderPanel(selectedFiles: StirlingFile[], altText = "") {
  const onParameterChange = vi.fn();
  const view = render(
    <MantineProvider>
      <ConvertToPdfUaSettings
        parameters={parametersWith(altText)}
        onParameterChange={onParameterChange}
        selectedFiles={selectedFiles}
      />
    </MantineProvider>,
  );
  const rerenderWith = (files: StirlingFile[], text = altText) =>
    view.rerender(
      <MantineProvider>
        <ConvertToPdfUaSettings
          parameters={parametersWith(text)}
          onParameterChange={onParameterChange}
          selectedFiles={files}
        />
      </MantineProvider>,
    );
  return { onParameterChange, rerenderWith };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.post.mockResolvedValue({
    data: {
      figuresNeedingDescription: [{ key: "0:1", page: 1, kind: "image" }],
    },
  });
});

describe("PDF/UA descriptions are scoped to one document", () => {
  test("one file: the images can be listed and described", async () => {
    const { onParameterChange } = renderPanel([file("report.pdf")]);

    await userEvent.click(screen.getByTestId("pdfua-find-figures"));
    const field = await screen.findByTestId("pdfua-alt-text-0:1");
    await userEvent.type(field, "B");

    expect(onParameterChange).toHaveBeenCalledWith(
      "pdfUaOptions",
      expect.objectContaining({ altText: "0:1=B" }),
    );
  });

  test("several files: no description fields, and a reason why", () => {
    renderPanel([file("report.pdf"), file("appendix.pdf")]);

    expect(
      screen.getByTestId("pdfua-alt-text-single-file-only"),
    ).toHaveTextContent(
      /Convert these 2 files to tag them, then convert one at a time/,
    );
    expect(screen.queryByTestId("pdfua-find-figures")).toBeNull();
  });

  test("several files: descriptions already typed are dropped, not carried over", async () => {
    const { onParameterChange, rerenderWith } = renderPanel(
      [file("report.pdf")],
      "0:1=Bar chart of revenue",
    );

    rerenderWith([file("report.pdf"), file("appendix.pdf")]);

    await waitFor(() =>
      expect(onParameterChange).toHaveBeenCalledWith(
        "pdfUaOptions",
        expect.objectContaining({ altText: "" }),
      ),
    );
  });

  test("swapping the single file clears the descriptions written for the old one", async () => {
    const { onParameterChange, rerenderWith } = renderPanel(
      [file("report.pdf")],
      "0:1=Bar chart of revenue",
    );

    rerenderWith([file("other.pdf")]);

    await waitFor(() =>
      expect(onParameterChange).toHaveBeenCalledWith(
        "pdfUaOptions",
        expect.objectContaining({ altText: "" }),
      ),
    );
  });

  test("mounting with stored descriptions keeps them, so an automation step survives editing", () => {
    const { onParameterChange } = renderPanel(
      [file("report.pdf")],
      "0:1=Bar chart of revenue",
    );

    expect(onParameterChange).not.toHaveBeenCalled();
  });
});
