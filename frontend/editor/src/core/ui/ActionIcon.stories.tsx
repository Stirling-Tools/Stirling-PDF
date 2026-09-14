import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon } from "@app/ui/Icon";
import { ActionIcon } from "@app/ui/ActionIcon";

const Plus = () => <Icon name="plus" size="1em" />;
const Trash = () => <Icon name="trash" size="1em" />;

const ACCENTS = [
  "default",
  "neutral",
  "brand",
  "ai",
  "premium",
  "danger",
  "success",
  "warning",
] as const;

const meta: Meta<typeof ActionIcon> = {
  title: "Primitives/ActionIcon",
  component: ActionIcon,
  parameters: { layout: "centered" },
  args: {
    variant: "primary",
    accent: "default",
    size: "md",
    "aria-label": "Add",
  },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["primary", "secondary", "tertiary", "quiet"],
    },
    accent: { control: "inline-radio", options: ACCENTS },
    size: { control: "inline-radio", options: ["sm", "md", "lg", "xl"] },
    shape: { control: "inline-radio", options: ["default", "circle", "pill"] },
  },
};
export default meta;
type Story = StoryObj<typeof ActionIcon>;

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    {children}
  </div>
);

export const Playground: Story = {
  render: (args) => (
    <ActionIcon {...args}>
      <Plus />
    </ActionIcon>
  ),
};

/** The three variants × every accent. */
export const Accents: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(8, auto)",
        gap: 10,
      }}
    >
      {(["primary", "secondary", "tertiary"] as const).flatMap((variant) =>
        ACCENTS.map((accent) => (
          <ActionIcon
            key={`${variant}-${accent}`}
            variant={variant}
            accent={accent}
            aria-label={accent}
          >
            <Plus />
          </ActionIcon>
        )),
      )}
    </div>
  ),
};

/** Square at every size; the icon scales with `1em`. */
export const Sizes: Story = {
  render: () => (
    <Wrap>
      {(["sm", "md", "lg", "xl"] as const).map((size) => (
        <ActionIcon key={size} size={size} aria-label={`Add ${size}`}>
          <Plus />
        </ActionIcon>
      ))}
    </Wrap>
  ),
};

export const Shapes: Story = {
  render: () => (
    <Wrap>
      <ActionIcon shape="default" aria-label="Add">
        <Plus />
      </ActionIcon>
      <ActionIcon shape="circle" variant="secondary" aria-label="Add">
        <Plus />
      </ActionIcon>
      <ActionIcon
        shape="circle"
        variant="tertiary"
        accent="danger"
        aria-label="Delete"
      >
        <Trash />
      </ActionIcon>
    </Wrap>
  ),
};
