import { useNavigate } from "react-router-dom";
import { useMantineColorScheme } from "@mantine/core";
import { useAuth } from "@app/auth/context";
import { AppSwitch } from "@app/components/shared/AppSwitch";
import { PORTAL_BASENAME } from "@portal/contexts/ViewContext";

/**
 * Sidebar app switcher between the editor and the admin portal. Both are
 * route-sets of one SPA (the portal mounts at PORTAL_BASENAME), so switching
 * is a client-side navigation. Hidden for users without portal access — they
 * have nowhere to switch to. Renders the same AppSwitch element as the
 * portal's sidebar.
 */
export function AppSwitcher() {
  const { portalAccess } = useAuth();
  const navigate = useNavigate();
  const { colorScheme } = useMantineColorScheme();

  if (!portalAccess) return null;

  return (
    <AppSwitch
      current="editor"
      theme={colorScheme === "dark" ? "dark" : "light"}
      onSwitch={() => navigate(PORTAL_BASENAME)}
    />
  );
}
