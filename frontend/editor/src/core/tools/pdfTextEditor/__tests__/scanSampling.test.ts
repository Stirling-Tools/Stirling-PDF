import { describe, it, expect, vi } from "vitest";
import { DisplayTransform } from "@app/tools/pdfTextEditor/model/DisplayTransform";
import { TableModel } from "@app/tools/pdfTextEditor/model/TableModel";
import { sampleTableColors } from "@app/tools/pdfTextEditor/util/scanSampling";

describe("scanned table color sampling", () => {
  it.each([0, 90, 180, 270])(
    "samples the displayed cells on a cropped page rotated %s degrees",
    (rotation) => {
      const swapped = rotation === 90 || rotation === 270;
      const transform = DisplayTransform.fromCropAndRotate(
        50,
        100,
        300,
        400,
        rotation / 90,
        swapped ? 400 : 300,
        swapped ? 300 : 400,
      );
      const table = new TableModel({
        id: "table",
        pageIndex: 0,
        colEdges: [80, 180],
        rowEdges: [300, 220],
        cellRuns: [[null]],
        hLinePtrs: [],
        vLinePtrs: [],
        lineWidth: 1,
        fontSize: 11,
      }).snapshot();
      const corners = [transform.apply(92, 229.6), transform.apply(168, 290.4)];
      const x = Math.round(Math.min(...corners.map((p) => p.x)) * 2);
      const y = Math.round(
        (transform.displayHeight - Math.max(...corners.map((p) => p.y))) * 2,
      );
      const width = Math.round(Math.abs(corners[1].x - corners[0].x) * 2);
      const height = Math.round(Math.abs(corners[1].y - corners[0].y) * 2);
      const getImageData = vi.fn(
        (left: number, top: number, w: number, h: number) => {
          const cell = left === x && top === y && w === width && h === height;
          const data = new Uint8ClampedArray(w * h * 4);
          for (let i = 0; i < data.length; i += 4)
            data.set(cell ? [30, 50, 100, 255] : [250, 250, 250, 255], i);
          return { data };
        },
      );
      const canvas = {
        width: transform.displayWidth * 2,
        height: transform.displayHeight * 2,
        getContext: () => ({ canvas, getImageData }),
      } as unknown as HTMLCanvasElement;
      const colors = sampleTableColors(canvas, table, transform);
      expect(getImageData).toHaveBeenCalledWith(x, y, width, height);
      expect(colors?.cells[0][0]?.bg).toEqual({ r: 30, g: 50, b: 100, a: 255 });
      expect(colors?.paper).toEqual({ r: 250, g: 250, b: 250, a: 255 });
    },
  );
});
