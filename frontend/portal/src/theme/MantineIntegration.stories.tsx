import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button as MantineButton,
  Group,
  Stack,
  TextInput,
} from "@mantine/core";
import { Button as SuiButton } from "@shared/components";

/**
 * Proof that Mantine components render with the SUI-bound theme — a Mantine
 * filled button uses --color-blue, so it sits next to a SUI button as one
 * system. This is the "escape hatch" pattern: reach for Mantine when a
 * component isn't worth rebuilding in SUI, and it still looks on-brand.
 */
const meta: Meta = {
  title: "Portal/Theme/Mantine Integration",
  parameters: { layout: "padded" },
};
export default meta;

type Story = StoryObj;

export const SideBySide: Story = {
  render: () => (
    <Stack gap="md" style={{ maxWidth: 420 }}>
      <Group>
        <SuiButton>SUI Button</SuiButton>
        <MantineButton color="blue">Mantine Button</MantineButton>
      </Group>
      <Group>
        <MantineButton color="green">Mantine green</MantineButton>
        <MantineButton color="red">Mantine red</MantineButton>
        <MantineButton color="amber">Mantine amber</MantineButton>
        <MantineButton color="purple">Mantine purple</MantineButton>
      </Group>
      <MantineButton variant="light" color="blue">
        Light variant (uses --color-blue-light)
      </MantineButton>
      <TextInput
        label="Mantine TextInput"
        placeholder="Reach for Mantine form controls when SUI doesn't have one"
      />
    </Stack>
  ),
};
