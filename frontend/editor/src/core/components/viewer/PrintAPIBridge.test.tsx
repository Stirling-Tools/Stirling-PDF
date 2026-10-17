import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentPermissionsAPIBridge } from "@app/components/viewer/DocumentPermissionsAPIBridge";
import { PrintAPIBridge } from "@app/components/viewer/PrintAPIBridge";
import { canPrintPdf } from "@app/services/pdfPermissions";
import { PdfPermissionFlag } from "@app/contexts/viewer/viewerBridges";
import { renderInProviders } from "@app/tests/utils/printTestUtils";

const mock = vi.hoisted(() => ({
  register: vi.fn(),
  ready: true,
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({ registerBridge: mock.register }),
}));
vi.mock("@app/components/viewer/hooks/useDocumentReady", () => ({
  useDocumentReady: () => mock.ready,
}));
// The dialog is not what this file is about, and rendering it here would need
// the provider the print host's own tests already supply.
vi.mock("@app/components/viewer/print/PrintDialog", () => ({
  PrintDialog: () => null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.ready = true;
});
afterEach(cleanup);

/** The print action the host publishes, or undefined when printing is denied. */
const printBridge = () => {
  const call = mock.register.mock.calls.at(-1);
  return call && call[0] === "print" && call[1] ? call[1] : undefined;
};

it.each([
  {
    encrypted: false,
    ownerAuthenticated: false,
    permissions: 0,
    allowed: true,
  },
  {
    encrypted: true,
    ownerAuthenticated: false,
    permissions: 0,
    allowed: false,
  },
  {
    encrypted: true,
    ownerAuthenticated: false,
    permissions: PdfPermissionFlag.CopyContents,
    allowed: false,
  },
  {
    encrypted: true,
    ownerAuthenticated: false,
    permissions: PdfPermissionFlag.Print,
    allowed: false,
  },
  {
    encrypted: true,
    ownerAuthenticated: false,
    permissions: PdfPermissionFlag.Print,
    encryptionRevision: 2,
    allowed: true,
  },
  {
    encrypted: true,
    ownerAuthenticated: false,
    permissions: PdfPermissionFlag.Print | PdfPermissionFlag.PrintHighQuality,
    allowed: true,
  },
  {
    encrypted: true,
    ownerAuthenticated: false,
    permissions: 0,
    honorOwnerPasswords: false,
    allowed: true,
  },
  { encrypted: true, ownerAuthenticated: true, permissions: 0, allowed: true },
])("enforces effective print permission for %j", ({ allowed, ...access }) => {
  renderInProviders(<PrintAPIBridge canPrint={canPrintPdf(access)} />);
  expect(Boolean(printBridge())).toBe(allowed);
});

it("revokes a previously registered action when the replacement denies printing", () => {
  const view = renderInProviders(<PrintAPIBridge canPrint />);
  expect(printBridge()).toBeTruthy();
  view.rerender(<PrintAPIBridge canPrint={false} />);
  expect(mock.register).toHaveBeenLastCalledWith("print", null);
  expect(printBridge()).toBeUndefined();
  view.rerender(<PrintAPIBridge canPrint />);
  expect(printBridge()).toBeTruthy();
});

it("does not expose printing before the document is ready", () => {
  mock.ready = false;
  renderInProviders(<PrintAPIBridge canPrint />);
  expect(mock.register).not.toHaveBeenCalled();
});

it.each([false, true])(
  "reports effective print permission consistently for owner=%s",
  (owner) => {
    renderInProviders(
      <DocumentPermissionsAPIBridge
        isEncrypted
        isOwnerUnlocked={owner}
        permissions={0}
      />,
    );
    const bridge = mock.register.mock.calls.at(-1)?.[1];
    expect(bridge.state.canPrint).toBe(owner);
    expect(bridge.api.getEffectivePermission(PdfPermissionFlag.Print)).toBe(
      owner,
    );
    expect(bridge.api.hasPermission(PdfPermissionFlag.Print)).toBe(owner);
  },
);
