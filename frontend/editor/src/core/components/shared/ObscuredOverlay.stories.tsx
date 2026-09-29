import type { Meta, StoryObj } from "@storybook/react-vite";
import ObscuredOverlay from "@app/components/shared/ObscuredOverlay";

const meta: Meta<typeof ObscuredOverlay> = {
  title: "Shared/ObscuredOverlay",
  component: ObscuredOverlay,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "22rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof meta>;

const Content = () => (
  <div style={{ padding: "1rem", background: "var(--mantine-color-gray-1)" }}>
    Underlying content that gets obscured.
  </div>
);

export const Unobscured: Story = {
  args: {
    obscured: false,
    children: <Content />,
  },
};

export const Obscured: Story = {
  args: {
    obscured: true,
    overlayMessage: "This feature requires an upgrade",
    buttonText: "Upgrade",
    onButtonClick: () => {},
    children: <Content />,
  },
};

export const RoundedCorners: Story = {
  args: {
    obscured: true,
    overlayMessage: "Locked",
    borderRadius: "0.5rem",
    children: <Content />,
  },
};
