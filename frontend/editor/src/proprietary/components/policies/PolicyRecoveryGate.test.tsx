import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StirlingFileStub } from "@app/types/fileContext";
import { createNewStirlingFileStub } from "@app/types/fileContext";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

const harness = vi.hoisted(() => ({
  files: [] as StirlingFileStub[],
  removeFiles: vi.fn(),
  pauseHotkeys: vi.fn(),
  resumeHotkeys: vi.fn(),
  navigation: { setSelectedTool: vi.fn(), setWorkbench: vi.fn() },
  setPreviewFile: vi.fn(),
  selectors: { getStirlingFileStubs: (): StirlingFileStub[] => harness.files },
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ fileStubs: harness.files }),
  useFileSelectors: () => harness.selectors,
  useFileManagement: () => ({ removeFiles: harness.removeFiles }),
}));
vi.mock("@app/contexts/HotkeyContext", () => ({
  useHotkeys: () => ({
    pauseHotkeys: harness.pauseHotkeys,
    resumeHotkeys: harness.resumeHotkeys,
    areHotkeysPaused: false,
  }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationActions: () => ({ actions: harness.navigation }),
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflow: () => ({ setPreviewFile: harness.setPreviewFile }),
}));
vi.mock("@app/services/policyDispatch", () => ({ runPolicyOnFile: vi.fn() }));
vi.mock("@app/services/policyCatalog", () => ({
  loadPolicyCatalog: () => ({
    categories: [{ id: "security", label: "Security" }],
  }),
}));
import { PolicyRecoveryGate } from "@app/components/policies/PolicyRecoveryGate";
import {
  recordRunStart,
  resetPolicyRuns,
  updateRun,
} from "@app/components/policies/policyRunStore";
import { updatePolicy } from "@app/services/policyStorage";
import {
  isFileBlocked,
  isEditorPolicyBlocked,
  registerPolicyFileUsage,
} from "@app/services/policyBlockRegistry";
import { runPolicyOnFile } from "@app/services/policyDispatch";

function failed(
  file: StirlingFileStub,
  over: Partial<PolicyRunRecord> = {},
): PolicyRunRecord {
  return {
    runId: file.id,
    policyKey: "security",
    fileId: file.id,
    fileName: file.name,
    fileSize: 1,
    target: "local",
    status: "FAILED",
    outputs: [],
    error: "Policy service unavailable",
    startedAt: 1,
    ...over,
  };
}

function app() {
  return (
    <MantineProvider>
      <textarea aria-label="Unsaved work" defaultValue="Keep my edits" />
      <PolicyRecoveryGate />
    </MantineProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetPolicyRuns();
  updatePolicy("security", { required: true, backendId: "backend-security" });
  harness.files = [createNewStirlingFileStub(new File(["pdf"], "failed.pdf"))];
  harness.removeFiles.mockResolvedValue(undefined);
  vi.mocked(runPolicyOnFile).mockResolvedValue(undefined);
  // Modal/inert behaviour is checked in Chromium; jsdom only models the open state.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
});
afterEach(() => cleanup());

describe("editor policy recovery", () => {
  it("covers documents retained by a tool outside the workspace", () => {
    const file = harness.files[0];
    harness.files = [];
    recordRunStart(failed(file));
    render(app());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    let release = () => {};
    act(() => {
      release = registerPolicyFileUsage([file]);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(isEditorPolicyBlocked()).toBe(true);
    act(() => release());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("pauses for a persisted required failure without unmounting the editor", () => {
    const view = render(app());
    const editor = screen.getByRole("textbox");
    fireEvent.change(editor, { target: { value: "Unsaved changes" } });
    act(() => recordRunStart(failed(harness.files[0])));
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    expect(screen.getByText("failed.pdf")).toBeInTheDocument();
    expect(editor).toHaveValue("Unsaved changes");
    expect(harness.pauseHotkeys).toHaveBeenCalled();
    view.unmount();
    render(app());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("blocks global shortcuts, clipboard handlers and Escape while allowing recovery buttons", () => {
    recordRunStart(failed(harness.files[0]));
    const shortcut = vi.fn();
    const clipboard = vi.fn();
    window.addEventListener("keydown", shortcut);
    document.addEventListener("paste", clipboard);
    const view = render(app());
    try {
      const dialog = screen.getByRole("dialog");
      fireEvent.keyDown(dialog, { key: "s", ctrlKey: true });
      fireEvent.keyDown(dialog, { key: "z", metaKey: true });
      fireEvent.keyDown(dialog, { key: "Delete" });
      fireEvent.keyDown(dialog, { key: "Tab" });
      fireEvent.paste(dialog);
      const cancel = new Event("cancel", { cancelable: true });
      dialog.dispatchEvent(cancel);
      expect(cancel.defaultPrevented).toBe(true);
      expect(shortcut).not.toHaveBeenCalled();
      expect(clipboard).not.toHaveBeenCalled();
      view.unmount();
      fireEvent.keyDown(window, { key: "s", ctrlKey: true });
      expect(shortcut).toHaveBeenCalledOnce();
      expect(harness.resumeHotkeys).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("keydown", shortcut);
      document.removeEventListener("paste", clipboard);
    }
  });

  it("stays paused through retry, cancellation and output import", async () => {
    const file = harness.files[0];
    recordRunStart(failed(file));
    vi.mocked(runPolicyOnFile).mockImplementationOnce(async () => {
      recordRunStart(
        failed(file, {
          runId: "retry",
          status: "PENDING",
          startedAt: 2,
          error: null,
        }),
      );
    });
    render(app());
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "policy.recoveryRetry" }),
      ),
    );
    expect(runPolicyOnFile).toHaveBeenCalledWith(
      "security",
      "backend-security",
      file.id,
      file.name,
    );
    expect(
      screen.getByRole("button", { name: "policy.recoveryRetrying" }),
    ).toBeDisabled();
    act(() => updateRun("retry", { status: "CANCELLED" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() =>
      recordRunStart(
        failed(file, { runId: "success", status: "COMPLETED", startedAt: 3 }),
      ),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => updateRun("success", { imported: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(isFileBlocked(file.id)).toBe(false);
  });

  it("closes affected descendants without deleting the stored source or allowing it to reopen unblocked", async () => {
    const original = harness.files[0];
    recordRunStart(failed(original));
    const child = createNewStirlingFileStub(new File(["edited"], "edited.pdf"));
    child.sourceFileIds = [original.id];
    harness.files = [child];
    const view = render(app());
    expect(isEditorPolicyBlocked()).toBe(true);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "policy.recoveryClose" }),
      ),
    );
    expect(harness.removeFiles).toHaveBeenCalledWith([child.id], false);
    expect(harness.navigation.setSelectedTool).toHaveBeenCalledWith(null);
    expect(harness.navigation.setWorkbench).toHaveBeenCalledWith("fileEditor");
    harness.files = [];
    view.rerender(app());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(isFileBlocked(original.id)).toBe(true);
    harness.files = [original];
    view.rerender(app());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps the gate for the remaining failures in a batch", () => {
    const second = createNewStirlingFileStub(new File(["pdf"], "second.pdf"));
    harness.files.push(second);
    harness.files.forEach((file) => recordRunStart(failed(file)));
    render(app());
    expect(
      screen.getAllByRole("button", { name: "policy.recoveryRetry" }),
    ).toHaveLength(2);
    act(() =>
      recordRunStart(
        failed(second, {
          runId: "success",
          status: "COMPLETED",
          imported: true,
          startedAt: 2,
        }),
      ),
    );
    expect(
      screen.getAllByRole("button", { name: "policy.recoveryRetry" }),
    ).toHaveLength(1);
  });

  it("does not pause for ordinary pipeline failures or unrelated closed files", () => {
    updatePolicy("security", { required: false });
    recordRunStart(failed(harness.files[0]));
    const view = render(app());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    harness.files = [];
    act(() => updatePolicy("security", { required: true }));
    view.rerender(app());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
