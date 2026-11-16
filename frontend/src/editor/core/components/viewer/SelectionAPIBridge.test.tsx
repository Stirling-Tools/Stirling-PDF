import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SelectionAPIBridge } from "@editor/components/viewer/SelectionAPIBridge";
import type {
  BridgeRef,
  SelectionAPIWrapper,
  SelectionState,
} from "@editor/contexts/viewer/viewerBridges";

const mock = vi.hoisted(() => ({
  activeDocumentId: "first",
  register:
    vi.fn<
      (
        kind: string,
        bridge: BridgeRef<SelectionState, SelectionAPIWrapper> | null,
      ) => void
    >(),
  onSelectionChange:
    vi.fn<(listener: (event: { selection: boolean }) => void) => () => void>(),
  getSelectedText: vi.fn<
    (documentId?: string) => {
      wait: (resolve: (texts: string[]) => void) => void;
    }
  >(),
  copyText: vi.fn(async (text: string) => text.length > 0),
}));

vi.mock("@embedpdf/plugin-selection/react", () => {
  const selection = {
    onSelectionChange: mock.onSelectionChange,
    getSelectedText: mock.getSelectedText,
  };
  const plugin = {};
  return {
    useSelectionCapability: () => ({ provides: selection }),
    useSelectionPlugin: () => ({ plugin }),
    glyphAt: vi.fn(),
  };
});
vi.mock("@embedpdf/core/react", () => ({
  useDocumentState: () => ({ scale: 1 }),
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => ({ registerBridge: mock.register }),
}));
vi.mock("@editor/components/viewer/hooks/useDocumentReady", () => ({
  useDocumentReady: () => true,
}));
vi.mock("@editor/components/viewer/useActiveDocumentId", () => ({
  useActiveDocumentId: () => mock.activeDocumentId,
}));
vi.mock("@editor/utils/copyText", () => ({ copyText: mock.copyText }));

function selectText() {
  let complete!: (texts: string[]) => void;
  mock.getSelectedText.mockReturnValueOnce({
    wait: (resolve) => {
      complete = resolve;
    },
  });
  act(() => {
    mock.onSelectionChange.mock.calls.at(-1)![0]({ selection: true });
  });
  return complete;
}

function currentBridge() {
  return mock.register.mock.calls.at(-1)![1]!;
}

function keyboardCopy() {
  const setData = vi.fn();
  const event = new Event("copy", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { setData } });
  document.dispatchEvent(event);
  return { setData, prevented: event.defaultPrevented };
}

describe("selection after switching documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.activeDocumentId = "first";
    mock.onSelectionChange.mockImplementation(() => () => {});
  });
  afterEach(cleanup);

  it("clears the previous document's text for menu and keyboard copying", async () => {
    const { rerender } = render(<SelectionAPIBridge canCopy />);
    selectText()(["First document"]);
    await expect(currentBridge().api.copyToClipboard()).resolves.toBe(true);
    expect(mock.copyText).toHaveBeenLastCalledWith("First document");
    expect(keyboardCopy().setData).toHaveBeenCalledWith(
      "text/plain",
      "First document",
    );

    mock.activeDocumentId = "second";
    rerender(<SelectionAPIBridge canCopy />);

    expect(currentBridge().state.hasSelection).toBe(false);
    await expect(currentBridge().api.copyToClipboard()).resolves.toBe(false);
    expect(keyboardCopy().setData).not.toHaveBeenCalled();

    selectText()(["Second document"]);
    expect(mock.getSelectedText).toHaveBeenLastCalledWith("second");
    await expect(currentBridge().api.copyToClipboard()).resolves.toBe(true);
    expect(mock.copyText).toHaveBeenLastCalledWith("Second document");
    expect(keyboardCopy().setData).toHaveBeenCalledWith(
      "text/plain",
      "Second document",
    );
  });

  it("ignores a text lookup that finishes after leaving its document", async () => {
    const { rerender } = render(<SelectionAPIBridge canCopy />);
    const completePreviousLookup = selectText();

    mock.activeDocumentId = "second";
    rerender(<SelectionAPIBridge canCopy />);
    completePreviousLookup(["Late text from the first document"]);

    await expect(currentBridge().api.copyToClipboard()).resolves.toBe(false);
    expect(keyboardCopy().setData).not.toHaveBeenCalled();
  });

  it("keeps the same document's selection while enforcing changed copy permission", async () => {
    const { rerender } = render(<SelectionAPIBridge canCopy />);
    selectText()(["Current document"]);

    rerender(<SelectionAPIBridge canCopy={false} />);
    await expect(currentBridge().api.copyToClipboard()).resolves.toBe(false);
    expect(mock.copyText).not.toHaveBeenCalled();
    const denied = keyboardCopy();
    expect(denied.setData).not.toHaveBeenCalled();
    expect(denied.prevented).toBe(true);

    rerender(<SelectionAPIBridge canCopy />);
    await expect(currentBridge().api.copyToClipboard()).resolves.toBe(true);
    expect(mock.copyText).toHaveBeenLastCalledWith("Current document");
  });
});
