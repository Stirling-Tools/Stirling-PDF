/**
 * The gate that appears when an anonymous user hits a billable endpoint. It is
 * driven from outside React — the API client dispatches `payg:signupRequired`
 * from an interceptor created at app boot — so it renders nothing until that
 * event arrives.
 *
 * These stories fire the event on mount, which is the only way to see the
 * component at all. The category in the event decides the noun the copy uses.
 */
import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import SignupRequiredBootstrap from "@app/components/SignupRequiredBootstrap";

/** Fires the interceptor's event once mounted, standing in for a 401. */
function Trigger({ category }: { category: string | null }) {
  useEffect(() => {
    const id = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("payg:signupRequired", { detail: { category } }),
      );
    }, 0);
    return () => window.clearTimeout(id);
  }, [category]);
  return <SignupRequiredBootstrap />;
}

const meta: Meta<typeof SignupRequiredBootstrap> = {
  title: "SaaS/SignupRequiredBootstrap",
  component: SignupRequiredBootstrap,
  parameters: { layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof SignupRequiredBootstrap>;

/** No event fired: the component renders nothing, which is its resting state. */
export const Dormant: Story = { render: () => <SignupRequiredBootstrap /> };

/** Gated on an AI feature. */
export const AiGate: Story = { render: () => <Trigger category="AI" /> };

export const AutomationGate: Story = {
  render: () => <Trigger category="AUTOMATION" />,
};

export const ApiGate: Story = { render: () => <Trigger category="API" /> };

/** A category the front end does not recognise falls back to generic copy. */
export const UnknownCategory: Story = {
  render: () => <Trigger category="SOMETHING_NEW" />,
};

/** No category at all, which is the same fallback path. */
export const NoCategory: Story = { render: () => <Trigger category={null} /> };
