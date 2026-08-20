import { usePortalAccess } from "@app/hooks/usePortalAccess";
import { QuickNavRailWithProcessor } from "@app/components/shared/quickNav/QuickNavRailWithProcessor";
import type { QuickNavRailProps } from "@core/components/shared/QuickNavRail";

/**
 * Editor-side quick nav rail, SaaS: processor access is resolved from the
 * subscription rather than a session flag, which is the only way this differs
 * from the self-hosted rail.
 */
export function QuickNavRail({ onOpenSettings }: QuickNavRailProps) {
  const portalAccess = usePortalAccess();

  return (
    <QuickNavRailWithProcessor
      portalAccess={Boolean(portalAccess)}
      onOpenSettings={onOpenSettings}
    />
  );
}
