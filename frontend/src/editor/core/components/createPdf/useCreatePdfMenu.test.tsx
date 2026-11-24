import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { availability } = vi.hoisted(() => ({
  availability: { enabled: true, loading: false },
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
      endpoints.map((endpoint) => [endpoint, availability.enabled]),
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
});
