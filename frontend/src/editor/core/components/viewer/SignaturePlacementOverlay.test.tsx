import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MantineProvider } from "@mantine/core";
import { SignaturePlacementOverlay } from "@editor/components/viewer/SignaturePlacementOverlay";

const mocks = vi.hoisted(() => ({
  setPlacementSize: vi.fn(),
}));

vi.mock("@editor/contexts/SignatureContext", () => ({
  useSignature: () => ({
    placementSize: null,
    setPlacementSize: mocks.setPlacementSize,
  }),
}));

vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => ({
    getZoomState: () => ({ currentZoom: 2 }),
    registerImmediateZoomUpdate: () => () => undefined,
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

describe("SignaturePlacementOverlay", () => {
  beforeEach(() => {
    mocks.setPlacementSize.mockReset();
    document.documentElement.style.fontSize = "16px";
  });

  it("keeps PDF size independent of zoom and resizes only on Shift+wheel", async () => {
    const viewer = document.createElement("div");
    Object.defineProperties(viewer, {
      clientWidth: { value: 1000 },
      clientHeight: { value: 1000 },
    });
    document.body.appendChild(viewer);

    const { container, unmount } = render(
      <MantineProvider>
        <SignaturePlacementOverlay
          containerRef={{ current: viewer }}
          isActive
          signatureConfig={{ signatureType: "image" }}
        />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(mocks.setPlacementSize).toHaveBeenCalledWith({
        width: 100,
        height: 50,
      });
    });

    fireEvent.mouseMove(viewer, { clientX: 300, clientY: 300 });
    await waitFor(() => {
      expect(
        container.querySelector('[style*="background-image"]'),
      ).toHaveStyle({
        width: "200px",
        height: "100px",
      });
    });

    fireEvent.wheel(viewer, { deltaY: -10 });
    expect(mocks.setPlacementSize).toHaveBeenCalledTimes(1);

    fireEvent.wheel(viewer, { deltaY: -10, shiftKey: true });
    const resized = mocks.setPlacementSize.mock.lastCall?.[0];
    expect(resized?.width).toBeCloseTo(110);
    expect(resized?.height).toBeCloseTo(55);

    unmount();
    viewer.remove();
  });
});
