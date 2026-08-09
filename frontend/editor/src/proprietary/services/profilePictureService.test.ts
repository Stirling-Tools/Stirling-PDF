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

  it("reports no avatar rather than throwing when the request fails", async () => {
    // A user without a picture 404s, and a signed-out one 401s; both mean "initials".
    get.mockRejectedValue(new Error("404"));

    await expect(fetchOwnProfilePicture()).resolves.toBeNull();
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
