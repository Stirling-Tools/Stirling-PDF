import { useEffect, type ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import NavigationWarningModal from "@app/components/shared/NavigationWarningModal";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import {
  NavigationProvider,
  useNavigationGuard,
  type NavigationWarningHandlers,
} from "@app/contexts/NavigationContext";

/**
 * The modal renders nothing until NavigationContext has unsaved changes AND a
 * pending navigation to warn about, so this drives both into place on mount —
 * mirroring what a real editor does when it calls requestNavigation() while
 * hasUnsavedChanges is true. It also registers any warning handlers the story
 * supplies, since the modal only shows the "Apply & Leave"/"Export & Leave"
 * buttons when a handler for them is present.
 */
function TriggerWarning({
  children,
  handlers,
}: {
  children: React.ReactNode;
  handlers?: NavigationWarningHandlers;
}) {
  const {
    hasUnsavedChanges,
    setHasUnsavedChanges,
    requestNavigation,
    registerNavigationWarningHandlers,
  } = useNavigationGuard();

  useEffect(() => {
    setHasUnsavedChanges(true);
  }, [setHasUnsavedChanges]);

  useEffect(() => {
    if (handlers) {
      registerNavigationWarningHandlers(handlers);
    }
  }, [handlers, registerNavigationWarningHandlers]);

  useEffect(() => {
    if (hasUnsavedChanges) {
      requestNavigation(() => {});
    }
  }, [hasUnsavedChanges, requestNavigation]);

  return <>{children}</>;
}

function withProviders(
  Story: () => ReactElement,
  context: { parameters: { navigationHandlers?: NavigationWarningHandlers } },
) {
  return (
    <ToolRegistryProvider>
      <NavigationProvider>
        <TriggerWarning handlers={context.parameters.navigationHandlers}>
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

/**
 * When the active tool registers an "apply and continue" handler (e.g. a
 * pending edit that can be committed before leaving), the modal adds a third
 * action alongside "Keep Working" and "Discard Changes".
 */
export const WithApplyAndContinue: Story = {
  parameters: {
    navigationHandlers: {
      onApplyAndContinue: async () => {},
    } satisfies NavigationWarningHandlers,
  },
};

/**
 * When the active tool registers an "export and continue" handler (e.g. a
 * conversion tool that can export its result before leaving), the modal adds
 * an "Export & Leave" action instead.
 */
export const WithExportAndContinue: Story = {
  parameters: {
    navigationHandlers: {
      onExportAndContinue: async () => {},
    } satisfies NavigationWarningHandlers,
  },
};
