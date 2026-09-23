import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  bytesOf,
  context,
  policyContext,
} from "@app/components/notifications/resolutions/testSupport";

// Where each action sends the reader. Only the editor has the workbench contexts above it.

const retryWithPassword = vi.fn();
const unlockLocalDocument = vi.fn();
const repairDocuments = vi.fn();
const retryWithFiles = vi.fn();
vi.mock("@app/services/notificationRetry", async (importOriginal) => ({
  // The real stashMatchesKind and retryInputIds: both are pure, and their guards are part of
  // what these tests exercise.
  ...(await importOriginal<typeof import("@app/services/notificationRetry")>()),
  retryWithPassword: (...args: unknown[]) => retryWithPassword(...args),
  unlockLocalDocument: (...args: unknown[]) => unlockLocalDocument(...args),
  repairDocuments: (...args: unknown[]) => repairDocuments(...args),
  retryWithFiles: (...args: unknown[]) => retryWithFiles(...args),
}));

const rerunPolicy = vi.fn();
const rechainPolicyOnDocument = vi.fn();
const canPlacePolicy = vi.fn();
vi.mock("@app/services/notificationPolicyRetry", () => ({
  canPlacePolicy: (...args: unknown[]) => canPlacePolicy(...args),
  rerunPolicy: (...args: unknown[]) => rerunPolicy(...args),
  rechainPolicyOnDocument: (...args: unknown[]) =>
    rechainPolicyOnDocument(...args),
}));

const reportNotificationResolved = vi.fn();
vi.mock("@app/services/notifications", async () => ({
  ...(await vi.importActual<typeof import("@app/services/notifications")>(
    "@app/services/notifications",
  )),
  reportNotificationResolved: (...args: unknown[]) =>
    reportNotificationResolved(...args),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  )),
  useNavigate: () => navigate,
}));

// No i18n instance here, and the plugin is stubbed because the contexts below reach `core/i18n`.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

// IndexedDB, which jsdom has none of. Answered here so presence is a fact of the test.
const h = vi.hoisted(() => ({
  stub: { id: "f-1" } as unknown,
  getStirlingFileStub: vi.fn(),
}));

vi.mock("@app/services/fileStorage", () => ({
  fileStorage: {
    getStirlingFileStub: (fileId: string) => h.getStirlingFileStub(fileId),
  },
}));

const { FileActionsContext, FileStoreContext } =
  await import("@app/contexts/file/contexts");
const { NavigationActionsContext } =
  await import("@app/contexts/NavigationContext");
const { ViewerContext } = await import("@app/contexts/ViewerContext");
const { useNotificationActions } =
  await import("@app/components/notifications/notificationActions");

const addStirlingFileStubs = vi.fn();
const setActiveFileId = vi.fn();
const setWorkbench = vi.fn();
const setToolAndWorkbench = vi.fn();
// createChildStub is stubbed too, so the test can name the version's id directly.
vi.mock("@app/contexts/file/fileActions", () => ({
  generateProcessedFileMetadata: () => Promise.resolve(null),
  createChildStub: (parent: { id: string }, _op: unknown, file: File) => ({
    ...parent,
    id: "f-unlocked",
    name: file.name,
    versionNumber: 2,
    parentFileId: parent.id,
  }),
}));

/** What the workbench already holds, so the "do not add it twice" path can be exercised. */
let openFileIds: string[] = [];
/** Stubs the workbench holds, so the in-place replacement path has an original to version. */
let openFilesById: Record<string, unknown> = {};
const setSelectedFiles = vi.fn();
const addFiles = vi.fn();
const consumeFiles = vi.fn();

/** The editor shell: the workbench's providers all sit above the bell. */
const inEditor = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <FileActionsContext.Provider
      value={{
        actions: {
          addStirlingFileStubs,
          setSelectedFiles,
          addFiles,
          consumeFiles,
        } as never,
        dispatch: vi.fn(),
      }}
    >
      <FileStoreContext.Provider
        value={
          {
            getState: () => ({
              files: { ids: openFileIds, byId: openFilesById },
            }),
            subscribe: () => () => {},
            selectors: {},
          } as never
        }
      >
        <NavigationActionsContext.Provider
          value={{ actions: { setWorkbench, setToolAndWorkbench } } as never}
        >
          <ViewerContext.Provider value={{ setActiveFileId } as never}>
            {children}
          </ViewerContext.Provider>
        </NavigationActionsContext.Provider>
      </FileStoreContext.Provider>
    </FileActionsContext.Provider>
  </MemoryRouter>
);

function registry(wrapper = inEditor) {
  return renderHook(() => useNotificationActions(), { wrapper }).result.current;
}

beforeEach(() => {
  navigate.mockReset();
  addStirlingFileStubs.mockReset().mockResolvedValue([]);
  setActiveFileId.mockReset();
  setWorkbench.mockReset();
  setToolAndWorkbench.mockReset();
  h.getStirlingFileStub.mockReset().mockResolvedValue(h.stub);
  openFileIds = [];
  openFilesById = {};
  setSelectedFiles.mockReset();
  consumeFiles.mockReset().mockResolvedValue(["f-unlocked"]);
  // The adopted document's own id, not the reference the failure was filed against.
  addFiles.mockReset().mockResolvedValue([{ fileId: "f-unlocked" }]);
  reportNotificationResolved.mockReset().mockResolvedValue(true);
  retryWithPassword.mockReset().mockResolvedValue({ ok: true, files: [] });
  // The unlock succeeds by default: most cases below are about what happens afterwards.
  unlockLocalDocument.mockReset().mockResolvedValue({
    ok: true,
    files: [
      {
        blob: new Blob(["pdf"], { type: "application/pdf" }),
        filename: "invoice.pdf",
      },
    ],
  });
  // The repair succeeds by default: most cases below are about what happens afterwards.
  repairDocuments.mockReset().mockResolvedValue({
    ok: true,
    repaired: [
      {
        fileId: "f-1",
        file: {
          blob: new Blob(["repaired"], { type: "application/pdf" }),
          filename: "invoice_repaired.pdf",
        },
      },
    ],
  });
  retryWithFiles.mockReset().mockResolvedValue({ ok: true, files: [] });
  // Tracked by default: something is polling the run, so its output will arrive.
  rerunPolicy.mockReset().mockResolvedValue({ ok: true, tracked: true });
  rechainPolicyOnDocument.mockReset().mockResolvedValue({
    ok: true,
    tracked: true,
  });
  // Placeable by default: the browser still holds the policy the failure names.
  canPlacePolicy.mockReset().mockReturnValue(true);
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("DECRYPT", () => {
  it("unlocks with the password it was given and reports what came back", async () => {
    retryWithPassword.mockResolvedValue({ ok: false, message: "Wrong" });

    const outcome = await registry().DECRYPT?.run(context(), "hunter2");

    expect(retryWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "/api/v1/security/remove-password" }),
      "hunter2",
      // The row's own document, so a single-file endpoint is not handed the whole batch.
      "f-1",
    );
    expect(outcome).toEqual({ ok: false, message: "Wrong" });
  });

  it("takes the unlocked document into the workbench through FileContext", async () => {
    // The whole point of the password: the user must end up holding the unlocked file.
    retryWithPassword.mockResolvedValue({
      ok: true,
      files: [
        {
          blob: new Blob(["pdf"], { type: "application/pdf" }),
          filename: "invoice.pdf",
        },
      ],
    });

    const outcome = await registry().DECRYPT?.run(context(), "hunter2");

    expect(outcome).toEqual({ ok: true });
    const [files, options] = addFiles.mock.calls[0];
    expect((files as File[]).map((file) => file.name)).toEqual(["invoice.pdf"]);
    // Selected so it is on screen, and marked in-app so `usePolicyAutoRun` leaves it alone.
    expect(options).toEqual({ selectFiles: true, derivedFromTool: true });
    // And closed with the prefixed id: nothing else tells the server the client fixed it.
    expect(reportNotificationResolved).toHaveBeenCalledWith("failure:evt-1");
  });

  it("replaces the encrypted original in place when it is open in the workbench", async () => {
    // The failed document is on screen, so the unlock versions it rather than adding a second copy.
    openFileIds = ["f-1"];
    openFilesById = {
      "f-1": { id: "f-1", name: "invoice.pdf", versionNumber: 1 },
    };
    unlockLocalDocument.mockResolvedValue({
      ok: true,
      files: [
        {
          blob: new Blob(["pdf"], { type: "application/pdf" }),
          filename: "invoice.pdf",
        },
      ],
    });

    const outcome = await registry().DECRYPT?.run(policyContext(), "hunter2");

    expect(outcome).toEqual({ ok: true });
    // Consumed, not added: the encrypted original is versioned, so there is only ever one document.
    expect(addFiles).not.toHaveBeenCalled();
    const [inputIds, , stubs] = consumeFiles.mock.calls[0];
    expect(inputIds).toEqual(["f-1"]);
    // Still in-app, so usePolicyAutoRun does not enforce the chain on it — the rechain does that.
    expect(
      (stubs as Array<{ derivedFromTool?: boolean }>)[0].derivedFromTool,
    ).toBe(true);
  });

  it("versions a document the workbench has closed, rather than adding a copy of it", async () => {
    // Closed in the sidebar but still on the device: adding here left the user holding both.
    openFileIds = [];
    openFilesById = {};

    await registry().DECRYPT?.run(policyContext(), "hunter2");

    expect(addFiles).not.toHaveBeenCalled();
    expect(consumeFiles.mock.calls[0][0]).toEqual(["f-1"]);
  });

  it("adds the unlocked document when nothing on this device holds the original", async () => {
    // No stub anywhere: there is no version chain to extend, so adding is all that is left.
    h.getStirlingFileStub.mockResolvedValue(null);

    await registry().DECRYPT?.run(policyContext(), "hunter2");

    expect(consumeFiles).not.toHaveBeenCalled();
    expect(addFiles.mock.calls[0][1]).toEqual({
      selectFiles: true,
      derivedFromTool: true,
    });
  });

  it("closes the incident only once the document is safely in", async () => {
    // Reported first, then a failed adoption, would leave the row closed with nothing to show.
    retryWithPassword.mockResolvedValue({
      ok: true,
      files: [{ blob: new Blob(["pdf"]), filename: "invoice.pdf" }],
    });
    addFiles.mockRejectedValue(new Error("quota"));

    await registry().DECRYPT?.run(context(), "hunter2");

    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("keeps the unlock a success when the server will not record it", async () => {
    // The document is already in the workbench, so a refused resolve is not a failed unlock.
    retryWithPassword.mockResolvedValue({
      ok: true,
      files: [{ blob: new Blob(["pdf"]), filename: "invoice.pdf" }],
    });
    reportNotificationResolved.mockResolvedValue(false);

    expect(await registry().DECRYPT?.run(context(), "hunter2")).toEqual({
      ok: true,
    });
  });

  it("reports a failure when the unlocked document cannot be taken in", async () => {
    // Unlocked but dropped leaves the user with nothing, so it is never reported as success.
    retryWithPassword.mockResolvedValue({
      ok: true,
      files: [{ blob: new Blob(["pdf"]), filename: "invoice.pdf" }],
    });
    addFiles.mockRejectedValue(new Error("quota"));

    const outcome = await registry().DECRYPT?.run(context(), "hunter2");

    expect(outcome).toEqual({
      ok: false,
      message:
        "The document was unlocked but could not be opened here. Try the tool directly.",
    });
  });

  it("offers the unlock where the editor can take the result", () => {
    expect(registry().DECRYPT?.available(context())).toBe(true);
    expect(
      registry().DECRYPT?.available(context({ hasLocalFile: false })),
    ).toBe(false);
  });

  it("says so rather than posting nothing when the stash has gone", async () => {
    const outcome = await registry().DECRYPT?.run(
      context({ retryPayload: null }),
      "hunter2",
    );

    expect(retryWithPassword).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      ok: false,
      message: "This document can no longer be retried from this browser.",
    });
  });
});

describe("DECRYPT on an attended policy run", () => {
  it("unlocks, takes the document in, runs the policy again, then closes the incident", async () => {
    const order: string[] = [];
    consumeFiles.mockImplementation(async () => {
      order.push("adopt");
      return ["f-unlocked"];
    });
    rechainPolicyOnDocument.mockImplementation(async () => {
      order.push("rerun");
      return { ok: true, tracked: true };
    });
    reportNotificationResolved.mockImplementation(async () => {
      order.push("resolve");
      return true;
    });

    const outcome = await registry().DECRYPT?.run(policyContext(), "hunter2");

    expect(outcome).toEqual({ ok: true });
    // The unlock is the remove-password call on the document the row names, not a stashed endpoint.
    expect(unlockLocalDocument).toHaveBeenCalledWith("f-1", "hunter2");
    // Versioned onto the encrypted original, so there is one document rather than two.
    expect(addFiles).not.toHaveBeenCalled();
    const [inputIds, files, stubs] = consumeFiles.mock.calls[0];
    expect(inputIds).toEqual(["f-1"]);
    expect((files as File[]).map((file) => file.name)).toEqual(["invoice.pdf"]);
    // derivedFromTool stops the adoption starting a SECOND, billed run of this same policy.
    expect(
      (stubs as Array<{ derivedFromTool?: boolean }>)[0].derivedFromTool,
    ).toBe(true);
    // Under the ORIGINAL reference so a repeat folds on, with the output on the ADOPTED document.
    expect(rechainPolicyOnDocument).toHaveBeenCalledWith(
      { policyId: "pol-1", fileId: "f-1" },
      expect.any(File),
      "f-unlocked",
    );
    // And with the prefixed notification id, never a raw failure id.
    expect(reportNotificationResolved).toHaveBeenCalledWith("failure:evt-1");
    expect(order).toEqual(["adopt", "rerun", "resolve"]);
  });

  it("starts exactly one run for one click", async () => {
    await registry().DECRYPT?.run(policyContext(), "hunter2");

    // One submission: the adoption's is silenced by derivedFromTool above.
    expect(rechainPolicyOnDocument).toHaveBeenCalledTimes(1);
    expect(rerunPolicy).not.toHaveBeenCalled();
    expect(consumeFiles.mock.calls[0][2][0]).toMatchObject({
      derivedFromTool: true,
    });
  });

  it("still runs when the adoption reports no workspace id, rather than guessing one", async () => {
    // Nothing to attribute the output to, so the run goes untracked rather than to the original.
    consumeFiles.mockResolvedValue([]);
    rechainPolicyOnDocument.mockResolvedValue({ ok: true, tracked: false });

    await registry().DECRYPT?.run(policyContext(), "hunter2");

    expect(rechainPolicyOnDocument).toHaveBeenCalledWith(
      { policyId: "pol-1", fileId: "f-1" },
      expect.any(File),
      null,
    );
  });

  it("leaves the row open when the re-run cannot deliver, and says why", async () => {
    // Untracked, so the processed document never arrives: the unlocked input is not the point.
    rechainPolicyOnDocument.mockResolvedValue({ ok: true, tracked: false });

    expect(await registry().DECRYPT?.run(policyContext(), "hunter2")).toEqual({
      ok: false,
      message:
        "The document was unlocked and the policy re-run started, but its result cannot be delivered here, so this failure stays open.",
    });
    // Adopted regardless: the password bought them the unlocked document either way.
    expect(consumeFiles).toHaveBeenCalled();
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("shows a wrong password for what it is, and touches nothing else", async () => {
    unlockLocalDocument.mockResolvedValue({
      ok: false,
      message: "The password is incorrect.",
    });

    expect(await registry().DECRYPT?.run(policyContext(), "wrong")).toEqual({
      ok: false,
      message: "The password is incorrect.",
    });
    expect(addFiles).not.toHaveBeenCalled();
    expect(rechainPolicyOnDocument).not.toHaveBeenCalled();
    // The row is still a failure, so nothing may report it fixed.
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("neither re-runs nor closes the incident when the document cannot be taken in", async () => {
    consumeFiles.mockRejectedValue(new Error("quota"));

    expect(await registry().DECRYPT?.run(policyContext(), "hunter2")).toEqual({
      ok: false,
      message:
        "The document was unlocked but could not be opened here. Try the tool directly.",
    });
    expect(rechainPolicyOnDocument).not.toHaveBeenCalled();
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("says the unlock worked but the re-run did not, and leaves the row open", async () => {
    rechainPolicyOnDocument.mockResolvedValue({
      ok: false,
      reason: "rejected",
      message: "Queue full.",
    });

    expect(await registry().DECRYPT?.run(policyContext(), "hunter2")).toEqual({
      ok: false,
      message:
        "The document was unlocked and opened here, but the policy could not be run on it again.",
    });
    // Adopted anyway: the password bought them the unlocked document, and that is theirs to keep.
    expect(consumeFiles).toHaveBeenCalled();
    // But nothing is fixed server-side, so the incident stays open.
    expect(reportNotificationResolved).not.toHaveBeenCalled();
  });

  it("never hands the password to anything but the unlock", async () => {
    await registry().DECRYPT?.run(policyContext(), "hunter2");

    // Everything downstream of the unlock: no payload, stash or id carries the password.
    const downstream = [
      ...addFiles.mock.calls,
      ...rechainPolicyOnDocument.mock.calls,
      ...reportNotificationResolved.mock.calls,
    ];
    expect(JSON.stringify(downstream)).not.toContain("hunter2");
    // Not in the file that goes back to the policy either: those are the server's unlocked bytes.
    const [, document] = rechainPolicyOnDocument.mock.calls[0] as [
      unknown,
      File,
      unknown,
    ];
    expect(await bytesOf(document)).not.toContain("hunter2");
  });
});
