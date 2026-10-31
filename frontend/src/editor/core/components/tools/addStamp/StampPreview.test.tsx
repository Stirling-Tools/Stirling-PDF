import { MantineProvider } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StampPreview from "@editor/components/tools/addStamp/StampPreview";
import { defaultParameters } from "@editor/components/tools/addStamp/useAddStampParameters";

vi.mock("@editor/hooks/useThumbnailGeneration", () => ({
  useThumbnailGeneration: () => ({ requestThumbnail: vi.fn() }),
}));

const A4_HEIGHT_PTS = 841.89;

class LoadedImage {
  width = 250;
  height = 100;
  onload: (() => void) | null = null;
  set src(_url: string) {
    queueMicrotask(() => act(() => this.onload?.()));
  }
}

describe("StampPreview image drag", () => {
  const onParameterChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Image", LoadedImage);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    URL.createObjectURL = vi.fn(() => "blob:stamp");
    URL.revokeObjectURL = vi.fn();
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(600);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const renderStamp = async (rotation: number) => {
    render(
      <MantineProvider>
        <StampPreview
          parameters={{
            ...defaultParameters,
            stampType: "image",
            stampImage: new File(["image"], "stamp.png", { type: "image/png" }),
            fontSize: 40,
            rotation,
          }}
          onParameterChange={onParameterChange}
        />
      </MantineProvider>,
    );
    return (await screen.findByAltText("addStamp.stampPreviewAlt"))
      .parentElement as HTMLElement;
  };

  const lastOverride = (key: "overrideX" | "overrideY") =>
    onParameterChange.mock.calls.filter(([name]) => name === key).at(-1)?.[1];

  it("stops a rotated stamp at its footprint when dragged past the top-left", async () => {
    const stamp = await renderStamp(90);

    fireEvent.pointerDown(stamp, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(stamp.parentElement as HTMLElement, {
      clientX: -5000,
      clientY: -5000,
      pointerId: 1,
    });

    expect(lastOverride("overrideX")).toBeCloseTo(40);
    expect(lastOverride("overrideY")).toBeCloseTo(A4_HEIGHT_PTS - 100);
  });

  it("stops an unrotated stamp at the page edge", async () => {
    const stamp = await renderStamp(0);

    fireEvent.pointerDown(stamp, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(stamp.parentElement as HTMLElement, {
      clientX: -5000,
      clientY: -5000,
      pointerId: 1,
    });

    expect(lastOverride("overrideX")).toBeCloseTo(0);
    expect(lastOverride("overrideY")).toBeCloseTo(A4_HEIGHT_PTS - 40);
  });
});
