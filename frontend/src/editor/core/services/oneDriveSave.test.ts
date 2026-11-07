// @vitest-environment node
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudOrigin } from "@editor/types/file";

const post = vi.fn();
vi.mock("@editor/services/apiClient", () => ({ default: { post } }));
const isProtected = vi.fn();
vi.mock("@editor/services/rightsManagedPdf", () => ({
  isMicrosoftProtectedPdf: (file: File) => isProtected(file),
}));

const { saveToOneDrive, copyName, OneDriveSaveError, withLiveAccount } =
  await import("@editor/services/oneDriveSave");

const origin: CloudOrigin = {
  provider: "onedrive",
  accountId: 33,
  driveId: "drive-1",
  itemId: "item-1",
  parentId: "folder-1",
  name: "Report.pdf",
  eTag: '"{E},1"',
  webUrl: null,
  protected: false,
};

const saved = {
  driveId: "drive-1",
  itemId: "item-2",
  parentId: "folder-1",
  name: "Report.pdf",
  eTag: '"{E},2"',
  webUrl: "https://contoso/Report.pdf",
};

function sent(): Record<string, FormDataEntryValue> {
  const form = post.mock.calls[0][1] as FormData;
  return Object.fromEntries(form.entries());
}

function failure(status: number, data: object = {}) {
  return new AxiosError("failed", "ERR", undefined, undefined, {
    status,
    statusText: "Failed",
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

const file = new File(["%PDF-1.7"], "Report.pdf", { type: "application/pdf" });

describe("saveToOneDrive", () => {
  beforeEach(() => {
    post.mockReset();
    isProtected.mockReset();
    isProtected.mockResolvedValue(false);
  });

  it("refuses to replace a file whose OneDrive version is unknown", async () => {
    await expect(
      saveToOneDrive(file, {
        kind: "replace",
        origin: { ...origin, eTag: null },
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(post).not.toHaveBeenCalled();
  });

  it("replaces the picked item, sending the eTag it was opened with", async () => {
    post.mockResolvedValue({ data: saved });

    const next = await saveToOneDrive(file, { kind: "replace", origin });

    expect(post.mock.calls[0][0]).toBe(
      "/api/v1/connected-accounts/33/drive/save",
    );
    expect(sent()).toMatchObject({
      driveId: "drive-1",
      itemId: "item-1",
      eTag: '"{E},1"',
    });
    expect(next).toMatchObject({
      itemId: "item-2",
      eTag: '"{E},2"',
      stirlingCopy: false,
    });
  });

  it("saves a copy into the folder the file came from", async () => {
    post.mockResolvedValue({ data: saved });

    const next = await saveToOneDrive(file, {
      kind: "copy",
      origin,
      name: copyName(origin.name),
    });
    expect(next.stirlingCopy).toBe(true);

    expect(sent()).toMatchObject({
      driveId: "drive-1",
      parentId: "folder-1",
      name: "Report (edited).pdf",
    });
    expect(sent().itemId).toBeUndefined();
  });

  it.each([
    ["a changed file", failure(409, { code: "conflict" }), "conflict"],
    [
      "a file deleted in OneDrive",
      failure(410, { code: "missing" }),
      "missing",
    ],
    ["an account that must sign in again", failure(409), "reconnect"],
    ["a rejected account", failure(401), "reconnect"],
    [
      "a lost connection",
      new AxiosError("Network Error", "ERR_NETWORK"),
      "network",
    ],
    ["a server failure", failure(502), "server"],
    ["an unexpected error", new Error("boom"), "server"],
  ])("reports %s as %s", async (_label, error, code) => {
    post.mockRejectedValue(error);

    await expect(
      saveToOneDrive(file, { kind: "replace", origin }),
    ).rejects.toMatchObject({ code });
  });

  it("never uploads plaintext over a Purview-protected original", async () => {
    await expect(
      saveToOneDrive(file, {
        kind: "replace",
        origin: { ...origin, protected: true },
      }),
    ).rejects.toBeInstanceOf(OneDriveSaveError);
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps protected output protected and remembers it", async () => {
    isProtected.mockResolvedValue(true);
    post.mockResolvedValue({ data: saved });

    const next = await saveToOneDrive(file, {
      kind: "replace",
      origin: { ...origin, protected: true },
    });

    expect(next.protected).toBe(true);
  });
});

describe("withLiveAccount", () => {
  const account = (id: number, status: "CONNECTED" | "NEEDS_RECONNECT") => ({
    id,
    provider: "microsoft" as const,
    email: null,
    displayName: null,
    status,
    personal: false,
    lastError: null,
    createdAt: null,
  });

  it("keeps the account the file was opened with while it is connected", () => {
    const target = { kind: "replace" as const, origin };
    expect(withLiveAccount(target, [account(33, "CONNECTED")])).toBe(target);
  });

  it("moves a file to the reconnected account when its old one is gone", () => {
    const next = withLiveAccount({ kind: "replace", origin }, [
      account(34, "CONNECTED"),
    ]);
    expect(next).toEqual({
      kind: "replace",
      origin: { ...origin, accountId: 34 },
    });
  });

  it("refuses to guess between several connected accounts", () => {
    expect(
      withLiveAccount({ kind: "replace", origin }, [
        account(34, "CONNECTED"),
        account(35, "CONNECTED"),
      ]),
    ).toBeNull();
  });

  it("asks for a reconnect when no account is connected", () => {
    expect(
      withLiveAccount({ kind: "replace", origin }, [
        account(33, "NEEDS_RECONNECT"),
      ]),
    ).toBeNull();
  });
});
