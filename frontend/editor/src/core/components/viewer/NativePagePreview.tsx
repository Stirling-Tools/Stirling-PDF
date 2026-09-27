import type { ReactElement } from "react";

/**
 * Stub: web builds paint pages through the engine worker, so there is nothing
 * to show ahead of it. The desktop build shadows this with a strip of pages
 * rendered natively the moment a file lands.
 */
export function NativePagePreview(_props: {
  filePath?: string | null;
}): ReactElement | null {
  return null;
}
