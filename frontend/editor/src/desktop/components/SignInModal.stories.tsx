/**
 * The desktop sign-in dialog. It takes no props and stays unmounted until
 * something elsewhere in the app asks for sign-in over a window event, at which
 * point it hosts the setup wizard in a modal frame. The `locked` flag that the
 * request may carry only governs whether the dialog can be dismissed, so it
 * produces no second appearance.
 *
 * The story fires that request on mount, which is the only way to see the
 * dialog at all. Mantine renders it into a portal outside the story canvas.
 */
import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignInModal } from "@app/components/SignInModal";
import { OPEN_SIGN_IN_EVENT } from "@app/constants/signInEvents";

/** Stands in for whatever part of the app asked the user to sign in. */
function Trigger() {
  useEffect(() => {
    const id = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN_EVENT));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  return <SignInModal />;
}

const meta: Meta<typeof SignInModal> = {
  title: "Desktop/SignInModal",
  component: SignInModal,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof SignInModal>;

/** Answering a sign-in request, opened on the wizard's first step. */
export const Opened: Story = { render: () => <Trigger /> };
