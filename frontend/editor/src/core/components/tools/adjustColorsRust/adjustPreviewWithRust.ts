import type { PreviewAdjustment } from "@app/components/tools/adjustContrast/AdjustContrastPreview";
import { getToolsCore } from "@app/services/toolsCore";

/** The preview's colour step through the Rust wasm, the code that makes the output. */
export const adjustPreviewWithRust: PreviewAdjustment = async (
  source,
  parameters,
) => {
  const tools = await getToolsCore();
  const adjusted = document.createElement("canvas");
  adjusted.width = source.width;
  adjusted.height = source.height;
  const context = adjusted.getContext("2d");
  if (!context) throw new Error("Canvas 2D context unavailable");
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, adjusted.width, adjusted.height);
  tools.adjustRgba(image.data, parameters);
  context.putImageData(image, 0, 0);
  return adjusted;
};
