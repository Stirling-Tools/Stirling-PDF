import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dropdown } from "@shared/components/Dropdown";
import { Button } from "@shared/components/Button";

const meta: Meta = {
  title: "Primitives/Dropdown",
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ padding: "4rem 2rem", minHeight: "24rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj;

export const Basic: Story = {
  render: () => (
    <Dropdown.Root>
      <Dropdown.Trigger>
        <Button variant="outline">Open menu</Button>
      </Dropdown.Trigger>
      <Dropdown.Menu>
        <Dropdown.Item onSelect={() => console.log("a")}>Item A</Dropdown.Item>
        <Dropdown.Item onSelect={() => console.log("b")}>Item B</Dropdown.Item>
        <Dropdown.Item onSelect={() => console.log("c")} active>
          Item C (active)
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown.Root>
  ),
};

export const WithDivider: Story = {
  render: () => (
    <Dropdown.Root>
      <Dropdown.Trigger>
        <Button variant="outline">Account</Button>
      </Dropdown.Trigger>
      <Dropdown.Menu width="13rem">
        <Dropdown.Item>Profile</Dropdown.Item>
        <Dropdown.Item>Workspace settings</Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Item>Sign out</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown.Root>
  ),
};

export const WithTrailingHints: Story = {
  render: () => (
    <Dropdown.Root>
      <Dropdown.Trigger>
        <Button variant="outline">Commands</Button>
      </Dropdown.Trigger>
      <Dropdown.Menu width="16rem">
        <Dropdown.Item trailing="⌘ K">Search</Dropdown.Item>
        <Dropdown.Item trailing="N P">New pipeline</Dropdown.Item>
        <Dropdown.Item trailing="N K">New API key</Dropdown.Item>
        <Dropdown.Item trailing="T" active>
          Toggle theme
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown.Root>
  ),
};

export const AlignStart: Story = {
  render: () => (
    <Dropdown.Root align="start">
      <Dropdown.Trigger>
        <Button variant="outline">Aligned to start</Button>
      </Dropdown.Trigger>
      <Dropdown.Menu>
        <Dropdown.Item>One</Dropdown.Item>
        <Dropdown.Item>Two</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown.Root>
  ),
};
