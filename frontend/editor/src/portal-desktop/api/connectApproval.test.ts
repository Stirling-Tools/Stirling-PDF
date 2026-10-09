import { beforeEach, expect, it, vi } from "vitest";

const saasFetch = vi.hoisted(() => vi.fn());
vi.mock("@app/portal/saasTransport", () => ({ saasFetch }));
vi.mock("@app/portal/api/saasApiBase", () => ({
  saasApiBase: () => "https://api.example",
}));
// The real one loads desktop auth, which needs a configured Stirling Cloud.
vi.mock("@app/portal/auth/portalSaasSession", () => ({
  withPortalSaasSession: vi.fn(),
  SaasSessionRequiredError: class extends Error {},
}));

import { HttpError } from "@app/portal/api/http";
import { approveConnect, requestIdOf } from "@app/portal/api/connectApproval";

beforeEach(() => saasFetch.mockReset());

it("approves as the account whose token it is given", async () => {
  saasFetch.mockResolvedValue(
    new Response(JSON.stringify({ callbackUrl: "cb", nonce: "n-1" }), {
      status: 200,
    }),
  );

  await expect(approveConnect("req 1", "cloud-access")).resolves.toEqual({
    callbackUrl: "cb",
    nonce: "n-1",
  });
  expect(saasFetch).toHaveBeenCalledWith(
    "https://api.example/api/v1/account-link/connect/req%201/approve",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer cloud-access",
      }),
    }),
  );
});

it("keeps the refusal's status, which tells a wrong account from an expired request", async () => {
  saasFetch.mockResolvedValue(
    new Response(JSON.stringify({ error: "WRONG_ACCOUNT" }), { status: 409 }),
  );

  const error = await approveConnect("req-1", "t").catch((e: unknown) => e);

  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).status).toBe(409);
  expect((error as HttpError).body).toEqual({ error: "WRONG_ACCOUNT" });
});

it("reads the request id from the server's approval link", () => {
  expect(requestIdOf("https://app.example/link?request=abc-123")).toBe(
    "abc-123",
  );
  expect(requestIdOf("https://app.example/link")).toBeNull();
  expect(requestIdOf("not a url")).toBeNull();
});
