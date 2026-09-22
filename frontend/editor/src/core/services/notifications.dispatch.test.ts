import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();

vi.mock("@app/services/apiClient", () => ({
  default: { post: (...args: unknown[]) => post(...args) },
}));

const { dispatchNotificationAction } =
  await import("@app/services/notifications");

/** The shape a client hands back on a refusal: parsed on web, the raw text on desktop. */
function refusal(data: unknown) {
  return Object.assign(new Error("Request failed"), { response: { data } });
}

const PROBLEM = {
  type: "about:blank",
  title: "Unprocessable Entity",
  status: 422,
  detail: "This document is damaged beyond what the repair tools can fix.",
};

describe("dispatchNotificationAction", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("answers null when the action ran", async () => {
    post.mockResolvedValue({ status: 200 });

    expect(await dispatchNotificationAction("failure:evt-1", "REPAIR")).toBe(
      null,
    );
  });

  it("sends the inputs as the body, never in the URL", async () => {
    // A password in a path would be logged by every proxy between here and the server.
    post.mockResolvedValue({ status: 200 });

    await dispatchNotificationAction("failure:evt-1", "DECRYPT", {
      password: "hunter2",
    });

    const [url, body] = post.mock.calls[0] as [string, unknown];
    expect(url).not.toContain("hunter2");
    expect(body).toEqual({ password: "hunter2" });
  });

  it("reads the server's reason from a parsed body", async () => {
    post.mockRejectedValue(refusal(PROBLEM));

    expect(await dispatchNotificationAction("failure:evt-1", "REPAIR")).toBe(
      PROBLEM.detail,
    );
  });

  it("reads it from a body handed back as text", async () => {
    // The desktop client reads the body with response.text() and passes the string through, so
    // taking only the parsed shape replaced every refusal there with the caller's generic line.
    post.mockRejectedValue(refusal(JSON.stringify(PROBLEM)));

    expect(await dispatchNotificationAction("failure:evt-1", "REPAIR")).toBe(
      PROBLEM.detail,
    );
  });

  it("falls back to the title when there is no detail", async () => {
    post.mockRejectedValue(refusal({ title: "Conflict", status: 409 }));

    expect(await dispatchNotificationAction("failure:evt-1", "REPAIR")).toBe(
      "Conflict",
    );
  });

  it("answers an empty reason rather than throwing on a body it cannot read", async () => {
    // A proxy's HTML error page, or a network failure with no response at all. The caller words
    // its own message for this; what it must not do is treat it as success.
    post.mockRejectedValue(refusal("<html>502 Bad Gateway</html>"));
    expect(await dispatchNotificationAction("failure:evt-1", "REPAIR")).toBe(
      "",
    );

    post.mockRejectedValue(new Error("Network Error"));
    expect(await dispatchNotificationAction("failure:evt-1", "REPAIR")).toBe(
      "",
    );
  });
});
