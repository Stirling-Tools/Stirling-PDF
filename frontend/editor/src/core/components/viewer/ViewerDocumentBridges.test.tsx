import { useLayoutEffect } from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpreadAPIBridge } from "@app/components/viewer/SpreadAPIBridge";
import { ScrollAPIBridge } from "@app/components/viewer/ScrollAPIBridge";
import { RotateAPIBridge } from "@app/components/viewer/RotateAPIBridge";
import type { useActiveDocumentId } from "@app/components/viewer/useActiveDocumentId";

const activeDocument = vi.hoisted<{
  id: ReturnType<typeof useActiveDocumentId>;
}>(() => ({ id: "first" }));

const fixture = vi.hoisted(() => {
  const document = () => ({
    setSpreadMode: vi.fn(),
    getSpreadMode: () => 0,
    scrollToPage: vi.fn(),
    setRotation: vi.fn(),
    getRotation: () => 0,
    onRotateChange: () => () => {},
  });
  const bridges = new Map<
    string,
    { api: Record<string, (value: number) => void> }
  >();
  return {
    documents: { first: document(), second: document() },
    bridges,
    registerBridge: (
      kind: string,
      bridge: { api: Record<string, (value: number) => void> } | null,
    ) => {
      if (bridge) bridges.set(kind, bridge);
      else bridges.delete(kind);
    },
    notify: vi.fn(),
  };
});

vi.mock("@app/components/viewer/useActiveDocumentId", () => ({
  useActiveDocumentId: () => activeDocument.id,
  useDocumentReady: () => true,
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({
    registerBridge: fixture.registerBridge,
    triggerImmediateSpreadUpdate: fixture.notify,
    triggerImmediateScrollUpdate: fixture.notify,
    triggerImmediateRotationUpdate: fixture.notify,
  }),
}));
vi.mock("@embedpdf/plugin-spread/react", () => ({
  SpreadMode: { None: 0, Odd: 1 },
  useSpread: (id: "first" | "second") => ({
    provides: fixture.documents[id],
    spreadMode: 0,
  }),
}));
vi.mock("@embedpdf/plugin-scroll/react", () => ({
  useScroll: (id: "first" | "second") => ({
    provides: fixture.documents[id],
    state: { currentPage: 1, totalPages: 3 },
  }),
}));
vi.mock("@embedpdf/plugin-rotate/react", () => ({
  useRotate: (id: "first" | "second") => ({
    provides: fixture.documents[id],
    rotation: 0,
  }),
}));

function RestoreOnLayout({ kind, action }: { kind: string; action: string }) {
  useLayoutEffect(() => {
    fixture.bridges.get(kind)?.api[action](1);
  });
  return null;
}

describe("viewer controls after replacing a document", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeDocument.id = "first";
    fixture.bridges.clear();
  });

  it.each([
    {
      Bridge: SpreadAPIBridge,
      kind: "spread",
      action: "setSpreadMode" as const,
    },
    {
      Bridge: ScrollAPIBridge,
      kind: "scroll",
      action: "scrollToPage" as const,
    },
    {
      Bridge: RotateAPIBridge,
      kind: "rotation",
      action: "setRotation" as const,
    },
  ])(
    "restores $kind on the replacement before paint, even with identical state",
    ({ Bridge, kind, action }) => {
      const view = () => (
        <>
          <Bridge />
          <RestoreOnLayout kind={kind} action={action} />
        </>
      );
      const { rerender } = render(view());
      expect(fixture.documents.first[action]).toHaveBeenCalledOnce();

      activeDocument.id = "second";
      rerender(view());

      expect(fixture.documents.first[action]).toHaveBeenCalledOnce();
      expect(fixture.documents.second[action]).toHaveBeenCalledExactlyOnceWith(
        1,
      );
    },
  );
});
