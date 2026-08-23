import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import ToastRenderer from "@app/components/toast/ToastRenderer";
import { ToastProvider, useToast } from "@app/components/toast/ToastContext";
import type { ToastOptions } from "@app/components/toast/types";

// ToastRenderer takes no props — it renders whatever is in ToastContext. The
// only way to exercise it is to seed toasts through the same provider/show()
// API the app uses, then let the renderer subscribe to that context.
function SeedToasts({
  toasts,
  children,
}: {
  toasts: ToastOptions[];
  children: React.ReactNode;
}) {
  const { show } = useToast();
  useEffect(() => {
    toasts.forEach((toast) => show(toast));
  }, []);
  return <>{children}</>;
}

const meta = {
  title: "Toast/ToastRenderer",
  component: ToastRenderer,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
} satisfies Meta<typeof ToastRenderer>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  decorators: [
    (Story) => (
      <SeedToasts
        toasts={[
          {
            title: "File saved",
            body: "your-document.pdf was saved successfully.",
            alertType: "success",
          },
          {
            title: "Upload failed",
            body: "Network error while uploading your-document.pdf. Please try again.",
            alertType: "error",
            isPersistentPopup: true,
          },
        ]}
      >
        <Story />
      </SeedToasts>
    ),
  ],
};

export const WithProgress: Story = {
  decorators: [
    (Story) => (
      <SeedToasts
        toasts={[
          {
            title: "Compressing PDF...",
            alertType: "neutral",
            progressBarPercentage: 65,
            isPersistentPopup: true,
          },
        ]}
      >
        <Story />
      </SeedToasts>
    ),
  ],
};

export const WithActionButton: Story = {
  decorators: [
    (Story) => (
      <SeedToasts
        toasts={[
          {
            title: "New version available",
            body: "Reload to get the latest features.",
            alertType: "warning",
            isPersistentPopup: true,
            buttonText: "Reload",
            buttonCallback: () => {},
          },
        ]}
      >
        <Story />
      </SeedToasts>
    ),
  ],
};
