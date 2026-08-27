import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import { BrandMark } from "@app/components/shared/BrandMark";
import { BrandTile } from "@app/components/shared/BrandTile";

export type QuickNavApp = "editor" | "processor";

export interface QuickNavAppSwitchProps {
  currentApp: QuickNavApp;
  /** Omitted in builds with only one app. */
  otherApp?: {
    disabled?: boolean;
    reason?: string;
    onOpen: () => void;
  };
  onReturnHome: () => void;
}

const LABEL_KEY: Record<QuickNavApp, [string, string]> = {
  editor: ["quickNav.editor", "Editor"],
  processor: ["quickNav.processor", "Processor"],
};

/**
 * Both marks stay mounted in one positioned block and swap slots, because an element
 * can't transition between parents - drawn separately their contents would swap
 * rather than move.
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
          // Still clickable: the way back to that app's default view.
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
      {/* Apps above, the places inside them below. */}
      {hasBoth && <hr className="quick-nav-apps-divider" />}
    </div>
  );
}
