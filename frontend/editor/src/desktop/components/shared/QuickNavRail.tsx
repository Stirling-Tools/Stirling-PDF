import { useNavigate } from "react-router-dom";
import type { QuickNavRailProps } from "@core/components/shared/QuickNavRail";
import { QuickNavRailContainer } from "@app/components/shared/quickNav/QuickNavRailContainer";
import { useQuickNavSurfaces } from "@app/components/shared/quickNav/useQuickNavSurfaces";
import { useQuickNavTools } from "@app/components/shared/quickNav/useQuickNavTools";

/**
 * Desktop inherits proprietary but ships no portal (see
 * desktop/routes/adminRouteExtensions), so there is no Processor to switch to -
 * shadow the rail back to the editor alone, same as core.
 */
export function QuickNavRail({ onOpenSettings }: QuickNavRailProps) {
  const navigate = useNavigate();
  const { apps, within } = useQuickNavSurfaces();
  const tools = useQuickNavTools();

  return (
    <QuickNavRailContainer
      groups={[apps, [...within, ...tools]]}
      onOpenSettings={onOpenSettings}
      // Deep link rather than a modal call: /settings/<key> is how the editor
      // opens its config modal at a section, and the modal reads the key back
      // out of the URL.
      onOpenTeams={() => navigate("/settings/teams")}
    />
  );
}
