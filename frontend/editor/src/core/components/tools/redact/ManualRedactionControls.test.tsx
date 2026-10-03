import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import ManualRedactionControls from "@app/components/tools/redact/ManualRedactionControls";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

const commitAllPending = vi.fn().mockResolvedValue(undefined);
const applyChanges = vi.fn().mockResolvedValue(undefined);
const activateManualRedact = vi.fn();
const setAnnotationMode = vi.fn();

const redaction: {
  redactionsApplied: boolean;
  pendingCount: number;
  isBridgeReady: boolean;
  isRedacting: boolean;
  isAnnotationMode: boolean;
  annotationDirty: boolean;
  applyChanges: typeof applyChanges | undefined;
} = {
  redactionsApplied: false,
  pendingCount: 0,
  isBridgeReady: true,
  isRedacting: true,
  isAnnotationMode: false,
  annotationDirty: false,
  applyChanges,
};

vi.mock("@app/contexts/RedactionContext", () => ({
  useRedaction: () => ({
    activateManualRedact,
    commitAllPending,
    setActiveType: vi.fn(),
    setManualRedactColor: vi.fn(),
    redactionsApplied: redaction.redactionsApplied,
  }),
  useRedactionMode: () => ({
    pendingCount: redaction.pendingCount,
    activeType: null,
    isBridgeReady: redaction.isBridgeReady,
    isRedacting: redaction.isRedacting,
    manualRedactColor: "#000000",
  }),
}));

vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({
    isAnnotationMode: redaction.isAnnotationMode,
    setAnnotationMode,
    applyChanges: redaction.applyChanges,
    activeFileIndex: 0,
  }),
}));

vi.mock("@app/contexts/SignatureContext", () => ({
  useSignature: () => ({ signatureApiRef: { current: null } }),
}));

vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationGuard: () => ({
    showNavigationWarning: false,
    hasUnsavedChanges: redaction.annotationDirty,
  }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MantineProvider>{children}</MantineProvider>
);

function renderPanel() {
  return render(<ManualRedactionControls />, { wrapper });
}

const applyButton = () =>
  screen.queryByRole("button", { name: /Apply Redactions/ });
const saveButton = () => screen.queryByRole("button", { name: "Save Changes" });

describe("ManualRedactionControls save action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commitAllPending.mockResolvedValue(undefined);
    applyChanges.mockResolvedValue(undefined);
    redaction.redactionsApplied = false;
    redaction.pendingCount = 0;
    redaction.annotationDirty = false;
    redaction.isBridgeReady = true;
    redaction.isRedacting = true;
    redaction.isAnnotationMode = false;
    redaction.applyChanges = applyChanges;
  });

  test("offers no action when nothing is pending or applied", () => {
    renderPanel();
    expect(applyButton()).toBeNull();
    expect(saveButton()).toBeNull();
  });

  test("counts the pending marks on the apply action", () => {
    redaction.pendingCount = 3;
    renderPanel();
    expect(applyButton()?.textContent).toContain("3");
    expect(saveButton()).toBeNull();
  });

  // The regression this gate exists for: pendingCount drops to zero the moment
  // the commit lands, so an export that fails after a successful commit used to
  // leave the applied marks with no way to retry the save.
  test("keeps a save action after a commit whose export failed", () => {
    redaction.redactionsApplied = true;
    renderPanel();
    expect(applyButton()).toBeNull();
    expect(saveButton()).not.toBeNull();
  });

  test("still offers apply when both pending marks and applied marks exist", () => {
    redaction.pendingCount = 2;
    redaction.redactionsApplied = true;
    renderPanel();
    expect(applyButton()?.textContent).toContain("2");
    expect(saveButton()).toBeNull();
  });

  // Annotation work is saved from the Annotate panel, so it must not conjure a
  // save action into the redact panel.
  test("ignores annotation-only dirty state", () => {
    redaction.annotationDirty = true;
    renderPanel();
    expect(applyButton()).toBeNull();
    expect(saveButton()).toBeNull();
  });

  test("commits before saving so no pending mark rides into the export", async () => {
    redaction.pendingCount = 1;
    renderPanel();

    fireEvent.click(applyButton()!);
    await waitFor(() => expect(applyChanges).toHaveBeenCalledTimes(1));
    expect(commitAllPending).toHaveBeenCalledTimes(1);
    expect(commitAllPending.mock.invocationCallOrder[0]).toBeLessThan(
      applyChanges.mock.invocationCallOrder[0],
    );
  });

  test("does nothing when the viewer offers no save", async () => {
    redaction.applyChanges = undefined;
    redaction.pendingCount = 1;
    renderPanel();

    fireEvent.click(applyButton()!);
    await waitFor(() => expect(commitAllPending).not.toHaveBeenCalled());
  });

  test("recovers when the save throws", async () => {
    applyChanges.mockRejectedValueOnce(new Error("export failed"));
    redaction.redactionsApplied = true;
    renderPanel();

    fireEvent.click(saveButton()!);
    // The viewer surfaces the failure; the panel must not wedge on a stuck
    // loading state, so isApplying has to clear again.
    await waitFor(() => expect(applyChanges).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });
});
