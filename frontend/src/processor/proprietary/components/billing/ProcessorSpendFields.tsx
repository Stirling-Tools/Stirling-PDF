import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, NumberInput } from "@app/ui";
import {
  currencySymbol,
  formatMinor,
  formatMoneyMajor,
} from "@app/billing/format";

/** The monthly ceiling is separate from the per-credit rate; null is explicitly uncapped. */
export function ProcessorSpendFields({
  value,
  onChange,
  currency,
  rate,
  disabled = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  currency: string;
  rate: number | null;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | string>(value ?? "");
  return (
    <div className="processor-spend-fields">
      <div className="processor-spend-fields__row">
        <span>{t("portal.billing.simple.credits", "Credits")}</span>
        <strong>
          {rate == null
            ? t("portal.billing.simple.ratePending", "Rate shown at checkout")
            : t(
                "portal.billing.simple.rate",
                "{{rate}} each · billed as used",
                { rate: formatMinor(rate, currency) },
              )}
        </strong>
      </div>
      <div className="processor-spend-fields__row">
        <span>
          {t(
            "portal.billing.simple.limit",
            "Spend limit · processing pauses here",
          )}
        </span>
        <div className="processor-spend-fields__value">
          <strong>
            {value == null
              ? t("payg.cap.noCapLabel", "No cap")
              : t("portal.billing.simple.monthlyAmount", "{{amount}}/mo", {
                  amount: formatMoneyMajor(value, currency),
                })}
          </strong>
          <Button
            variant="quiet"
            disabled={disabled}
            onClick={() => {
              setDraft(value ?? "");
              setEditing(!editing);
            }}
          >
            {t("common.change", "Change")}
          </Button>
        </div>
      </div>
      {editing && (
        <div className="processor-spend-fields__edit">
          <NumberInput
            aria-label={t(
              "portal.billing.checkout.cap.amountAria",
              "Monthly spend limit",
            )}
            value={draft}
            prefix={currencySymbol(currency)}
            hideControls
            clampBehavior="none"
            allowNegative={false}
            decimalScale={2}
            disabled={disabled}
            onChange={(next) => {
              setDraft(next);
              onChange(next === "" ? 0 : Number(next));
            }}
          />
          <Button
            variant="quiet"
            disabled={disabled}
            onClick={() => {
              onChange(null);
              setEditing(false);
            }}
          >
            {t("payg.cap.noCapLabel", "No cap")}
          </Button>
        </div>
      )}
    </div>
  );
}
