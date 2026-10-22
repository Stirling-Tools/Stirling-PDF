import { describe, expect, it } from "vitest";
import { triggerFor } from "@portal/components/policies/PolicyRoutingConfig";

describe("triggerFor", () => {
  it("uses the schedule contract accepted by the backend", () => {
    expect(triggerFor("s3")).toEqual({
      type: "schedule",
      options: {
        schedule: { type: "every", count: 1, unit: "HOURS" },
      },
    });
  });

  it("keeps folder and webhook triggers event-driven", () => {
    expect(triggerFor("folder")).toEqual({
      type: "folder-watch",
      options: {},
    });
    expect(triggerFor("webhook")).toEqual({ type: "webhook", options: {} });
  });
});
