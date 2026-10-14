import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PrintAPIBridge } from "@app/components/viewer/PrintAPIBridge";
import { pdfAllows } from "@app/services/pdfSessionUnlock";
import { PdfPermissionFlag } from "@embedpdf/models";
import type { PdfAccess } from "@app/services/pdfPasswordStore";

const fixture = vi.hoisted(() => ({
  print: { print: vi.fn() },
  registerBridge: vi.fn(),
}));
vi.mock("@embedpdf/plugin-print/react", () => ({
  usePrintCapability: () => ({ provides: fixture.print }),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({ registerBridge: fixture.registerBridge }),
}));
vi.mock("@app/components/viewer/hooks/useDocumentReady", () => ({
  useDocumentReady: () => true,
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("blocks all shared print entry points until owner verification and blocks again when switching to a restricted document", () => {
  const access: PdfAccess = {
    password: "",
    encrypted: true,
    signed: false,
    ownerAuthenticated: false,
    permissions: 0,
    canModify: false,
    canAssemble: false,
    pageCount: 1,
  };
  const canPrint = (value: PdfAccess) =>
    pdfAllows(value, PdfPermissionFlag.Print) &&
    pdfAllows(value, PdfPermissionFlag.PrintHighQuality);
  const attemptPrint = () =>
    fixture.registerBridge.mock.lastCall?.[1]?.api.print();
  const view = render(<PrintAPIBridge canPrint={canPrint(access)} />);
  attemptPrint();
  expect(fixture.print.print).not.toHaveBeenCalled();
  view.rerender(
    <PrintAPIBridge
      canPrint={canPrint({ ...access, ownerAuthenticated: true })}
    />,
  );
  attemptPrint();
  expect(fixture.print.print).toHaveBeenCalledOnce();
  view.rerender(<PrintAPIBridge canPrint={canPrint(access)} />);
  attemptPrint();
  expect(fixture.print.print).toHaveBeenCalledOnce();
});
