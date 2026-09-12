import { describe, expect, it } from "vitest";
import { isStorageKeyRevoked } from "@app/services/storageKeyRevoked";

/** The backend's wording, from StorageEncryptionErrors.revoked. */
const DETAIL =
  "Access to this file has been revoked (its encryption key is disabled)";

function axiosError(status: number, data: unknown) {
  return { response: { status, data } };
}

/** Stands in for the Blob axios hands back when responseType is "blob". */
function blobBody(text: string) {
  return { text: () => Promise.resolve(text) };
}

describe("isStorageKeyRevoked", () => {
  it("recognises the revocation detail in a JSON body", async () => {
    await expect(
      isStorageKeyRevoked(axiosError(403, { detail: DETAIL })),
    ).resolves.toBe(true);
  });

  it("recognises it in a plain-text body", async () => {
    await expect(isStorageKeyRevoked(axiosError(403, DETAIL))).resolves.toBe(
      true,
    );
  });

  // The file endpoints request blobs, so this is the shape that actually
  // arrives when someone opens a file under a revoked key.
  it("reads a blob body before matching", async () => {
    await expect(
      isStorageKeyRevoked(
        axiosError(403, blobBody(JSON.stringify({ detail: DETAIL }))),
      ),
    ).resolves.toBe(true);
  });

  it("leaves an ordinary permissions 403 alone", async () => {
    await expect(
      isStorageKeyRevoked(
        axiosError(403, {
          detail: "You do not have permission to view this file",
        }),
      ),
    ).resolves.toBe(false);
  });

  it("ignores other statuses carrying the same words", async () => {
    await expect(isStorageKeyRevoked(axiosError(500, DETAIL))).resolves.toBe(
      false,
    );
  });

  it("does not throw on a body it cannot read", async () => {
    const unreadable = {
      response: {
        status: 403,
        data: {
          text: () => Promise.reject(new Error("stream already consumed")),
        },
      },
    };
    await expect(isStorageKeyRevoked(unreadable)).resolves.toBe(false);
  });

  it("returns false for an error with no response at all", async () => {
    await expect(isStorageKeyRevoked(new Error("network"))).resolves.toBe(
      false,
    );
  });
});
