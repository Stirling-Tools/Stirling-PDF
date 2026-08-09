import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppSwitcher } from "@app/components/shared/AppSwitcher";
import { AuthContext } from "@app/auth/context";
import type { AuthContextValue } from "@app/auth/types";

/**
 * The sidebar brand header on builds that bundle the admin portal. It reads a
 * single field of the auth state — `portalAccess` — and that is the whole
 * decision: users who may reach the portal get the brand switcher (clicking it
 * navigates to the processor), everyone else gets the plain logo, exactly as
 * core renders it.
 *
 * The rail also collapses, which swaps the wordmark for the icon-only mark, so
 * both widths are worth seeing on the switcher variant.
 */

/** Only `portalAccess` is read; the rest is inert filler for the context shape. */
function authWith(portalAccess: boolean): AuthContextValue {
  return {
    session: null,
    user: null,
    displayName: "Ada Lovelace",
    isAnonymous: false,
    isAdmin: portalAccess,
    portalAccess,
    role: portalAccess ? "ROLE_ADMIN" : "ROLE_USER",
    loading: false,
    error: null,
    signOut: async () => {},
    refreshSession: async () => {},
  };
}

const meta: Meta<typeof AppSwitcher> = {
  // Distinct from core's "Shared/AppSwitcher": that file covers the logo-only
  // component this one shadows.
  title: "Shared/AppSwitcher (portal build)",
  component: AppSwitcher,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof AppSwitcher>;

/** No portal access — indistinguishable from core's plain logo header. */
export const WithoutPortalAccess: Story = {
  decorators: [
    (S) => (
      <AuthContext.Provider value={authWith(false)}>
        <S />
      </AuthContext.Provider>
    ),
  ],
};

/** Portal access — the logo becomes the editor⇄processor switcher. */
export const WithPortalAccess: Story = {
  decorators: [
    (S) => (
      <AuthContext.Provider value={authWith(true)}>
        <S />
      </AuthContext.Provider>
    ),
  ],
};

/** The switcher on a collapsed rail: icon-only mark, no wordmark. */
export const CollapsedWithPortalAccess: Story = {
  args: { collapsed: true },
  decorators: [
    (S) => (
      <AuthContext.Provider value={authWith(true)}>
        <S />
      </AuthContext.Provider>
    ),
  ],
};
