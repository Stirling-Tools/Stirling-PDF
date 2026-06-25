import { useEffect, useState } from "react";
import { Banner, Card } from "@shared/components";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineRounded";
import ExpandMoreIcon from "@mui/icons-material/ExpandMoreRounded";
import CheckIcon from "@mui/icons-material/CheckRounded";
import LockIcon from "@mui/icons-material/LockOutlined";
import type { Wallet } from "@portal/api/billing";
import { updateCap } from "@portal/api/billing";
import {
  currencySymbol,
  SpendCapControl as SharedSpendCapControl,
} from "@shared/billing";

/**
 * Monthly spend-cap section. Wraps the shared {@code @shared/billing} cap
 * control (chips · custom · no-cap · estimate) with the portal's card, the
 * "what happens at the cap" disclosure, and the leader-vs-member gate, wiring
 * saves to PATCH /api/v1/payg/cap via {@code updateCap}.
 */

interface Props {
  wallet: Wallet;
  /** Called after a successful save so the parent can refetch the wallet. */
  onSaved?: () => void;
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

/** Collapsed "what happens at the cap" disclosure; default-collapsed. */
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

  // Working value the user edits; resynced when the wallet refetches.
  const [draftCap, setDraftCap] = useState<number | null>(persistedCap);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftCap(persistedCap);
  }, [persistedCap]);

  async function save(cap: number | null) {
    setError(null);
    try {
      await updateCap(cap);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!isLeader) {
    const sym = currencySymbol(wallet.currency);
    return (
      <Card padding="loose">
        <h3 className="portal-billing__section-title">Monthly cap</h3>
        <p className="portal-billing__cap-readonly">
          {wallet.noCap
            ? "Your team is not capped."
            : wallet.capUsd != null
              ? `Your team's monthly cap is ${sym}${wallet.capUsd.toLocaleString()}.`
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
        Set $0 to block all metered processing; choose "No cap" to remove the
        limit.
      </p>

      {/* Remount on a persisted-value change so the custom field re-seeds. */}
      <SharedSpendCapControl
        key={persistedCap ?? "nocap"}
        capUsd={draftCap}
        onChange={setDraftCap}
        pricePerDocMinor={wallet.pricePerDocMinor}
        currency={wallet.currency}
        savedCapUsd={persistedCap}
        onSave={save}
      />

      {error && (
        <Banner tone="danger" title="Couldn't save cap">
          {error}
        </Banner>
      )}

      <CapReachedHelp />
    </Card>
  );
}
