import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppProviders } from "@app/components/AppProviders";
import {
  DocumentPermissionsAPIBridge,
  PdfPermissionFlag,
} from "@app/components/viewer/DocumentPermissionsAPIBridge";

// Registers document permission state onto ViewerContext (via registerBridge)
// and renders nothing itself — only exists inside the full app provider tree,
// so pull that in rather than stubbing ViewerContext directly.
// Mirrors AppProviders.stories.tsx's args for skipping the AppConfig network
// fetch and its blocking-loading gate.
const meta = {
  title: "Viewer/DocumentPermissionsAPIBridge",
  component: DocumentPermissionsAPIBridge,
  decorators: [
    (Story) => (
      <AppProviders
        appConfigProviderProps={{
          initialConfig: {},
          bootstrapMode: "non-blocking",
          autoFetch: false,
        }}
      >
        <Story />
      </AppProviders>
    ),
  ],
} satisfies Meta<typeof DocumentPermissionsAPIBridge>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Unencrypted document — every permission is implicitly allowed. */
export const Default: Story = {
  args: {
    isEncrypted: false,
    isOwnerUnlocked: false,
    permissions: PdfPermissionFlag.AllowAll,
  },
};

/** Encrypted document restricted to printing only (no copy/edit/annotate). */
export const EncryptedRestricted: Story = {
  args: {
    isEncrypted: true,
    isOwnerUnlocked: false,
    permissions: PdfPermissionFlag.Print,
  },
};

/** Encrypted document unlocked with the owner password — all permissions apply regardless of the flag bits. */
export const EncryptedOwnerUnlocked: Story = {
  args: {
    isEncrypted: true,
    isOwnerUnlocked: true,
    permissions: PdfPermissionFlag.Print,
  },
};
