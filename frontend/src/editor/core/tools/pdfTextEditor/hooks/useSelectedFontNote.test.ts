import { readFileSync } from "node:fs";
import path from "node:path";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import { useSelectedFontNote } from "@editor/tools/pdfTextEditor/hooks/useSelectedFontNote";
import type { EditorViewState } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import {
  SERVER_FONTS_URL,
  forgetServerFontList,
  loadServerFontBytes,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import { resetDeviceFontEmbedCache } from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";

const SERIF_BOLD = "1".repeat(64);

const SERIF_BOLD_TTF = readFileSync(
  path.resolve(
    __dirname,
    "../../../../../../../app/core/src/main/resources/static/fonts/DejaVuSerif-Bold.ttf",
  ),
);

const STATE = {
  pages: [
    {
      pageIndex: 0,
      runs: [
        {
          id: "a",
          pageIndex: 0,
          text: "Hello",
          fontId: "device:DejaVu Serif Bold",
          fontSubset: false,
        },
      ],
    },
  ],
} as unknown as EditorViewState;

const SELECTION = { runIds: ["a"] } as unknown as SelectionState;

describe("useSelectedFontNote", () => {
  beforeEach(() => {
    get.mockReset();
    forgetServerFontList();
    resetDeviceFontEmbedCache();
    get.mockImplementation(async (url: string) => {
      if (url === SERVER_FONTS_URL) {
        return {
          data: {
            families: [
              {
                family: "DejaVu Serif",
                faces: [
                  { id: SERIF_BOLD, style: "Bold", bold: true, italic: false },
                ],
              },
            ],
          },
        };
      }
      return {
        data: SERIF_BOLD_TTF.buffer.slice(
          SERIF_BOLD_TTF.byteOffset,
          SERIF_BOLD_TTF.byteOffset + SERIF_BOLD_TTF.byteLength,
        ),
      };
    });
  });

  it("drops the unknown-coverage note once the server face arrives", async () => {
    const { result } = renderHook(() => useSelectedFontNote(STATE, SELECTION));
    expect(result.current).toBe("pdfTextEditor.inspector.fontUnknownCoverage");

    await act(async () => {
      await loadServerFontBytes("DejaVu Serif Bold");
    });

    expect(result.current).toBeNull();
  });
});
