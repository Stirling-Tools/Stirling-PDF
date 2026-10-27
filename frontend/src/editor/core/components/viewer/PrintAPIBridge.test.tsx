import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DocumentPermissionsAPIBridge } from "@editor/components/viewer/DocumentPermissionsAPIBridge";
import { PrintAPIBridge } from "@editor/components/viewer/PrintAPIBridge";
import { canPrintPdf } from "@editor/services/pdfPermissions";
import { PdfPermissionFlag } from "@editor/contexts/viewer/viewerBridges";

const mock = vi.hoisted(() => ({
  print: vi.fn(),
  register: vi.fn(),
  ready: true,
}));
vi.mock("@embedpdf/plugin-print/react", () => ({
  usePrintCapability: () => ({ provides: { print: mock.print } }),
}));
vi.mock("@editor/contexts/ViewerContext", () => ({
  useViewer: () => ({ registerBridge: mock.register }),
}));
vi.mock("@editor/components/viewer/hooks/useDocumentReady", () => ({
  useDocumentReady: () => mock.ready,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.ready = true;
});
afterEach(cleanup);

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
  render(<PrintAPIBridge canPrint={canPrintPdf(access)} />);
  const bridge = mock.register.mock.calls.find(
    ([kind, value]) => kind === "print" && value,
  )?.[1];
  expect(Boolean(bridge)).toBe(allowed);
  bridge?.api.print();
  expect(mock.print).toHaveBeenCalledTimes(allowed ? 1 : 0);
});

it("revokes a previously registered action when the replacement denies printing", () => {
  const view = render(<PrintAPIBridge canPrint />);
  const previous = mock.register.mock.calls.at(-1)?.[1];
  previous.api.print();
  expect(mock.print).toHaveBeenCalledOnce();
  view.rerender(<PrintAPIBridge canPrint={false} />);
  expect(mock.register).toHaveBeenLastCalledWith("print", null);
  previous.api.print();
  expect(mock.print).toHaveBeenCalledOnce();
  view.rerender(<PrintAPIBridge canPrint />);
  mock.register.mock.calls.at(-1)?.[1].api.print();
  expect(mock.print).toHaveBeenCalledTimes(2);
});

it("does not expose printing before the document is ready", () => {
  mock.ready = false;
  render(<PrintAPIBridge canPrint />);
  expect(mock.register).not.toHaveBeenCalled();
});

it.each([false, true])(
  "reports effective print permission consistently for owner=%s",
  (owner) => {
    render(
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
