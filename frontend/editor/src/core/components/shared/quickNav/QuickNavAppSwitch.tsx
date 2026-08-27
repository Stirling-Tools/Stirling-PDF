import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import { BrandMark } from "@app/components/shared/BrandMark";
import { BrandTile } from "@app/components/shared/BrandTile";

export type QuickNavApp = "editor" | "processor";

export interface QuickNavAppSwitchProps {
  /** The app you are in. Its mark occupies the brand slot. */
  currentApp: QuickNavApp;
  /** Omitted in builds with only one app; then nothing is drawn below the brand. */
  otherApp?: {
    disabled?: boolean;
    reason?: string;
    onOpen: () => void;
  };
  /** Returns the current app to its default view. */
  onReturnHome: () => void;
}

const LABEL_KEY: Record<QuickNavApp, [string, string]> = {
  editor: ["quickNav.editor", "Editor"],
  processor: ["quickNav.processor", "Processor"],
};

/**
 * The brand mark and the app switcher, as one piece.
 *
 * Both marks are always mounted here, in one positioned block, and the current
 * app is simply the one sitting in the upper slot at brand size. Switching moves
 * them past each other with a CSS transition.
 *
 * They have to share a container for that: an element cannot transition from one
 * parent to another, so drawing the brand and the switcher separately would mean
 * swapping their contents instead of moving them - which is what the earlier
 * arrival keyframes were working around. This only became possible once the rail
 * stopped being torn down on every switch (see AppFrame).
 */
export function QuickNavAppSwitch({
  currentApp,
  otherApp,
  onReturnHome,
}: QuickNavAppSwitchProps) {
  const { t } = useTranslation();

  const mark = (app: QuickNavApp) => {
    const isCurrent = app === currentApp;
    const [key, fallback] = LABEL_KEY[app];
    const label = t(key, fallback);
    const disabled = !isCurrent && otherApp?.disabled;
    const tooltip =
      disabled && otherApp?.reason ? `${label} — ${otherApp.reason}` : label;

    return (
      <Tooltip content={tooltip} position="right" arrow>
        <button
          type="button"
          className="quick-nav-app-mark"
          data-app={app}
          data-slot={isCurrent ? "brand" : "switch"}
          // The current app is where you are, not somewhere to go; it still
          // clicks, as the way back to that app's default view.
          aria-current={isCurrent ? "true" : undefined}
          aria-label={label}
          aria-disabled={disabled || undefined}
          onClick={
            disabled
              ? undefined
              : isCurrent
                ? onReturnHome
                : () => otherApp?.onOpen()
          }
        >
          {app === "processor" ? (
            <BrandMark height="1.6rem" />
          ) : (
            <BrandTile size="1.6rem" />
          )}
        </button>
      </Tooltip>
    );
  };

  const hasBoth = Boolean(otherApp) || currentApp === "processor";

  return (
    <div className="quick-nav-apps" data-current={currentApp}>
      {mark("editor")}
      {hasBoth ? mark("processor") : null}
      {/* Divides the apps from the destinations inside them. Belongs to this
          block rather than the groups below, because the switcher is no longer
          one of them - it sits up here with the brand. */}
      {hasBoth && <hr className="quick-nav-apps-divider" />}
    </div>
  );
}
