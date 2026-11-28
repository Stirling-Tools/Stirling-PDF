import { render, renderHook, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { availability } = vi.hoisted(() => ({
  availability: {
    enabled: true,
    loading: false,
    disabled: new Set<string>(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@editor/hooks/useCreatePdf", () => ({
  useCreatePdf: () => ({
    stage: "idle",
    createBlank: vi.fn(),
    createFromSource: vi.fn(),
  }),
}));
vi.mock("@editor/hooks/useEndpointConfig", () => ({
  useMultipleEndpointsEnabled: (endpoints: string[]) => ({
    endpointStatus: Object.fromEntries(
      endpoints.map((endpoint) => [
        endpoint,
        availability.enabled && !availability.disabled.has(endpoint),
      ]),
    ),
    endpointDetails: {},
    loading: availability.loading,
    error: null,
    refetch: vi.fn(),
  }),
}));

import { useCreatePdfMenu } from "@editor/components/createPdf/useCreatePdfMenu";

function itemIds() {
  const { result } = renderHook(() => useCreatePdfMenu());
  return result.current.items.map((item) => item.id);
}

describe("useCreatePdfMenu", () => {
  beforeEach(() => {
    availability.enabled = true;
    availability.loading = false;
    availability.disabled = new Set();
  });

  it("offers converting another file when the server can convert", () => {
    expect(itemIds()).toEqual(["blank", "source"]);
  });

  it("offers only a blank page when the server cannot convert", () => {
    availability.enabled = false;
    expect(itemIds()).toEqual(["blank"]);
  });

  it("offers only a blank page until conversion is known to be available", () => {
    availability.loading = true;
    expect(itemIds()).toEqual(["blank"]);
  });

  it("offers converting another file when only image conversion is on", () => {
    availability.disabled = new Set(["file-to-pdf"]);
    const { result } = renderHook(() => useCreatePdfMenu());
    expect(result.current.items.map((item) => item.id)).toEqual([
      "blank",
      "source",
    ]);
    render(<>{result.current.dialogs}</>);
    const accepted = screen
      .getByTestId("create-pdf-source-input")
      .getAttribute("accept")!
      .split(",");
    expect(accepted).toEqual(expect.arrayContaining([".pdf", ".png"]));
    expect(accepted).not.toContain(".docx");
  });

  it("offers only the formats whose conversion the server has turned on", () => {
    availability.disabled = new Set(["img-to-pdf"]);
    const { result } = renderHook(() => useCreatePdfMenu());
    render(<>{result.current.dialogs}</>);
    const accepted = screen
      .getByTestId("create-pdf-source-input")
      .getAttribute("accept")!
      .split(",");
    expect(accepted).toEqual(expect.arrayContaining([".pdf", ".docx"]));
    expect(accepted).not.toContain(".png");
  });
});
