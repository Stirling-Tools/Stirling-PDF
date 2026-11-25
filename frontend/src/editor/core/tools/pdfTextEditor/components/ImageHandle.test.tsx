import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageHandle } from "@editor/tools/pdfTextEditor/components/ImageHandle";
import { DisplayTransform } from "@editor/tools/pdfTextEditor/model/DisplayTransform";
import type { ImageObjectSnapshot } from "@editor/tools/pdfTextEditor/types";

const IMAGE: ImageObjectSnapshot = {
  id: "p0-i0",
  pageIndex: 0,
  bounds: { x: 50, y: 50, width: 100, height: 100 },
  matrix: { a: 100, b: 0, c: 0, d: 100, e: 50, f: 50 },
};

function mouse(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX,
    clientY,
  });
}

type ActFlag = { IS_REACT_ACT_ENVIRONMENT?: boolean };

describe("ImageHandle drag", () => {
  // Outside act React renders moves on its own schedule, as a browser does,
  // instead of flushing each one before the next arrives.
  let actEnvironment: boolean | undefined;
  beforeEach(() => {
    actEnvironment = (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT;
    (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = false;
    // jsdom lays nothing out; react-rnd bounds the drag by these sizes.
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return parseFloat(this.style.width) || 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return parseFloat(this.style.height) || 0;
      },
    );
  });
  afterEach(() => {
    (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = actEnvironment;
    vi.restoreAllMocks();
  });

  it("drops the image where the pointer let go when moves outpace rendering", async () => {
    const onTransformCommit = vi.fn();
    render(
      <MantineProvider env="test">
        <div style={{ position: "relative", width: 300, height: 300 }}>
          <ImageHandle
            image={IMAGE}
            pageHeight={300}
            transform={DisplayTransform.identity(300, 300)}
            scale={1}
            selected
            onSelect={() => {}}
            onTransformCommit={onTransformCommit}
          />
        </div>
      </MantineProvider>,
    );
    const handle = screen.getByTestId("pdf-editor-image-p0-i0");
    handle.dispatchEvent(mouse("mousedown", 100, 100));
    await vi.waitFor(() =>
      expect(handle.className).toContain("react-draggable-dragging"),
    );
    // Moves delivered back to back, with no render between them.
    for (const x of [110, 120, 130, 140]) {
      handle.ownerDocument.dispatchEvent(mouse("mousemove", x, 100));
    }
    handle.ownerDocument.dispatchEvent(mouse("mouseup", 140, 100));
    await vi.waitFor(() =>
      expect(handle.className).not.toContain("react-draggable-dragging"),
    );

    expect(onTransformCommit).toHaveBeenCalledTimes(1);
    expect(onTransformCommit.mock.calls[0][0]).toMatchObject({
      x: 90,
      y: 50,
      width: 100,
      height: 100,
    });
  });
});
