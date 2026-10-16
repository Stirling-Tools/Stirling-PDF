import { beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

const post = vi.hoisted(() => vi.fn());
vi.mock("@app/services/apiClient", () => ({ default: { post } }));

import {
  isLinkKey,
  LinkKeyError,
  linkKeyErrorMessage,
  redeemLinkKey,
} from "@app/services/linkKey";

function failure(status: number, data?: unknown): AxiosError {
  const response = {
    status,
    data,
    statusText: "",
    headers: {},
    config: { headers: new AxiosHeaders() },
  } as AxiosResponse;
  return new AxiosError("failed", "ERR", undefined, undefined, response);
}

async function codeFor(error: unknown) {
  post.mockRejectedValueOnce(error);
  try {
    await redeemLinkKey("stlk_k.s");
  } catch (e) {
    return (e as LinkKeyError).code;
  }
  throw new Error("expected a rejection");
}

describe("link keys", () => {
  beforeEach(() => {
    post.mockReset().mockResolvedValue({ data: {} });
  });

  it("recognises a link key so a licence field can route it", () => {
    expect(isLinkKey("  stlk_abc.def ")).toBe(true);
    expect(isLinkKey("00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("sends the key without the whitespace an email wrap adds", async () => {
    await redeemLinkKey(" stlk_abc\n.def ");
    expect(post).toHaveBeenCalledWith(
      "/api/v1/account-link/key",
      { key: "stlk_abc.def" },
      { suppressErrorToast: true },
    );
  });

  it("keeps the server's reason so the message can say what to do", async () => {
    expect(await codeFor(failure(400, { error: "KEY_REJECTED" }))).toBe(
      "KEY_REJECTED",
    );
    expect(await codeFor(failure(409, { error: "ALREADY_LINKED" }))).toBe(
      "ALREADY_LINKED",
    );
    expect(await codeFor(failure(502, { error: "CONNECT_FAILED" }))).toBe(
      "CONNECT_FAILED",
    );
  });

  it("explains a refusal that carries no reason", async () => {
    expect(await codeFor(failure(403))).toBe("NOT_OWNER");
    expect(await codeFor(failure(404))).toBe("NOT_AVAILABLE");
    expect(await codeFor(failure(500, "<html>"))).toBe("UNKNOWN");
    expect(await codeFor(new Error("offline"))).toBe("CONNECT_FAILED");
  });

  it("turns a refusal into a sentence", () => {
    const t = ((_key: string, fallback: string) => fallback) as never;
    expect(linkKeyErrorMessage(new LinkKeyError("KEY_REJECTED"), t)).toMatch(
      /used, revoked or expired/,
    );
    expect(linkKeyErrorMessage(new Error("?"), t)).toMatch(/Try again/);
  });
});
