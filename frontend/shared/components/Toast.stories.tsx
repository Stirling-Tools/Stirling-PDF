import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToastProvider, useToast } from "@shared/components/Toast";
import { Button } from "@shared/components/Button";

function Trigger() {
  const { toast } = useToast();
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Button
        onClick={() =>
          toast({
            tone: "info",
            title: "Info",
            description: "Just so you know.",
          })
        }
      >
        Info
      </Button>
      <Button
        onClick={() =>
          toast({
            tone: "success",
            title: "Deployed",
            description: "Prior Auth v3.1.0",
          })
        }
      >
        Success
      </Button>
      <Button
        onClick={() =>
          toast({
            tone: "warning",
            title: "Approaching cap",
            description: "389k / 500k",
          })
        }
      >
        Warning
      </Button>
      <Button
        onClick={() =>
          toast({
            tone: "danger",
            title: "Run failed",
            description: "Schema mismatch",
          })
        }
      >
        Danger
      </Button>
    </div>
  );
}

const meta: Meta = {
  title: "Primitives/Toast",
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <ToastProvider>
        <S />
      </ToastProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj;

export const Triggers: Story = { render: () => <Trigger /> };
