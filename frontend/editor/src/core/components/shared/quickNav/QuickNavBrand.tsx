import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { BrandMark } from "@app/components/shared/BrandMark";
import { useQuickNavHost } from "@app/contexts/QuickNavHostContext";
import { useSecretClicks } from "@app/components/easterEgg/useSecretClicks";

export interface QuickNavBrandProps {
  /** Returns the app you are in to its default state. */
  onReturnHome: () => void;
}

export function QuickNavBrand({ onReturnHome }: QuickNavBrandProps) {
  const { t } = useTranslation();
  const label = t("quickNav.home", "Stirling");
  const host = useQuickNavHost();

  // Nothing happens where the app has not offered the action.
  const flourish = useCallback(
    (originRect: DOMRect) => {
      host?.actions.current?.onBrandFlourish?.(originRect);
    },
    [host],
  );
  const countClick = useSecretClicks(flourish);

  return (
    <div className="quick-nav-brand">
      <button
        type="button"
        className="quick-nav-brand-button"
        aria-label={label}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          // Going home stays the button's only advertised job; the counter
          // rides along and can only fire on the last click of a fast burst.
          onReturnHome();
          countClick(rect);
        }}
      >
        <BrandMark height="1.6rem" />
      </button>
    </div>
  );
}
