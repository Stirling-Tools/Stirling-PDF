/**
 * Reusable monthly spend-cap control.
 *
 * One inline row — preset chips, a custom-entry pill that matches the presets,
 * a "No cap" chip, and (optionally) a Save button — over a live "≈ N PDFs /
 * month" estimate. Extracted from the subscribed plan-page cap editor so the
 * exact same control drives the upgrade checkout flow.
 *
 * <h2>Currency-agnostic by design</h2>
 *
 * The control never decides a currency. It takes {@code pricePerDocMinor} +
 * {@code currency} and renders whatever it's handed: the subscribed plan page
 * passes the team's real Stripe-subscription rate/currency; the unsubscribed
 * checkout flow passes a USD rate (Stripe hasn't assigned the team a currency
 * yet) plus a {@code note} explaining the cap is editable later. When no rate
 * is supplied the estimate simply hides.
 *
 * <h2>Controlled</h2>
 *
 * Fully controlled via {@code capUsd} ({@code null} = no cap, {@code 0} = a
 * real $0 cap that keeps everything free) + {@code onChange}. The parent owns
 * the working value. When {@code onSave} is provided the control renders the
 * inline Save button and computes "dirty" against {@code savedCapUsd}.
 */
import React, { useState } from "react";
import { Button } from "@mantine/core";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import LocalIcon from "@app/components/shared/LocalIcon";
import { useTranslation } from "react-i18next";
// eslint-disable-next-line no-restricted-imports
import "./SpendCapControl.css";

// Quick amounts offered everywhere — recognition over recall.
export const DEFAULT_CAP_PRESETS = [500, 1000, 2500, 5000] as const;

export interface SpendCapControlProps {
  /** Current cap in major currency units; {@code null} = no cap. Controlled. */
  capUsd: number | null;
  /** Working-value setter. {@code null} signals no-cap. */
  onChange: (capUsd: number | null) => void;
  /** Per-document rate in minor units; null/0 hides the estimate. May be fractional. */
  pricePerDocMinor?: number | null;
  /** Lower-case ISO currency of the rate; pairs with {@link #pricePerDocMinor}. */
  currency?: string | null;
  /** Quick-amount presets (major units). Defaults to {@link DEFAULT_CAP_PRESETS}. */
  presets?: readonly number[];
  /**
   * When provided, the control renders an inline Save button. Receives whole
   * major units, or {@code null} for no-cap.
   */
  onSave?: (capUsd: number | null) => Promise<void> | void;
  /** Label for the Save button. */
  saveLabel?: string;
  /**
   * The persisted value to diff against for the dirty check. Same encoding as
   * {@link #capUsd} ({@code null} = persisted no-cap). Only used with
   * {@link #onSave}.
   */
  savedCapUsd?: number | null;
  /** Quiet helper line under the estimate (e.g. the USD / editable-later note). */
  note?: React.ReactNode;
}

/** Format minor units of an ISO currency ("$2.24", "£0.40"). */
function formatMinor(
  minor: number,
  currency: string | null | undefined,
): string {
  const code = (currency ?? "usd").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      // Per-doc rates are often sub-cent (e.g. $0.02 → 2 minor, but a half-cent
      // rate is 0.5). Allow up to 3 fraction digits so they don't round to $0.
      maximumFractionDigits: 3,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${code}`;
  }
}

/** Currency symbol for compact inline use; falls back to the ISO code. */
function currencySymbol(currency: string | null | undefined): string {
  switch ((currency ?? "").toLowerCase()) {
    case "usd":
    case "":
      return "$";
    case "eur":
      return "€";
    case "gbp":
      return "£";
    default:
      return currency!.toUpperCase() + " ";
  }
}

const SpendCapControl: React.FC<SpendCapControlProps> = ({
  capUsd,
  onChange,
  pricePerDocMinor,
  currency,
  presets = DEFAULT_CAP_PRESETS,
  onSave,
  saveLabel,
  savedCapUsd,
  note,
}) => {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const sym = currencySymbol(currency);
  const isNoCap = capUsd === null;
  const presetSelected = capUsd != null && presets.includes(capUsd);
  // Custom is "active" when a cap is set that isn't one of the presets — i.e.
  // the value came from the custom pill.
  const customActive = capUsd != null && !presets.includes(capUsd);

  // Local mirror of the custom field's text so partial/empty entry doesn't get
  // clobbered by the controlled value. Seeded from a non-preset incoming cap.
  const [customText, setCustomText] = useState<string>(
    customActive ? String(capUsd) : "",
  );

  // Mirror of the backend's docCapForMoney: floor(capMinor / rate). The
  // one-time free grant is a separate lifetime pool and is NOT added here —
  // this is the paid PDFs the monthly cap buys.
  const rate =
    pricePerDocMinor != null && pricePerDocMinor > 0 ? pricePerDocMinor : null;
  const previewDocs =
    capUsd != null && rate != null ? Math.floor((capUsd * 100) / rate) : null;

  const dirty = onSave != null && capUsd !== (savedCapUsd ?? null);

  const selectPreset = (preset: number) => {
    setCustomText("");
    onChange(preset);
  };
  const selectNoCap = () => {
    setCustomText("");
    onChange(null);
  };
  const onCustomInput = (raw: string) => {
    // Digits only; an empty field reads as "no custom value yet" → 0 so the
    // estimate still renders sensibly without flipping to no-cap.
    const cleaned = raw.replace(/[^0-9]/g, "");
    setCustomText(cleaned);
    const v = cleaned === "" ? 0 : parseInt(cleaned, 10);
    onChange(Number.isNaN(v) ? 0 : v);
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(isNoCap ? null : Math.round(capUsd ?? 0));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="scc">
      <div className="scc-row">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            className="scc-chip"
            data-selected={presetSelected && capUsd === preset}
            onClick={() => selectPreset(preset)}
          >
            {sym}
            {preset.toLocaleString()}
          </button>
        ))}

        {/* Custom-entry pill — dashed until it carries a value, then it fills
            like a selected chip. */}
        <label className="scc-custom" data-active={customActive}>
          <span className="scc-custom__symbol">{sym}</span>
          <input
            className="scc-custom__input"
            inputMode="numeric"
            value={customActive ? customText : ""}
            placeholder={t("payg.cap.custom", "Custom")}
            aria-label={t("payg.cap.amount", "Cap amount")}
            onChange={(e) => onCustomInput(e.target.value)}
          />
        </label>

        <button
          type="button"
          className={`scc-chip${onSave ? "" : " scc-row__spacer"}`}
          data-selected={isNoCap}
          onClick={selectNoCap}
        >
          {t("payg.cap.noCapLabel", "No cap")}
        </button>

        {onSave && (
          <Button
            variant="default"
            size="xs"
            className="scc-row__spacer"
            disabled={!dirty || saving}
            loading={saving}
            leftSection={<LocalIcon icon="check-rounded" />}
            onClick={handleSave}
          >
            {saveLabel ?? t("payg.cap.save", "Update cap")}
          </Button>
        )}
      </div>

      {previewDocs != null && (
        <div className="scc-estimate">
          <DescriptionIcon
            className="scc-estimate__icon"
            sx={{ fontSize: 22 }}
          />
          <div>
            <div className="scc-estimate__main">
              {t("payg.cap.docsEstimate", "≈ {{docs}} processed PDFs / month", {
                docs: previewDocs.toLocaleString(),
              })}
            </div>
            <div className="scc-estimate__sub">
              {t("payg.cap.docsRate", "at {{rate}} / PDF", {
                rate: formatMinor(pricePerDocMinor ?? 0, currency),
              })}
            </div>
          </div>
        </div>
      )}

      {isNoCap && (
        <div className="scc-note">
          {t(
            "payg.cap.noCapDesc",
            "Usage is billed without an upper limit. You can re-enable a cap at any time.",
          )}
        </div>
      )}

      {note && <div className="scc-note">{note}</div>}
    </div>
  );
};

export default SpendCapControl;
