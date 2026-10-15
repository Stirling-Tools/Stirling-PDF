import { describe, expect, it, vi } from "vitest";
import {
  asMemberOverPlanLimit,
  onMemberOverPlanLimit,
  reportMemberOverPlanLimit,
} from "@app/services/memberOverPlanLimit";

const BODY = {
  error: "MEMBER_OVER_PLAN_LIMIT",
  message: "Your team's plan doesn't cover your account right now.",
  teamId: 42,
  teamName: "Acme",
  leaders: ["alex@acme.example", 7],
};

describe("member over plan limit", () => {
  it("recognises only the 403 with its sentinel", () => {
    expect(asMemberOverPlanLimit(403, BODY)).toEqual({
      teamId: 42,
      teamName: "Acme",
      leaders: ["alex@acme.example"],
    });
    expect(asMemberOverPlanLimit(401, BODY)).toBeNull();
    expect(asMemberOverPlanLimit(403, { error: "FORBIDDEN" })).toBeNull();
    expect(asMemberOverPlanLimit(403, "nope")).toBeNull();
  });

  it("reports once to every listener and tells the caller to stand down", () => {
    const handler = vi.fn();
    const stop = onMemberOverPlanLimit(handler);
    expect(reportMemberOverPlanLimit(403, BODY)).toBe(true);
    expect(reportMemberOverPlanLimit(500, BODY)).toBe(false);
    stop();
    reportMemberOverPlanLimit(403, BODY);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].teamId).toBe(42);
  });
});
