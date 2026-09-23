import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInstance } from "i18next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";
import type { StirlingFileStub } from "@app/types/fileContext";
import { createNewStirlingFileStub } from "@app/types/fileContext";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

const translations = parse(
  readFileSync(
    join(__dirname, "../../../../../public/locales/en-US/translation.toml"),
    "utf8",
  ),
);
const testI18n = createInstance();
await testI18n.init({
  lng: "en-US",
  resources: { "en-US": { translation: translations } },
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: testI18n.t.bind(testI18n), i18n: testI18n }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

const harness = vi.hoisted(() => ({
  files: [] as StirlingFileStub[],
  user: { username: "alice", email: "alice@example.com" },
  removeFiles: vi.fn(),
  pauseHotkeys: vi.fn(),
  resumeHotkeys: vi.fn(),
  navigation: { setSelectedTool: vi.fn(), setWorkbench: vi.fn() },
  setPreviewFile: vi.fn(),
  selectors: { getStirlingFileStubs: (): StirlingFileStub[] => harness.files },
}));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ user: harness.user }),
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
vi.mock("@app/services/fileStorage", () => ({
  fileStorage: { getStirlingFileStub: vi.fn() },
}));
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
import { fileStorage } from "@app/services/fileStorage";

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
  vi.mocked(fileStorage.getStirlingFileStub).mockImplementation(
    async (id) => harness.files.find((file) => file.id === id) ?? null,
  );
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
    expect(
      screen.getByRole("dialog", { name: "Policy enforcement failed" }),
    ).toHaveAttribute("open");
    expect(screen.getByText("1 file affected.")).toBeVisible();
    expect(screen.getByText("failed.pdf")).not.toBeVisible();
    expect(
      screen.getByText("Technical details").closest("details"),
    ).not.toHaveAttribute("open");
    expect(editor).toHaveValue("Unsaved changes");
    expect(harness.pauseHotkeys).toHaveBeenCalled();
    view.unmount();
    render(app());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("directs users to the policy owner when it belongs to someone else", () => {
    updatePolicy("security", { owner: "bob@example.com" });
    recordRunStart(failed(harness.files[0]));
    render(app());
    expect(
      screen.getByText("Contact bob@example.com for help."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Check the policy settings, then retry."),
    ).not.toBeInTheDocument();
  });

  it.each(["alice", "ALICE@example.com"])(
    "directs the owner to their policy settings when identified by %s",
    (owner) => {
      updatePolicy("security", { owner });
      recordRunStart(failed(harness.files[0]));
      render(app());
      expect(
        screen.getByText("Check the policy settings, then retry."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Contact bob@example.com for help."),
      ).not.toBeInTheDocument();
    },
  );

  it("directs users to their administrator when the owner is unavailable", () => {
    recordRunStart(failed(harness.files[0]));
    render(app());
    expect(
      screen.getByText("Contact your administrator for help."),
    ).toBeInTheDocument();
  });

  it("isolates editor handlers without cancelling browser shortcuts or clipboard defaults", () => {
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
      for (const binding of [
        { key: "r", ctrlKey: true },
        { key: "r", metaKey: true },
        { key: "r", metaKey: true, shiftKey: true },
        { key: "F5" },
        { key: "F12" },
        { key: "i", ctrlKey: true, shiftKey: true },
        { key: "i", metaKey: true, altKey: true },
        { key: "l", metaKey: true },
        { key: "l", ctrlKey: true },
        { key: "c", metaKey: true },
        { key: "c", ctrlKey: true },
      ]) {
        expect(fireEvent.keyDown(dialog, binding)).toBe(true);
        expect(fireEvent.keyUp(dialog, binding)).toBe(true);
      }
      expect(fireEvent.copy(dialog)).toBe(true);
      expect(fireEvent.cut(dialog)).toBe(true);
      expect(fireEvent.paste(dialog)).toBe(true);
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
      fireEvent.click(screen.getByRole("button", { name: "Retry file" })),
    );
    expect(runPolicyOnFile).toHaveBeenCalledWith(
      "security",
      "backend-security",
      file.id,
      file.name,
    );
    expect(
      screen.getByRole("button", { name: "Retrying file..." }),
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

  it("retries the stored source when only a descendant remains open", async () => {
    const original = harness.files[0];
    recordRunStart(failed(original));
    const child = createNewStirlingFileStub(new File(["edited"], "edited.pdf"));
    child.sourceFileIds = [original.id];
    child.classificationLocked = true;
    harness.files = [child];
    vi.mocked(fileStorage.getStirlingFileStub).mockResolvedValueOnce(original);
    render(app());
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Retry file" })),
    );
    expect(fileStorage.getStirlingFileStub).toHaveBeenCalledWith(original.id);
    expect(runPolicyOnFile).toHaveBeenCalledWith(
      "security",
      "backend-security",
      original.id,
      original.name,
    );
  });

  it.each(["missing", "locked"] as const)(
    "keeps recovery available when the stored source is %s",
    async (state) => {
      const file = harness.files[0];
      recordRunStart(failed(file));
      vi.mocked(fileStorage.getStirlingFileStub).mockResolvedValueOnce(
        state === "missing" ? null : { ...file, classificationLocked: true },
      );
      render(app());
      await act(async () =>
        fireEvent.click(screen.getByRole("button", { name: "Retry file" })),
      );
      expect(runPolicyOnFile).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "The action couldn't be completed. Try again.",
      );
      expect(screen.getByRole("button", { name: "Close file" })).toBeEnabled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    },
  );

  it("closes affected descendants without deleting the stored source or allowing it to reopen unblocked", async () => {
    const original = harness.files[0];
    recordRunStart(failed(original));
    const child = createNewStirlingFileStub(new File(["edited"], "edited.pdf"));
    child.sourceFileIds = [original.id];
    harness.files = [child];
    const view = render(app());
    expect(isEditorPolicyBlocked()).toBe(true);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Close file" })),
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
    expect(screen.getByText("2 files affected.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry 2 files" })).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(2);
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
    expect(screen.getByText("1 file affected.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry file" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Close file" })).toBeVisible();
  });

  it("retries the batch once and pluralises the remaining work after partial recovery", async () => {
    const first = harness.files[0];
    const second = createNewStirlingFileStub(new File(["pdf"], "second.pdf"));
    harness.files.push(second);
    harness.files.forEach((file) => recordRunStart(failed(file)));
    vi.mocked(runPolicyOnFile).mockImplementation(
      async (_key, _backend, fileId) => {
        const file = harness.files.find((file) => file.id === fileId)!;
        recordRunStart(
          failed(file, {
            runId: `retry-${fileId}`,
            status: "PENDING",
            startedAt: 2,
          }),
        );
      },
    );
    render(app());
    expect(
      screen.getByText("Contact your administrator for help."),
    ).toBeVisible();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Retry 2 files" })),
    );
    expect(runPolicyOnFile).toHaveBeenCalledTimes(2);
    expect(runPolicyOnFile).toHaveBeenCalledWith(
      "security",
      "backend-security",
      first.id,
      first.name,
    );
    expect(runPolicyOnFile).toHaveBeenCalledWith(
      "security",
      "backend-security",
      second.id,
      second.name,
    );
    expect(
      screen.getByRole("button", { name: "Retrying 2 files..." }),
    ).toBeDisabled();
    act(() =>
      updateRun(`retry-${first.id}`, { status: "COMPLETED", imported: true }),
    );
    expect(screen.getByText("1 file affected.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Retrying file..." }),
    ).toBeDisabled();
    act(() => updateRun(`retry-${second.id}`, { status: "FAILED" }));
    expect(screen.getByRole("button", { name: "Retry file" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Close file" })).toBeEnabled();
  });

  it("counts and closes each affected file once across multiple failed policies", async () => {
    const first = harness.files[0];
    const second = createNewStirlingFileStub(new File(["pdf"], "second.pdf"));
    const healthy = createNewStirlingFileStub(new File(["pdf"], "healthy.pdf"));
    harness.files.push(second, healthy);
    updatePolicy("compliance", {
      required: true,
      backendId: "backend-compliance",
    });
    recordRunStart(failed(first));
    recordRunStart(failed(second));
    recordRunStart(
      failed(first, { runId: "compliance-failure", policyKey: "compliance" }),
    );
    let finishClosing = () => {};
    harness.removeFiles.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishClosing = resolve;
        }),
    );
    render(app());
    expect(screen.getByText("2 files affected.")).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Close 2 files" }));
    expect(
      screen.getByRole("button", { name: "Closing 2 files..." }),
    ).toBeDisabled();
    expect(harness.removeFiles).toHaveBeenCalledOnce();
    expect(harness.removeFiles).toHaveBeenCalledWith(
      [first.id, second.id],
      false,
    );
    await act(async () => finishClosing());
  });

  it("still retries the other files when one dispatch rejects", async () => {
    const second = createNewStirlingFileStub(new File(["pdf"], "second.pdf"));
    harness.files.push(second);
    harness.files.forEach((file) => recordRunStart(failed(file)));
    vi.mocked(runPolicyOnFile).mockRejectedValueOnce(new Error("unavailable"));
    render(app());
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Retry 2 files" })),
    );
    expect(runPolicyOnFile).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The action couldn't be completed. Try again.",
    );
    expect(screen.getByRole("button", { name: "Retry 2 files" })).toBeEnabled();
  });

  it("does not offer a retry for a missing policy", () => {
    updatePolicy("security", { backendId: undefined });
    recordRunStart(failed(harness.files[0]));
    render(app());
    expect(screen.getByRole("button", { name: "Retry file" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close file" })).toBeEnabled();
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
