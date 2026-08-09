import type { Meta, StoryObj } from "@storybook/react-vite";
import AuthLayout from "@app/routes/authShared/AuthLayout";
import LoginHeader from "@app/routes/login/LoginHeader";
import "@app/auth/ui/auth.css";

/**
 * The editor's wrapper around the shared auth card: the same centred shell the
 * portal uses, with the editor's legal and cookie footer pinned to the bottom
 * of the viewport. It takes no props beyond its children, so what varies
 * between stories is the height of the content sitting inside the card and how
 * that content sits against the fixed footer.
 */
const meta: Meta<typeof AuthLayout> = {
  title: "Auth/Auth Layout",
  component: AuthLayout,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof AuthLayout>;

/** A short screen — the card floats well clear of the footer. */
export const Default: Story = {
  args: {
    children: (
      <LoginHeader
        title="Sign in"
        subtitle="Enter your credentials to continue."
      />
    ),
  },
};

/**
 * A tall screen: the card grows towards the fixed footer, which is the case
 * that shows whether the two collide on short viewports.
 */
export const TallContent: Story = {
  args: {
    children: (
      <>
        <LoginHeader title="Create your account" />
        {Array.from({ length: 8 }, (_, i) => (
          <p key={i} style={{ color: "var(--c-text)" }}>
            Placeholder form row {i + 1}
          </p>
        ))}
      </>
    ),
  },
};
