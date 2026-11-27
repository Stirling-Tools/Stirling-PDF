import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Checkbox, MantineProvider, Switch } from "@mantine/core";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";

const HELP = "Users must fill this in before saving.";

describe("infoLabelProps", () => {
  it("names a switch from its label alone and reads the help as its description", async () => {
    render(
      <MantineProvider>
        <Switch {...infoLabelProps("Required", HELP)} />
      </MantineProvider>,
    );
    const control = screen.getByRole("switch");
    await expect.poll(() => control).toHaveAccessibleName("Required");
    expect(control).toHaveAccessibleDescription(HELP);
  });

  it("names a checkbox from its label alone and reads the help as its description", async () => {
    render(
      <MantineProvider>
        <Checkbox {...infoLabelProps("Read only", HELP)} />
      </MantineProvider>,
    );
    const control = screen.getByRole("checkbox");
    await expect.poll(() => control).toHaveAccessibleName("Read only");
    expect(control).toHaveAccessibleDescription(HELP);
  });
});
