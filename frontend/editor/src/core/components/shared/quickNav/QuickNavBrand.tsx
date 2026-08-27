import { useTranslation } from "react-i18next";
import { Tooltip } from "@app/components/shared/Tooltip";
import { BrandMark } from "@app/components/shared/BrandMark";

export interface QuickNavBrandProps {
  /** Returns the app you are in to its default state. */
  onReturnHome: () => void;
}

/** Pinned at the top of the rail. */
export function QuickNavBrand({ onReturnHome }: QuickNavBrandProps) {
  const { t } = useTranslation();
  const label = t("quickNav.home", "Stirling");

  return (
    <div className="quick-nav-brand">
      <Tooltip content={label} position="right" arrow>
        <button
          type="button"
          className="quick-nav-brand-button"
          aria-label={label}
          onClick={onReturnHome}
        >
          <BrandMark height="1.6rem" />
        </button>
      </Tooltip>
    </div>
  );
}
