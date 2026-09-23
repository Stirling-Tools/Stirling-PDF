import { beforeEach, expect, test, vi } from "vitest";
import { waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ post: vi.fn(), session: vi.fn() }));
vi.mock("@app/services/apiClient", () => ({ default: { post: mocks.post } }));
vi.mock("@app/services/serverAutomationSession", () => ({
  getServerAutomationSession: mocks.session,
}));
import { meterAutomationRun } from "@app/services/automationMeter";
const payload = {
  automationName: "Classification",
  operations: ["classify"],
  inputs: [{ pages: 2, bytes: 3000 }],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.post.mockResolvedValue({});
});

test.each(["https://cloud.test", "https://selfhosted.test"])(
  "reports browser classification to %s",
  async (baseUrl) => {
    mocks.session.mockResolvedValue({ baseUrl, key: "owner" });
    meterAutomationRun(payload);
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        `${baseUrl}/api/v1/automation/meter`,
        payload,
        {
          suppressErrorToast: true,
          automationSession: "owner",
        },
      ),
    );
  },
);

test("no local metering request is sent without a server session", async () => {
  mocks.session.mockRejectedValue(new Error("Sign in"));
  meterAutomationRun(payload);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mocks.post).not.toHaveBeenCalled();
});

test("large folder sweeps report every input within the server's payload limit", async () => {
  mocks.session.mockResolvedValue({
    baseUrl: "https://server.test",
    key: "owner",
  });
  meterAutomationRun({
    ...payload,
    inputs: Array.from({ length: 10_001 }, () => ({ pages: 0, bytes: 1 })),
  });
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
  expect(mocks.post.mock.calls.map((call) => call[1].inputs.length)).toEqual([
    10_000, 1,
  ]);
});
