/**
 * Magic-link sign-in on the SaaS login screen. Collapsed it is a single link;
 * expanded it becomes an email field and a send button, so the two states are
 * really two different components sharing a prop.
 */
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import MagicLinkForm from "@app/routes/login/MagicLinkForm";

const meta: Meta<typeof MagicLinkForm> = {
  title: "SaaS/Login/MagicLinkForm",
  component: MagicLinkForm,
  parameters: { layout: "padded" },
  args: {
    showMagicLink: false,
    magicLinkEmail: "",
    setMagicLinkEmail: () => {},
    setShowMagicLink: () => {},
    onSubmit: () => {},
    isSubmitting: false,
  },
};
export default meta;

type Story = StoryObj<typeof MagicLinkForm>;

/** Collapsed — just the link that opens the form. */
export const Collapsed: Story = {};

export const Expanded: Story = { args: { showMagicLink: true } };

export const WithEmail: Story = {
  args: { showMagicLink: true, magicLinkEmail: "a.whitfield@example.com" },
};

/** Sending, which disables the field and the button together. */
export const Submitting: Story = {
  args: {
    showMagicLink: true,
    magicLinkEmail: "a.whitfield@example.com",
    isSubmitting: true,
  },
};

/** Typing for real, so the field and its clear/submit states track input. */
export const Interactive: Story = {
  render: function Interactive() {
    const [open, setOpen] = useState(true);
    const [email, setEmail] = useState("");
    return (
      <MagicLinkForm
        showMagicLink={open}
        magicLinkEmail={email}
        setMagicLinkEmail={setEmail}
        setShowMagicLink={setOpen}
        onSubmit={() => {}}
        isSubmitting={false}
      />
    );
  },
};
