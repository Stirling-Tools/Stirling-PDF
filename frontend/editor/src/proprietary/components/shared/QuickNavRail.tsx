import { useAuth } from "@app/auth/context";
import { QuickNavRailWithProcessor } from "@app/components/shared/quickNav/QuickNavRailWithProcessor";
import type { QuickNavRailProps } from "@core/components/shared/QuickNavRail";

/**
 * Editor-side quick nav rail, self-hosted: the Spring session carries
 * portalAccess, which is the same signal the BrandSwitcher's editor⇄processor
 * dropdown gates on.
 */
export function QuickNavRail({ onOpenSettings }: QuickNavRailProps) {
  const { portalAccess } = useAuth();

  return (
    <QuickNavRailWithProcessor
      portalAccess={Boolean(portalAccess)}
      onOpenSettings={onOpenSettings}
    />
  );
}
