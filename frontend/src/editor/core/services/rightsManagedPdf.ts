import axios from "axios";
import i18n from "i18next";
import apiClient from "@editor/services/apiClient";
import {
  rememberPdfAccess,
  type PdfAccess,
} from "@editor/services/pdfAccessService";
import { PdfPermissionFlag } from "@editor/contexts/viewer/viewerBridges";

export const MICROSOFT_PROTECTION_SUBTYPE = "MicrosoftIRMServices";
const PROTECTION_HEADER = "x-stirling-protection";
const MARKER = new TextEncoder().encode(`/${MICROSOFT_PROTECTION_SUBTYPE}`);
const SCAN_WINDOW = 8 * 1024 * 1024;

export interface RightsManagedLabel {
  id: string;
  name: string;
  parentName: string | null;
  color: string | null;
  sensitivity: number;
}

export interface RightsManagedPermissions {
  view: boolean;
  print: boolean;
  copy: boolean;
  edit: boolean;
  comment: boolean;
  export: boolean;
  owner: boolean;
}

export interface RightsManagedProtection {
  label: RightsManagedLabel | null;
  rights: string[];
  owner: string | null;
  issuedTo: string | null;
  issuedToOwner: boolean;
  contentId: string | null;
  custom: boolean;
  templateId: string | null;
  templateName: string | null;
  allowOfflineAccess: boolean;
  validUntilEpochSeconds: number | null;
  permissions: RightsManagedPermissions;
}

export interface RightsManagementAccount {
  id: number;
  email: string | null;
  status: string;
}

export interface RightsManagementStatus {
  enabled: boolean;
  available: boolean;
  accounts: RightsManagementAccount[];
}

export interface OpenedRightsManagedPdf {
  original: File;
  plaintext: File;
  protection: RightsManagedProtection;
  accountId: number | undefined;
}

export type RightsManagementErrorCode =
  | "no_permissions"
  | "access_denied"
  | "sign_in_required"
  | "not_protected"
  | "unavailable"
  | "network"
  | "failed";

export class RightsManagementError extends Error {
  constructor(
    readonly code: RightsManagementErrorCode | string,
    message: string,
    readonly owner: string | null = null,
  ) {
    super(message);
    this.name = "RightsManagementError";
  }
}

const detections = new WeakMap<Blob, Promise<boolean>>();
let thumbnails = new WeakMap<OpenedRightsManagedPdf, string>();
let openedByFile = new WeakMap<Blob, OpenedRightsManagedPdf>();
const filesById = new Map<string, Blob>();
const listeners = new Set<() => void>();
let revision = 0;

function publish(): void {
  revision++;
  for (const listener of listeners) listener();
}

function includesMarker(bytes: Uint8Array): boolean {
  outer: for (let i = 0; i <= bytes.length - MARKER.length; i++) {
    for (let j = 0; j < MARKER.length; j++) {
      if (bytes[i + j] !== MARKER[j]) continue outer;
    }
    return true;
  }
  return false;
}

async function scanForMarker(file: Blob): Promise<boolean> {
  if (file.size <= SCAN_WINDOW * 2) {
    return includesMarker(new Uint8Array(await file.arrayBuffer()));
  }
  const head = new Uint8Array(await file.slice(0, SCAN_WINDOW).arrayBuffer());
  if (includesMarker(head)) return true;
  const tail = new Uint8Array(
    await file.slice(file.size - SCAN_WINDOW).arrayBuffer(),
  );
  return includesMarker(tail);
}

async function catalogNamesMicrosoftPayload(file: Blob): Promise<boolean> {
  try {
    const { PDFArray, PDFDict, PDFDocument, PDFName } =
      await import("@cantoo/pdf-lib");
    const doc = await PDFDocument.load(await file.arrayBuffer(), {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const subtypeOf = (spec: unknown): string | undefined => {
      if (!(spec instanceof PDFDict)) return undefined;
      const payload = spec.lookupMaybe(PDFName.of("EP"), PDFDict);
      return payload?.lookupMaybe(PDFName.of("Subtype"), PDFName)?.decodeText();
    };
    const associated = doc.catalog.lookupMaybe(PDFName.of("AF"), PDFArray);
    for (let i = 0; i < (associated?.size() ?? 0); i++) {
      if (subtypeOf(associated!.lookup(i)) === MICROSOFT_PROTECTION_SUBTYPE)
        return true;
    }
    const embedded = doc.catalog
      .lookupMaybe(PDFName.of("Names"), PDFDict)
      ?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict)
      ?.lookupMaybe(PDFName.of("Names"), PDFArray);
    for (let i = 1; i < (embedded?.size() ?? 0); i += 2) {
      if (subtypeOf(embedded!.lookup(i)) === MICROSOFT_PROTECTION_SUBTYPE)
        return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function detect(file: Blob): Promise<boolean> {
  if (await scanForMarker(file)) return true;
  const header = new TextDecoder().decode(
    await file.slice(0, 16).arrayBuffer(),
  );
  return header.startsWith("%PDF-2") && catalogNamesMicrosoftPayload(file);
}

export function isMicrosoftProtectedPdf(file: Blob): Promise<boolean> {
  let pending = detections.get(file);
  if (!pending) {
    pending = detect(file).catch(() => false);
    detections.set(file, pending);
  }
  return pending;
}

export function getOpenedRightsManagedPdf(
  file: Blob | string | null | undefined,
): OpenedRightsManagedPdf | undefined {
  if (!file) return undefined;
  const blob = typeof file === "string" ? filesById.get(file) : file;
  const opened = blob ? openedByFile.get(blob) : undefined;
  if (opened && typeof file !== "string" && "fileId" in file) {
    const fileId = (file as { fileId?: unknown }).fileId;
    if (typeof fileId === "string") filesById.set(fileId, file);
  }
  return opened;
}

export function getRightsManagedThumbnail(
  file: Blob | string | null | undefined,
): string | undefined {
  const opened = getOpenedRightsManagedPdf(file);
  return opened ? thumbnails.get(opened) : undefined;
}

async function generatePlaintextThumbnail(
  opened: OpenedRightsManagedPdf,
): Promise<void> {
  try {
    const { generateThumbnailForFile } =
      await import("@editor/utils/thumbnailUtils");
    const thumbnail = await generateThumbnailForFile(opened.plaintext);
    if (thumbnail && openedByFile.get(opened.original) === opened) {
      thumbnails.set(opened, thumbnail);
      publish();
    }
  } catch {
    return;
  }
}

function rememberOpened(opened: OpenedRightsManagedPdf): void {
  const access = accessForProtection(opened.protection);
  rememberPdfAccess(opened.plaintext, access);
  rememberPdfAccess(opened.original, access);
  openedByFile.set(opened.original, opened);
  const fileId = (opened.original as { fileId?: unknown }).fileId;
  if (typeof fileId === "string") filesById.set(fileId, opened.original);
  publish();
  void generatePlaintextThumbnail(opened);
}

export function subscribeRightsManagedPdfs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function rightsManagedPdfRevision(): number {
  return revision;
}

export function forgetRightsManagedPdfs(ids: readonly string[]): void {
  for (const id of ids) {
    const file = filesById.get(id);
    if (file) openedByFile.delete(file);
    filesById.delete(id);
  }
  publish();
}

export function clearRightsManagedPdfs(): void {
  openedByFile = new WeakMap();
  thumbnails = new WeakMap();
  filesById.clear();
  publish();
}

export function accessForProtection(
  protection: RightsManagedProtection,
): PdfAccess {
  const { print, copy, edit, comment } = protection.permissions;
  const permissions =
    (print ? PdfPermissionFlag.Print | PdfPermissionFlag.PrintHighQuality : 0) |
    (copy
      ? PdfPermissionFlag.CopyContents |
        PdfPermissionFlag.ExtractForAccessibility
      : 0) |
    (edit
      ? PdfPermissionFlag.ModifyContents |
        PdfPermissionFlag.AssembleDocument |
        PdfPermissionFlag.FillForms
      : 0) |
    (comment || edit ? PdfPermissionFlag.ModifyAnnotations : 0);
  return {
    password: "",
    encrypted: true,
    requiresOpeningPassword: false,
    signed: false,
    ownerAuthenticated: false,
    honorOwnerPasswords: true,
    permissions,
    pageCount: 0,
  };
}

function decodeProtection(header: string | undefined): RightsManagedProtection {
  if (!header) throw new Error("missing protection header");
  const base64 = header.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as RightsManagedProtection;
}

async function toRightsError(error: unknown): Promise<Error> {
  if (axios.isCancel(error))
    return new axios.CanceledError("Operation cancelled");
  if (axios.isAxiosError(error) && error.response) {
    let body: unknown = error.response.data;
    if (body instanceof Blob) {
      try {
        body = JSON.parse(await body.text());
      } catch {
        body = undefined;
      }
    }
    if (
      body &&
      typeof body === "object" &&
      "code" in body &&
      typeof body.code === "string"
    ) {
      const { code, message, owner } = body as {
        code: string;
        message?: string;
        owner?: string | null;
      };
      return new RightsManagementError(code, message ?? code, owner ?? null);
    }
    if (error.response.status === 404)
      return new RightsManagementError(
        "unavailable",
        i18n.t(
          "rightsManagedPdf.unavailable",
          "This server cannot open Microsoft Purview protected PDFs.",
        ),
      );
  }
  return new RightsManagementError(
    "failed",
    i18n.t(
      "rightsManagedPdf.openFailed",
      "Unable to open this protected PDF. Please try again.",
    ),
  );
}

export async function fetchRightsManagementStatus(): Promise<RightsManagementStatus> {
  try {
    const response = await apiClient.get<RightsManagementStatus>(
      "/api/v1/rights-management/status",
      { suppressErrorToast: true, skipAuthRedirect: true },
    );
    return response.data;
  } catch {
    return { enabled: false, available: false, accounts: [] };
  }
}

export async function openRightsManagedPdf(
  original: File,
  accountId?: number,
  signal?: AbortSignal,
): Promise<OpenedRightsManagedPdf> {
  const form = new FormData();
  form.append("fileInput", original);
  try {
    const response = await apiClient.post<Blob>(
      "/api/v1/rights-management/open",
      form,
      {
        params: accountId === undefined ? undefined : { accountId },
        responseType: "blob",
        suppressErrorToast: true,
        signal,
      },
    );
    const protection = decodeProtection(
      response.headers?.[PROTECTION_HEADER] as string | undefined,
    );
    const plaintext = new File([response.data], original.name, {
      type: "application/pdf",
      lastModified: original.lastModified,
    });
    const opened: OpenedRightsManagedPdf = {
      original,
      plaintext,
      protection,
      accountId,
    };
    rememberOpened(opened);
    return opened;
  } catch (error) {
    throw await toRightsError(error);
  }
}

export async function protectLikeOriginal(
  opened: OpenedRightsManagedPdf,
  output: File,
): Promise<File> {
  const form = new FormData();
  form.append("original", opened.original);
  form.append("fileInput", output);
  try {
    const response = await apiClient.post<Blob>(
      "/api/v1/rights-management/protect",
      form,
      {
        params:
          opened.accountId === undefined
            ? undefined
            : { accountId: opened.accountId },
        responseType: "blob",
        suppressErrorToast: true,
      },
    );
    const file = new File([response.data], output.name, {
      type: "application/pdf",
    });
    detections.set(file, Promise.resolve(true));
    rememberOpened({
      original: file,
      plaintext: new File([output], output.name, {
        type: "application/pdf",
        lastModified: output.lastModified,
      }),
      protection: opened.protection,
      accountId: opened.accountId,
    });
    return file;
  } catch (error) {
    throw await toRightsError(error);
  }
}
