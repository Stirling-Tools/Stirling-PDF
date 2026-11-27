import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import GroupedFormatDropdown from "@editor/components/tools/convert/GroupedFormatDropdown";

const OPTIONS = [{ value: "pdf", label: "PDF", group: "Document" }];

describe("GroupedFormatDropdown", () => {
  it("names the trigger from its label and the chosen format", () => {
    render(
      <MantineProvider>
        <GroupedFormatDropdown
          label="From"
          value="pdf"
          options={OPTIONS}
          onChange={vi.fn()}
        />
      </MantineProvider>,
    );
    expect(screen.getByRole("button")).toHaveAccessibleName(/^From .+\(PDF\)$/);
  });
});
