/**
 * Editor cloud adapter over the shared {@code @shared/billing} spend-cap control:
 * supplies the i18n copy (the shared control is copy-agnostic) and the editor's
 * {@code scc-*} styling. The public API (controlled {@code capUsd}/{@code
 * onChange}, optional {@code onSave}/{@code saveLabel}, {@code note}) is
 * unchanged, so the plan-page cap editor and the upgrade-checkout flow keep
 * consuming it as before.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_CAP_PRESETS,
  SpendCapControl as SharedSpendCapControl,
} from "@shared/billing";
// eslint-disable-next-line no-restricted-imports
import "./SpendCapControl.css";

export { DEFAULT_CAP_PRESETS };

export interface SpendCapControlProps {
  capUsd: number | null;
  onChange: (capUsd: number | null) => void;
  pricePerDocMinor?: number | null;
  currency?: string | null;
  presets?: readonly number[];
  onSave?: (capUsd: number | null) => Promise<void> | void;
  saveLabel?: string;
  savedCapUsd?: number | null;
  note?: React.ReactNode;
}

const SpendCapControl: React.FC<SpendCapControlProps> = ({
  saveLabel,
  ...rest
}) => {
  const { t } = useTranslation();
  return (
    <SharedSpendCapControl
      {...rest}
      labels={{
        custom: t("payg.cap.custom", "Custom"),
        amountAria: t("payg.cap.amount", "Cap amount"),
        noCap: t("payg.cap.noCapLabel", "No cap"),
        save: saveLabel ?? t("payg.cap.save", "Update cap"),
        docsEstimate: (docs) =>
          t("payg.cap.docsEstimate", "≈ {{docs}} processed PDFs / month", {
            docs,
          }),
        docsRate: (rate) =>
          t("payg.cap.docsRate", "at {{rate}} / PDF", { rate }),
        noCapDesc: t(
          "payg.cap.noCapDesc",
          "Usage is billed without an upper limit. You can re-enable a cap at any time.",
        ),
      }}
    />
  );
};

export default SpendCapControl;
