import { useState } from "react";
import { flushSync } from "react-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

vi.mock("@editor/contexts/ToolRegistryContext", () => ({
  useToolRegistry: () => ({ allTools: {} }),
}));

import {
  NavigationProvider,
  useNavigation,
} from "@editor/contexts/NavigationContext";
import { useUnsavedChangesGuard } from "@editor/tools/pdfTextEditor/hooks/useUnsavedChangesGuard";

let navigation: ReturnType<typeof useNavigation>;
let setDirty: (dirty: boolean) => void;
let liveDirty = false;
const readDirty = () => liveDirty;

function Editor() {
  const [dirty, set] = useState(false);
  setDirty = (next) => {
    liveDirty = next;
    set(next);
  };
  useUnsavedChangesGuard(dirty, readDirty);
  return null;
}

let closeEditor: () => void;

function Workbench() {
  const [open, setOpen] = useState(true);
  closeEditor = () => setOpen(false);
  navigation = useNavigation();
  return open ? <Editor /> : null;
}

function renderEditor() {
  return render(
    <NavigationProvider>
      <Workbench />
    </NavigationProvider>,
  );
}

beforeEach(() => {
  liveDirty = false;
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("useUnsavedChangesGuard", () => {
  it("holds navigation back while the deferred dirty flag is still pending", async () => {
    renderEditor();
    const leave = vi.fn();
    await act(async () => {
      flushSync(() => setDirty(true));
      expect(navigation.hasUnsavedChanges).toBe(false);
      navigation.requestNavigation(leave);
    });
    expect(leave).not.toHaveBeenCalled();
    expect(navigation.pendingNavigation).toBe(leave);
  });

  it("lets navigation through once the edits are gone", () => {
    renderEditor();
    act(() => setDirty(true));
    act(() => setDirty(false));
    const leave = vi.fn();
    act(() => navigation.requestNavigation(leave));
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("lets navigation through once the user discards the edits", () => {
    renderEditor();
    act(() => setDirty(true));
    expect(navigation.hasUnsavedChanges).toBe(true);
    act(() => navigation.setHasUnsavedChanges(false));
    const leave = vi.fn();
    act(() => navigation.requestNavigation(leave));
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("stops holding navigation back once the editor closes", () => {
    renderEditor();
    act(() => setDirty(true));
    act(() => closeEditor());
    const leave = vi.fn();
    act(() => navigation.requestNavigation(leave));
    expect(leave).toHaveBeenCalledTimes(1);
  });
});
