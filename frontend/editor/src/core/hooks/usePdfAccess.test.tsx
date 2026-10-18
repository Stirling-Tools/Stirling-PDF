import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PdfPermissionFlag } from "@embedpdf/models";
import { usePdfAccess } from "@app/hooks/usePdfAccess";
import {
  clearPdfAccess,
  getPdfAccess,
  rememberPdfAccess,
  type PdfAccess,
} from "@app/services/pdfPasswordStore";
import type { PdfPermissionSnapshot } from "@app/services/pdfPermissionProbe";

const mocks = vi.hoisted(() => ({
  probe: vi.fn(),
  snapshots: new WeakMap<Blob, unknown>(),
  policy: { value: undefined as boolean | undefined },
}));

vi.mock("@app/services/pdfPermissionProbe", () => ({
  probePdfPermissions: mocks.probe,
  getProbeSnapshot: (file: Blob) => mocks.snapshots.get(file),
}));

vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({
    config:
      mocks.policy.value === undefined
        ? null
        : { honorOwnerPasswords: mocks.policy.value },
    loading: false,
    error: null,
    refetch: async () => undefined,
  }),
}));

function ProbeHook({ file }: { file: File }) {
  usePdfAccess(file);
  return null;
}

const restrictedSnapshot: PdfPermissionSnapshot = {
  encrypted: true,
  requiresOpeningPassword: false,
  permissions: PdfPermissionFlag.Print,
  ownerAuthenticated: false,
  pageCount: 1,
  signed: false,
};

beforeEach(() => {
  clearPdfAccess();
  mocks.probe.mockReset();
  mocks.policy.value = undefined;
});

afterEach(() => {
  cleanup();
  clearPdfAccess();
});

it("recomputes probe-derived access when the policy loads later", async () => {
  const file = new File(["pdf"], "locked.pdf");
  mocks.snapshots.set(file, restrictedSnapshot);
  mocks.probe.mockResolvedValue(restrictedSnapshot);

  const view = render(<ProbeHook file={file} />);
  await waitFor(() => expect(getPdfAccess(file)?.canModify).toBe(false));
  expect(getPdfAccess(file)?.canPrint).toBe(true);

  mocks.policy.value = false;
  view.rerender(<ProbeHook file={file} />);
  await waitFor(() => expect(getPdfAccess(file)?.canModify).toBe(true));
  expect(mocks.probe).toHaveBeenCalledOnce();
});

it("does not overwrite server-verified credentials when the policy changes", async () => {
  const file = new File(["pdf"], "unlocked.pdf");
  const unlocked: PdfAccess = {
    password: "secret",
    encrypted: true,
    openingAuthenticated: true,
    signed: false,
    ownerAuthenticated: false,
    permissions: 0,
    credentialFingerprint: "server-credentials",
    canModify: false,
    canAssemble: false,
    pageCount: 1,
  };
  rememberPdfAccess(file, unlocked);

  const view = render(<ProbeHook file={file} />);
  mocks.policy.value = false;
  view.rerender(<ProbeHook file={file} />);
  await act(async () => {
    await Promise.resolve();
  });

  expect(getPdfAccess(file)?.canModify).toBe(false);
  expect(getPdfAccess(file)?.password).toBe("secret");
  expect(mocks.probe).not.toHaveBeenCalled();
});
