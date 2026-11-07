import { vi } from "vitest";
import apiClient from "@editor/services/apiClient";
import { rememberPdfAccess } from "@editor/services/pdfAccessService";
import {
  getOpenedRightsManagedPdf,
  openRightsManagedPdf,
  subscribeRightsManagedPdfs,
  type OpenedRightsManagedPdf,
  type RightsManagedProtection,
} from "@editor/services/rightsManagedPdf";

export interface FakePdf {
  text: string;
  password?: string;
  page?: { width: number; height: number };
  info?: Record<string, unknown>;
}

const FULL_RIGHTS: RightsManagedProtection = {
  label: null,
  rights: [],
  owner: null,
  issuedTo: null,
  issuedToOwner: false,
  contentId: null,
  custom: false,
  templateId: null,
  templateName: null,
  allowOfflineAccess: false,
  validUntilEpochSeconds: null,
  permissions: {
    view: true,
    print: true,
    copy: true,
    edit: true,
    comment: true,
    export: true,
    owner: false,
  },
};

function encode(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(text));
}

function withBytes<T extends Blob>(blob: T, bytes: Uint8Array<ArrayBuffer>): T {
  Object.defineProperties(blob, {
    arrayBuffer: {
      configurable: true,
      value: async () => bytes.slice().buffer,
    },
    slice: {
      configurable: true,
      value: (start?: number, end?: number) =>
        withBytes(new Blob(), bytes.slice(start, end)),
    },
  });
  return blob;
}

export function pdfFile(text: string, name = "report.pdf"): File {
  return withBytes(
    new File([text], name, { type: "application/pdf" }),
    encode(text),
  );
}

export function rememberSessionPassword(file: File, password: string): void {
  rememberPdfAccess(file, {
    password,
    encrypted: true,
    requiresOpeningPassword: true,
    signed: false,
    ownerAuthenticated: false,
    permissions: -4,
    pageCount: 1,
  });
}

export async function openInViewer(
  original: File,
  plaintextText: string,
): Promise<OpenedRightsManagedPdf> {
  if (!vi.isMockFunction(apiClient.post))
    throw new Error("Mock @editor/services/apiClient to open a Purview PDF");
  vi.mocked(apiClient.post).mockResolvedValueOnce({
    data: new Blob([plaintextText]),
    headers: { "x-stirling-protection": btoa(JSON.stringify(FULL_RIGHTS)) },
  });
  const stopGivingBytes = subscribeRightsManagedPdfs(() => {
    const opened = getOpenedRightsManagedPdf(original);
    if (opened) withBytes(opened.plaintext, encode(plaintextText));
  });
  try {
    return await openRightsManagedPdf(original, 7);
  } finally {
    stopGivingBytes();
  }
}

async function openFake(pdf: FakePdf | undefined, password?: string) {
  if (!pdf) throw new Error("Invalid PDF structure.");
  if (pdf.password !== undefined && pdf.password !== password)
    throw Object.assign(new Error("No password given"), {
      name: "PasswordException",
    });
  const page = pdf.page ?? { width: 595, height: 842 };
  return {
    numPages: 1,
    getPage: async () => ({ getViewport: () => page }),
    getMetadata: async () => ({ info: pdf.info ?? {} }),
    destroy: () => Promise.resolve(),
  };
}

export function servePdfs(...pdfs: FakePdf[]) {
  return ({ data, password }: { data: ArrayBuffer; password?: string }) => {
    const text = new TextDecoder().decode(data);
    return {
      promise: openFake(
        pdfs.find((pdf) => pdf.text === text),
        password,
      ),
      destroy: () => Promise.resolve(),
    };
  };
}
