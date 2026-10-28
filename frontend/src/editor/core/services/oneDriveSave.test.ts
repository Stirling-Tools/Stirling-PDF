// @vitest-environment node
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudOrigin } from "@editor/types/file";

const post = vi.fn();
vi.mock("@editor/services/apiClient", () => ({ default: { post } }));

const { saveToOneDrive, copyName } =
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

function failure(status: number) {
  return new AxiosError("failed", "ERR", undefined, undefined, {
    status,
    statusText: "Failed",
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

function conflict(code?: string) {
  return new AxiosError("conflict", "ERR", undefined, undefined, {
    status: 409,
    statusText: "Conflict",
    data: code ? { code } : { detail: "reconnect" },
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

const file = new File(["%PDF-1.7"], "Report.pdf", { type: "application/pdf" });

describe("saveToOneDrive", () => {
  beforeEach(() => {
    post.mockReset();
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
    expect(next).toMatchObject({ itemId: "item-2", eTag: '"{E},2"' });
  });

  it("saves a copy into the folder the file came from", async () => {
    post.mockResolvedValue({ data: saved });

    await saveToOneDrive(file, {
      kind: "copy",
      origin,
      name: copyName(origin.name),
    });

    expect(sent()).toMatchObject({
      driveId: "drive-1",
      parentId: "folder-1",
      name: "Report (edited).pdf",
    });
    expect(sent().itemId).toBeUndefined();
  });

  it("reports a changed file as a conflict so the user can save a copy", async () => {
    post.mockRejectedValue(conflict("conflict"));

    await expect(
      saveToOneDrive(file, { kind: "replace", origin }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("asks to reconnect when the account needs to sign in again", async () => {
    post.mockRejectedValue(conflict());

    await expect(
      saveToOneDrive(file, { kind: "replace", origin }),
    ).rejects.toMatchObject({ code: "reconnect" });
  });

  it("tells a lost connection apart from a server failure", async () => {
    post.mockRejectedValueOnce(new AxiosError("Network Error", "ERR_NETWORK"));
    await expect(
      saveToOneDrive(file, { kind: "replace", origin }),
    ).rejects.toMatchObject({ code: "network" });

    post.mockRejectedValueOnce(failure(502));
    await expect(
      saveToOneDrive(file, { kind: "replace", origin }),
    ).rejects.toMatchObject({ code: "server" });
  });

  it("asks to reconnect when the server rejects the account", async () => {
    post.mockRejectedValue(failure(401));

    await expect(
      saveToOneDrive(file, { kind: "replace", origin }),
    ).rejects.toMatchObject({ code: "reconnect" });
  });
});
