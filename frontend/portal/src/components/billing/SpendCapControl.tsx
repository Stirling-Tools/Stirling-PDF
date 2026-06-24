import { useEffect, useState } from "react";
import { Banner, Button, Card } from "@shared/components";
import DescriptionIcon from "@mui/icons-material/DescriptionOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineRounded";
import ExpandMoreIcon from "@mui/icons-material/ExpandMoreRounded";
import CheckIcon from "@mui/icons-material/CheckRounded";
import LockIcon from "@mui/icons-material/LockOutlined";
import type { Wallet } from "@portal/api/billing";
import { updateCap } from "@portal/api/billing";

/**
 * Monthly spend-cap editor — ported from the SaaS cloud `SpendCapControl`
 * (editor/src/cloud/.../SpendCapControl.tsx). Same UX:
 *
 *   preset chips · custom-entry pill · no-cap chip · Update cap button
 *   ── live "≈ N processed PDFs / month at $X / PDF" estimate ──
 *
 * Wired to the real PATCH /api/v1/payg/cap endpoint via {@code updateCap};
 * members see a read-only display. The estimate hides when the per-doc rate
 * isn't resolved on the wallet yet.
 */

const DEFAULT_CAP_PRESETS = [500, 1000, 2500, 5000] as const;

interface Props {
  wallet: Wallet;
  /** Called after a successful save so the parent can refetch the wallet. */
  onSaved?: () => void;
}

/** Format minor units of an ISO currency ("$2.24", "£0.40"). */
function formatMinor(minor: number, currency: string | null): string {
  const code = (currency ?? "usd").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
      // Per-doc rates are often sub-cent (e.g. $0.02 → 2 minor, but a
      // half-cent rate is 0.5). Allow up to 3 fraction digits so they don't
      // round to $0.
      maximumFractionDigits: 3,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${code}`;
  }
}

function currencySymbol(currency: string | null): string {
  switch ((currency ?? "").toLowerCase()) {
    case "usd":
    case "":
      return "$";
    case "eur":
      return "€";
    case "gbp":
      return "£";
    default:
      return (currency ?? "").toUpperCase() + " ";
  }
}

function persistedCapOf(wallet: Wallet): number | null {
  return wallet.noCap ? null : (wallet.capUsd ?? null);
}

// What still works once the cap is hit. Everyday + manual server tools keep
// running (they're free); only the metered categories — automation and AI —
// pause until the cap resets or is raised. Mirrors the SaaS gate behavior.
const GATE_CAP_BEHAVIOR: { label: string; staysAtCap: boolean }[] = [
  {
    label: "Browser-only tools (viewer, page editor, file management)",
    staysAtCap: true,
  },
  {
    label: "Manual server tools (compress, OCR, convert, watermark…)",
    staysAtCap: true,
  },
  { label: "Automations & pipelines", staysAtCap: false },
  { label: "AI tools (AI Create, suggestions, AI-OCR)", staysAtCap: false },
];

/**
 * Collapsed "what happens at the cap" disclosure — ported from the SaaS
 * CapReachedHelp. Default-collapsed so it costs no height until opened.
 */
function CapReachedHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="payg-help">
      <button
        type="button"
        className="payg-help__toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <HelpOutlineIcon sx={{ fontSize: 15 }} />
        What happens when the cap is reached
        <ExpandMoreIcon className="payg-help__chevron" sx={{ fontSize: 16 }} />
      </button>
      {open && (
        <div className="payg-help__panel">
          <div className="payg-gates">
            {GATE_CAP_BEHAVIOR.map(({ label, staysAtCap }) => (
              <div className="payg-gate" data-enabled={staysAtCap} key={label}>
                <span className="payg-gate__chip">
                  {staysAtCap ? (
                    <CheckIcon sx={{ fontSize: 18 }} />
                  ) : (
                    <LockIcon sx={{ fontSize: 16 }} />
                  )}
                </span>
                <span className="payg-gate__label">{label}</span>
                {!staysAtCap && (
                  <span className="payg-gate__tag" data-variant="pause">
                    pauses at cap
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SpendCapControl({ wallet, onSaved }: Props) {
  const isLeader = wallet.role === "leader";
  const persistedCap = persistedCapOf(wallet);

  // Draft cap the user is editing. Seeded from the persisted value; resyncs
  // whenever the wallet refetches (e.g. after a save) so the dirty check is
  // accurate.
  const [draftCap, setDraftCap] = useState<number | null>(persistedCap);
  const [customText, setCustomText] = useState<string>(() =>
    persistedCap != null &&
    !(DEFAULT_CAP_PRESETS as readonly number[]).includes(persistedCap)
      ? String(persistedCap)
      : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftCap(persistedCap);
    setCustomText(
      persistedCap != null &&
        !(DEFAULT_CAP_PRESETS as readonly number[]).includes(persistedCap)
        ? String(persistedCap)
        : "",
    );
  }, [persistedCap]);

  const sym = currencySymbol(wallet.currency);
  const isNoCap = draftCap === null;
  const customActive =
    draftCap != null &&
    !(DEFAULT_CAP_PRESETS as readonly number[]).includes(draftCap);

  // Mirror of the backend's docCapForMoney: floor(capMinor / rate). The
  // one-time free grant is a separate lifetime pool and is NOT added here.
  const rate =
    wallet.pricePerDocMinor != null && wallet.pricePerDocMinor > 0
      ? wallet.pricePerDocMinor
      : null;
  const previewDocs =
    draftCap != null && rate != null
      ? Math.floor((draftCap * 100) / rate)
      : null;

  const dirty = draftCap !== persistedCap;

  const selectPreset = (preset: number) => {
    setCustomText("");
    setDraftCap(preset);
  };
  const selectNoCap = () => {
    setCustomText("");
    setDraftCap(null);
  };
  const onCustomInput = (raw: string) => {
    const cleaned = raw.replace(/[^0-9]/g, "");
    setCustomText(cleaned);
    const v = cleaned === "" ? 0 : parseInt(cleaned, 10);
    setDraftCap(Number.isNaN(v) ? 0 : v);
  };

  async function save() {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      await updateCap(isNoCap ? null : Math.round(draftCap ?? 0));
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!isLeader) {
    return (
      <Card padding="loose">
        <h3 className="portal-billing__section-title">Monthly cap</h3>
        <p className="portal-billing__cap-readonly">
          {wallet.noCap
            ? "Your team is not capped."
            : wallet.capUsd != null
              ? `Your team's monthly cap is ${sym}${wallet.capUsd}.`
              : "Cap not configured."}{" "}
          Only the team owner can change this.
        </p>
        <CapReachedHelp />
      </Card>
    );
  }

  return (
    <Card padding="loose">
      <h3 className="portal-billing__section-title">Monthly cap</h3>
      <p className="portal-billing__section-sub">
        Stirling stops billable processing once you hit this monthly ceiling.
        Set $0 to test without spending; choose "No cap" to remove the limit.
      </p>

      <div className="scc">
        <div className="scc-row">
          {DEFAULT_CAP_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="scc-chip"
              data-selected={draftCap === preset ? "true" : "false"}
              onClick={() => selectPreset(preset)}
              disabled={saving}
            >
              {sym}
              {preset.toLocaleString()}
            </button>
          ))}

          <label className="scc-custom" data-active={customActive ? "true" : "false"}>
            <span className="scc-custom__symbol">{sym}</span>
            <input
              className="scc-custom__input"
              inputMode="numeric"
              value={customActive ? customText : ""}
              placeholder="Custom"
              aria-label="Cap amount"
              onChange={(e) => onCustomInput(e.target.value)}
              disabled={saving}
            />
          </label>

          <button
            type="button"
            className="scc-chip"
            data-selected={isNoCap ? "true" : "false"}
            onClick={selectNoCap}
            disabled={saving}
          >
            No cap
          </button>

          <div className="scc-row__spacer">
            <Button
              variant="outline"
              size="sm"
              loading={saving}
              disabled={!dirty || saving}
              onClick={save}
            >
              Update cap
            </Button>
          </div>
        </div>

        {previewDocs != null && (
          <div className="scc-estimate">
            <DescriptionIcon className="scc-estimate__icon" sx={{ fontSize: 22 }} />
            <div>
              <div className="scc-estimate__main">
                ≈ {previewDocs.toLocaleString()} processed PDFs / month
              </div>
              <div className="scc-estimate__sub">
                at {formatMinor(wallet.pricePerDocMinor ?? 0, wallet.currency)} /
                PDF
              </div>
            </div>
          </div>
        )}

        {isNoCap && (
          <div className="scc-note">
            Usage is billed without an upper limit. You can re-enable a cap at
            any time.
          </div>
        )}

        {error && (
          <Banner tone="danger" title="Couldn't save cap">
            {error}
          </Banner>
        )}

        <CapReachedHelp />
      </div>
    </Card>
  );
}
