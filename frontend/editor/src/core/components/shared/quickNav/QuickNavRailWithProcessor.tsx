import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useNavigationGuard } from "@app/contexts/NavigationContext";
import { QuickNavRailContainer } from "@app/components/shared/quickNav/QuickNavRailContainer";
import { useQuickNavSurfaces } from "@app/components/shared/quickNav/useQuickNavSurfaces";
import { useQuickNavTools } from "@app/components/shared/quickNav/useQuickNavTools";
import { BrandMark } from "@app/components/shared/BrandMark";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { markAppSwap } from "@app/utils/appSwap";

export interface QuickNavRailWithProcessorProps {
  /**
   * Whether this user may open the processor. Supplied by the build variant,
   * which is the only thing that differs between them: self-hosted reads the
   * Spring session's flag, SaaS resolves it from the subscription.
   */
  portalAccess: boolean;
  onOpenSettings?: () => void;
}

/**
 * The editor's rail for builds that ship the processor: Editor and Processor
 * side by side in the first group.
 *
 * Shared rather than written per variant so the two builds that have a processor
 * can't drift on how switching to it behaves.
 *
 * Rendered disabled rather than hidden when access is missing. That matches the
 * product's own default for unavailable things, it makes the processor
 * discoverable to someone who should ask for access, and - because the access
 * flag starts false and flips once the session resolves - it stops the icon
 * appearing a beat after first paint and shifting everything below it. This is
 * why the rail can't use useOtherAppSwitch(), which returns null for no access
 * and so cannot express "present but unavailable".
 */
export function QuickNavRailWithProcessor({
  portalAccess,
  onOpenSettings,
}: QuickNavRailWithProcessorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { requestNavigation } = useNavigationGuard();
  const { apps, within } = useQuickNavSurfaces();
  const tools = useQuickNavTools();

  const processor = {
    id: "processor",
    label: t("quickNav.processor", "Processor"),
    // The Stirling mark, not a feature glyph: this entry switches apps, and the
    // branding is what says "another Stirling app" rather than "a tool in this
    // one". Keeps its brand colours - the rail's currentColor sizing applies, but
    // BrandMark fills its own paths.
    icon: <BrandMark height="1.125rem" />,
    kind: "destination" as const,
    disabled: !portalAccess,
    reason: !portalAccess
      ? t("quickNav.noProcessorAccess", "Ask an admin for processor access")
      : undefined,
    // Through the guard: leaving for the processor is a route change out of the
    // editor, and without it an in-progress redaction or annotation is dropped
    // with no prompt.
    onClick: () =>
      requestNavigation(() => {
        markAppSwap();
        navigate(PORTAL_BASENAME);
      }),
  };

  return (
    <QuickNavRailContainer
      // Spread rather than pushed: appending to the array useQuickNavSurfaces
      // returned is only safe while that hook allocates a fresh one every render,
      // and memoizing it later would start duplicating this entry.
      groups={[
        [...apps, processor],
        [...within, ...tools],
      ]}
      currentApp="editor"
      onOpenSettings={onOpenSettings}
      // Deep link rather than a modal call: /settings/<key> is how the editor
      // opens its config modal at a section, and the modal reads the key back
      // out of the URL.
      onOpenTeams={() => navigate("/settings/teams")}
      // The same gate as the processor entry above, from the same flag.
      notifications={{
        disabled: !portalAccess,
        reason: !portalAccess
          ? t("quickNav.noProcessorAccess", "Ask an admin for processor access")
          : undefined,
      }}
    />
  );
}
