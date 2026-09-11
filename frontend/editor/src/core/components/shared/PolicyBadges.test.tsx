import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";
import {
  PolicyBadges,
  type FileItemPolicyRef,
} from "@app/components/shared/PolicyBadges";

describe("PolicyBadges", () => {
  it("shows a failed policy even after three successful policies", () => {
    const policies: FileItemPolicyRef[] = [
      "security",
      "compliance",
      "classification",
      "ingestion",
    ].map((id, index) => ({
      id,
      name: id,
      accentColor: "var(--c-danger)",
      blocked: index === 3,
    }));
    const { container } = render(<PolicyBadges policies={policies} />, {
      wrapper: MantineProvider,
    });
    expect(screen.getByTestId("GppBadOutlinedIcon")).toBeVisible();
    expect(container.querySelectorAll(".policy-badge")).toHaveLength(3);
    expect(policies.map((policy) => policy.id)).toEqual([
      "security",
      "compliance",
      "classification",
      "ingestion",
    ]);
  });
});
