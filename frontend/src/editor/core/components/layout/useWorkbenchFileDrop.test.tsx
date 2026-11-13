import { act, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
vi.mock("@editor/contexts/FileContext", () => ({
  useFileSelectors: () => ({ getStirlingFileStubs: () => [] }),
}));
vi.mock("@editor/hooks/useFileHandler", () => ({
  useFileHandler: () => ({ addFiles: vi.fn() }),
}));
vi.mock("@editor/hooks/useDropzoneFiles", () => ({
  useDropzoneFiles: () => vi.fn(async () => []),
}));
vi.mock("@editor/components/toast", () => ({ alert: vi.fn() }));

import {
  useIsWorkbenchFileDragOver,
  useWorkbenchFileDrop,
} from "@editor/components/layout/useWorkbenchFileDrop";

// A drag whose source holds the drop back sends no leave or drop, so the
// overlay must clear itself once dragover stops.

const fileDrag = () =>
  ({
    currentTarget: { contains: () => true },
    target: {},
    dataTransfer: { types: ["Files"], dropEffect: "none" },
    preventDefault: () => {},
  }) as unknown as DragEvent<HTMLElement>;

function setup() {
  const handlers = renderHook(() => useWorkbenchFileDrop(true)).result;
  const overlay = renderHook(() => useIsWorkbenchFileDragOver()).result;
  return { handlers, overlay };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("workbench file drop overlay", () => {
  it("stays up while dragover keeps arriving", () => {
    const { handlers, overlay } = setup();
    act(() => handlers.current.onDragEnter(fileDrag()));
    for (let i = 0; i < 10; i++) {
      act(() => {
        vi.advanceTimersByTime(300);
        handlers.current.onDragOver(fileDrag());
      });
    }
    expect(overlay.current).toBe(true);
    act(() => handlers.current.onDragLeave(fileDrag()));
    expect(overlay.current).toBe(false);
  });

  it("clears itself when dragover stops without a leave or drop", () => {
    const { handlers, overlay } = setup();
    act(() => handlers.current.onDragEnter(fileDrag()));
    expect(overlay.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(overlay.current).toBe(false);
  });
});
