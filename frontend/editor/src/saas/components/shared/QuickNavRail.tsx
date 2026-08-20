import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { usePortalAccess } from "@app/hooks/usePortalAccess";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { QuickNavRailContainer } from "@app/components/shared/quickNav/QuickNavRailContainer";
import { useQuickNavSurfaces } from "@app/components/shared/quickNav/useQuickNavSurfaces";
import { useQuickNavTools } from "@app/components/shared/quickNav/useQuickNavTools";
import { BrandMark } from "@app/components/shared/BrandMark";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import type { QuickNavRailProps } from "@core/components/shared/QuickNavRail";

/**
 * Editor-side quick nav rail, SaaS variant: puts Processor beside Editor
 * in the first group, gated on the same portal-access signal the BrandSwitcher's
 * editor⇄processor dropdown uses (see AppSwitcher.tsx).
 *
 * Rendered disabled rather than hidden when access is missing. That matches the
 * product's own default for unavailable things, it makes the processor
 * discoverable to someone who should ask for access, and - because portalAccess
 * starts false and flips once /me resolves - it stops the icon appearing a beat
 * after first paint and shifting everything below it.
 */
export function QuickNavRail({ onOpenSettings }: QuickNavRailProps) {
  const { t } = useTranslation();
  const portalAccess = usePortalAccess();
  const navigate = useNavigate();
  const { requestNavigation } = useNavigationGuard();
  const { apps, within } = useQuickNavSurfaces();
  const tools = useQuickNavTools();

  apps.push({
    id: "processor",
    label: t("quickNav.processor", "Processor"),
    // The Stirling mark, not a feature glyph: this entry switches apps, and the
    // branding is what says "another Stirling app" rather than "a tool in this
    // one". Keeps its brand colours - the rail's currentColor sizing applies, but
    // BrandMark fills its own paths.
    icon: <BrandMark height="1.125rem" />,
    kind: "destination",
    disabled: !portalAccess,
    reason: !portalAccess
      ? t("quickNav.noProcessorAccess", "Ask an admin for processor access")
      : undefined,
    // Through the guard: leaving for the processor is a route change out of the
    // editor, and without it an in-progress redaction or annotation is dropped
    // with no prompt.
    onClick: () => requestNavigation(() => navigate(PORTAL_BASENAME)),
  });

  return (
    <QuickNavRailContainer
      groups={[apps, [...within, ...tools]]}
      onOpenSettings={onOpenSettings}
    />
  );
}
