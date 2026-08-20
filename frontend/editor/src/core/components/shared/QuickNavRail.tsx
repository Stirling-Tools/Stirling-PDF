import { QuickNavRailContainer } from "@app/components/shared/quickNav/QuickNavRailContainer";
import { useQuickNavSurfaces } from "@app/components/shared/quickNav/useQuickNavSurfaces";
import { useQuickNavTools } from "@app/components/shared/quickNav/useQuickNavTools";

export interface QuickNavRailProps {
  onOpenSettings?: () => void;
}

/**
 * Editor-side quick nav rail. Core ships no processor app, so the first group
 * holds only the editor; builds that bundle the portal (proprietary/saas) shadow
 * this with a version that adds Processor beside it.
 */
export function QuickNavRail({ onOpenSettings }: QuickNavRailProps) {
  const { apps, within } = useQuickNavSurfaces();
  const tools = useQuickNavTools();

  return (
    <QuickNavRailContainer
      groups={[apps, [...within, ...tools]]}
      onOpenSettings={onOpenSettings}
    />
  );
}
