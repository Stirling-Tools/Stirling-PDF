import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import NavigationWarningModal from "@app/components/shared/NavigationWarningModal";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import {
  NavigationProvider,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";

/**
 * The modal renders nothing until NavigationContext has unsaved changes AND a
 * pending navigation to warn about, so this drives both into place on mount —
 * mirroring what a real editor does when it calls requestNavigation() while
 * hasUnsavedChanges is true.
 */
function TriggerWarning({ children }: { children: React.ReactNode }) {
  const { hasUnsavedChanges, setHasUnsavedChanges, requestNavigation } =
    useNavigationGuard();

  useEffect(() => {
    setHasUnsavedChanges(true);
  }, [setHasUnsavedChanges]);

  useEffect(() => {
    if (hasUnsavedChanges) {
      requestNavigation(() => {});
    }
  }, [hasUnsavedChanges, requestNavigation]);

  return <>{children}</>;
}

function withProviders(Story: () => JSX.Element) {
  return (
    <ToolRegistryProvider>
      <NavigationProvider>
        <TriggerWarning>
          <Story />
        </TriggerWarning>
      </NavigationProvider>
    </ToolRegistryProvider>
  );
}

const meta = {
  title: "Shared/NavigationWarningModal",
  component: NavigationWarningModal,
  decorators: [withProviders],
} satisfies Meta<typeof NavigationWarningModal>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Unsaved changes plus a pending navigation trigger the confirmation dialog. */
export const Default: Story = {};
