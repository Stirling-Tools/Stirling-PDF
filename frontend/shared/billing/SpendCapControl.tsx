import React, { useEffect, useState } from "react";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import { Button } from "@shared/components";
import {
  DEFAULT_CAP_PRESETS,
  currencySymbol,
  docCapForMoney,
  formatMinor,
} from "@shared/billing/format";

/** Copy the control renders. The editor passes i18n strings; the portal uses the defaults. */
export interface SpendCapControlLabels {
  custom: string;
  amountAria: string;
  noCap: string;
  save: string;
  docsEstimate: (docs: string) => string;
  docsRate: (rate: string) => string;
  noCapDesc: string;
}

const DEFAULT_LABELS: SpendCapControlLabels = {
  custom: "Custom",
  amountAria: "Cap amount",
  noCap: "No cap",
  save: "Update cap",
  docsEstimate: (docs) => `≈ ${docs} processed PDFs / month`,
  docsRate: (rate) => `at ${rate} / PDF`,
  noCapDesc:
    "Usage is billed without an upper limit. You can re-enable a cap at any time.",
};

export interface SpendCapControlProps {
  /** Current cap in major currency units; null = no cap, 0 = a real $0 cap. Controlled. */
  capUsd: number | null;
  onChange: (capUsd: number | null) => void;
  /** Per-document rate in minor units; null/0 hides the estimate. */
  pricePerDocMinor?: number | null;
  currency?: string | null;
  presets?: readonly number[];
  /** When provided, renders the inline Save button. */
  onSave?: (capUsd: number | null) => Promise<void> | void;
  /** Persisted value to diff against for the dirty check (with {@link onSave}). */
  savedCapUsd?: number | null;
  /** Disable all inputs (e.g. while a parent operation is in flight). */
  disabled?: boolean;
  /** Quiet helper line under the estimate. */
  note?: React.ReactNode;
  labels?: Partial<SpendCapControlLabels>;
}

/**
 * Monthly spend-cap control shared by the editor cloud surface and the admin
 * portal: preset chips, a custom-entry pill, a no-cap chip, an optional Save
 * button, and a live cap→PDF estimate. Fully controlled (capUsd + onChange).
 * Styling comes from each app's own {@code scc-*} CSS; copy is injected via
 * {@link labels} so this carries no i18n dependency.
 */
export function SpendCapControl({
  capUsd,
  onChange,
  pricePerDocMinor,
  currency,
  presets = DEFAULT_CAP_PRESETS,
  onSave,
  savedCapUsd,
  disabled,
  note,
  labels,
}: SpendCapControlProps) {
  const L = { ...DEFAULT_LABELS, ...labels };
  const [saving, setSaving] = useState(false);

  const sym = currencySymbol(currency);
  const isNoCap = capUsd === null;
  const customActive = capUsd != null && !presets.includes(capUsd);
  // Local mirror of the custom field's text so partial entry isn't clobbered by
  // the controlled value. Parents that need it to resync (e.g. after a save)
  // remount the control via a key.
  const [customText, setCustomText] = useState<string>(
    customActive ? String(capUsd) : "",
  );
  // Resync the field to an externally-loaded custom cap — e.g. the wallet arrives
  // after first render (capUsd null/preset -> 1234), which would otherwise leave the
  // field blank since customText only seeds once at mount. Gated on !focused so it
  // never clobbers what the user is actively typing.
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused && customActive && String(capUsd) !== customText) {
      setCustomText(String(capUsd));
    }
  }, [capUsd, customActive, focused, customText]);
  const previewDocs = docCapForMoney(capUsd, pricePerDocMinor);
  const dirty = onSave != null && capUsd !== (savedCapUsd ?? null);
  const busy = saving || disabled;

  const selectPreset = (preset: number) => {
    setCustomText("");
    onChange(preset);
  };
  const selectNoCap = () => {
    setCustomText("");
    onChange(null);
  };
  const onCustomInput = (raw: string) => {
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
            data-selected={capUsd === preset ? "true" : "false"}
            onClick={() => selectPreset(preset)}
            disabled={busy}
          >
            {sym}
            {preset.toLocaleString()}
          </button>
        ))}

        <label
          className="scc-custom"
          data-active={customActive ? "true" : "false"}
        >
          <span className="scc-custom__symbol">{sym}</span>
          <input
            className="scc-custom__input"
            inputMode="numeric"
            value={customActive ? customText : ""}
            placeholder={L.custom}
            aria-label={L.amountAria}
            onChange={(e) => onCustomInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={busy}
          />
        </label>

        <button
          type="button"
          className={`scc-chip${onSave ? "" : " scc-row__spacer"}`}
          data-selected={isNoCap ? "true" : "false"}
          onClick={selectNoCap}
          disabled={busy}
        >
          {L.noCap}
        </button>

        {onSave && (
          <div className="scc-row__spacer">
            <Button
              variant="outline"
              size="sm"
              loading={saving}
              disabled={!dirty || busy}
              onClick={handleSave}
            >
              {L.save}
            </Button>
          </div>
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
              {L.docsEstimate(previewDocs.toLocaleString())}
            </div>
            <div className="scc-estimate__sub">
              {L.docsRate(formatMinor(pricePerDocMinor ?? 0, currency))}
            </div>
          </div>
        </div>
      )}

      {isNoCap && <div className="scc-note">{L.noCapDesc}</div>}
      {note && <div className="scc-note">{note}</div>}
    </div>
  );
}
