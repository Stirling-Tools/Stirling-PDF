import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@mantine/core";
import { StampPlacementOverlay } from "@editor/components/viewer/StampPlacementOverlay";

const mocks = vi.hoisted(() => ({
  placementSize: null as { width: number; height: number } | null,
  setPlacementSize: vi.fn(),
  setPlacementPreviewSize: vi.fn(),
}));

vi.mock("@editor/contexts/SignatureContext", () => ({
  useSignature: () => ({
    placementSize: mocks.placementSize,
    setPlacementSize: mocks.setPlacementSize,
    setPlacementPreviewSize: mocks.setPlacementPreviewSize,
  }),
}));

vi.mock("@editor/utils/signaturePreview", () => ({
  buildSignaturePreview: () =>
    Promise.resolve({
      dataUrl: "data:image/png;base64,test",
      width: 100,
      height: 50,
    }),
}));

describe("StampPlacementOverlay", () => {
  beforeEach(() => {
    mocks.placementSize = null;
    mocks.setPlacementSize.mockReset();
    mocks.setPlacementPreviewSize.mockReset();
    document.documentElement.style.fontSize = "16px";
  });

  it("uses the retained PDF size and accepts horizontal Shift+wheel input", async () => {
    const viewer = document.createElement("div");
    Object.defineProperties(viewer, {
      clientWidth: { value: 1000 },
      clientHeight: { value: 1000 },
    });
    document.body.appendChild(viewer);

    const props = {
      containerRef: { current: viewer },
      isActive: true,
      signatureConfig: { signatureType: "image" as const },
      signatureLineZoom: 2,
    };
    const rendered = render(
      <MantineProvider>
        <StampPlacementOverlay {...props} />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(mocks.setPlacementSize).toHaveBeenCalledWith({
        width: 120,
        height: 60,
      });
    });

    mocks.placementSize = { width: 120, height: 60 };
    rendered.rerender(
      <MantineProvider>
        <StampPlacementOverlay {...props} />
      </MantineProvider>,
    );

    fireEvent.mouseMove(viewer, { clientX: 300, clientY: 300 });
    await waitFor(() => {
      expect(
        rendered.container.querySelector('[style*="background-image"]'),
      ).toHaveStyle({ width: "240px", height: "120px" });
    });

    fireEvent.wheel(viewer, { deltaX: -10, shiftKey: true });
    const resized = mocks.setPlacementSize.mock.lastCall?.[0];
    expect(resized?.width).toBeCloseTo(132);
    expect(resized?.height).toBeCloseTo(66);

    rendered.unmount();
    viewer.remove();
  });
});
