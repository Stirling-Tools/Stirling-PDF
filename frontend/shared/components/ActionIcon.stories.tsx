import type { Meta, StoryObj } from "@storybook/react";
import { ActionIcon } from "@shared/components/ActionIcon";

const Plus = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M12 5v14M5 12h14"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
const Trash = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path
      d="M5 7h14M10 7V5h4v2m-8 0 1 13h6l1-13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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
      options: ["primary", "secondary", "tertiary"],
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
