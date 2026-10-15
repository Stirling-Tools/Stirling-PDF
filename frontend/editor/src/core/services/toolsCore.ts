/** The MIT tools in tools-core/, built as the `stirling-tools` wasm module. */
import { loadRustToolsModule } from "@app/services/rustToolsModule";

/** Percentages from 0 to 200, where 100 leaves that property unchanged. */
export interface ColorAdjustments {
  contrast: number;
  brightness: number;
  saturation: number;
  red: number;
  green: number;
  blue: number;
}

export interface ToolsCore {
  /**
   * Appends an adjusted image of each page of `source` to the empty document
   * `target`. Both are pdfiumService handles the caller still owns. Throws with
   * the library's reason on failure.
   */
  adjustColors(
    source: number,
    target: number,
    adjustments: ColorAdjustments,
  ): void;

  /**
   * Adjusts packed RGBA pixels (an `ImageData`'s `data`) in place, leaving
   * alpha as it was: the per-pixel step of {@link ToolsCore.adjustColors},
   * for previews.
   */
  adjustRgba(pixels: Uint8ClampedArray, adjustments: ColorAdjustments): void;
}

function wasmUrl(): string {
  return new URL(
    `${import.meta.env.BASE_URL}wasm/stirling-tools.wasm`,
    window.location.href,
  ).href;
}

function adjustmentArgs(adjustments: ColorAdjustments): number[] {
  return [
    adjustments.contrast,
    adjustments.brightness,
    adjustments.saturation,
    adjustments.red,
    adjustments.green,
    adjustments.blue,
  ];
}

/** The tools bound to the current PDFium module. */
export async function getToolsCore(): Promise<ToolsCore> {
  const module = await loadRustToolsModule(wasmUrl());
  return {
    adjustColors(source, target, adjustments) {
      module.call(
        "stirling_adjust_colors",
        source,
        target,
        ...adjustmentArgs(adjustments),
      );
    },
    adjustRgba(pixels, adjustments) {
      module.withBytes(pixels, (pointer) =>
        module.call(
          "stirling_adjust_rgba",
          pointer,
          pixels.length,
          ...adjustmentArgs(adjustments),
        ),
      );
    },
  };
}
