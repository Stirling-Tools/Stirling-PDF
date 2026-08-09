import { describe, it, expect, beforeEach, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();

vi.mock("@app/services/apiClient", () => ({
  default: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    delete: (...args: unknown[]) => del(...args),
  },
}));

import {
  fetchOwnProfilePicture,
  fetchProfilePictureThumbnails,
  uploadProfilePicture,
} from "@app/services/profilePictureService";

describe("profilePictureService", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    del.mockReset();
  });

  it("turns the signed-in user's avatar into an object URL", async () => {
    const createObjectURL = vi.fn(() => "blob:avatar");
    vi.stubGlobal("URL", { ...URL, createObjectURL });
    get.mockResolvedValue({ data: new Blob(["png"]) });

    await expect(fetchOwnProfilePicture()).resolves.toBe("blob:avatar");
    expect(get).toHaveBeenCalledWith(
      "/api/v1/user/profile-picture",
      expect.objectContaining({ responseType: "blob" }),
    );
    vi.unstubAllGlobals();
  });

  it.each([404, 401, 403])(
    "reports no avatar for a settled %i response",
    async (status) => {
      get.mockRejectedValue({ response: { status } });

      await expect(fetchOwnProfilePicture()).resolves.toBeNull();
    },
  );

  it("rethrows a transient failure so the caller can retry", async () => {
    // Swallowing this would cache "no avatar" for the whole browser session.
    get.mockRejectedValue({ response: { status: 500 } });

    await expect(fetchOwnProfilePicture()).rejects.toBeDefined();
  });

  it("dedupes ids and sends one batch request for thumbnails", async () => {
    get.mockResolvedValue({ data: { "1": "data:image/png;base64,AQID" } });

    const result = await fetchProfilePictureThumbnails([1, 2, 1, "2"]);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(
      "/api/v1/user/profile-pictures",
      expect.objectContaining({ params: { userIds: "1,2" } }),
    );
    expect(result).toEqual({ "1": "data:image/png;base64,AQID" });
  });

  it("chunks a large roster so the query string cannot overflow", async () => {
    // Sent as one request, ~1400 ids blow past nginx's default 8KB request line and 414, which
    // would silently drop every avatar on the page.
    get.mockResolvedValue({ data: {} });

    await fetchProfilePictureThumbnails(
      Array.from({ length: 1400 }, (_, i) => i + 1),
    );

    expect(get).toHaveBeenCalledTimes(7);
    for (const call of get.mock.calls) {
      const ids = (call[1] as { params: { userIds: string } }).params.userIds;
      expect(ids.split(",").length).toBeLessThanOrEqual(200);
      expect(ids.length).toBeLessThan(2000);
    }
  });

  it("keeps the avatars it did get when one chunk fails", async () => {
    get
      .mockResolvedValueOnce({ data: { "1": "data:image/png;base64,AQID" } })
      .mockRejectedValueOnce(new Error("500"));

    const result = await fetchProfilePictureThumbnails(
      Array.from({ length: 300 }, (_, i) => i + 1),
    );

    expect(result).toEqual({ "1": "data:image/png;base64,AQID" });
  });

  it("skips the request entirely when there are no ids", async () => {
    await expect(fetchProfilePictureThumbnails([])).resolves.toEqual({});
    expect(get).not.toHaveBeenCalled();
  });

  it("degrades to no avatars when the batch request fails", async () => {
    get.mockRejectedValue(new Error("500"));

    await expect(fetchProfilePictureThumbnails([1])).resolves.toEqual({});
  });

  it("uploads the picture as multipart form data", async () => {
    post.mockResolvedValue({ data: { hasProfilePicture: true } });

    await uploadProfilePicture(new Blob(["png"]));

    const [url, body] = post.mock.calls[0];
    expect(url).toBe("/api/v1/user/profile-picture");
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBeInstanceOf(Blob);
  });
});
