import { useState } from "react";
import { Button, Card } from "@shared/components";
import type { Wallet } from "@portal/api/billing";
import { updateCap } from "@portal/api/billing";

interface Props {
  wallet: Wallet;
  onSaved?: () => void;
}

/**
 * Leader-only monthly spending cap editor. Wires to the real
 * PATCH /api/v1/payg/cap endpoint (application-layer cap; no Stripe call).
 * Members see a read-only display.
 */
export function CapControl({ wallet, onSaved }: Props) {
  const isLeader = wallet.role === "leader";
  const [draftCap, setDraftCap] = useState<string>(
    wallet.noCap ? "" : String(wallet.capUsd ?? ""),
  );
  const [noCap, setNoCap] = useState<boolean>(wallet.noCap);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const value = noCap ? null : Number(draftCap);
      if (!noCap && (!Number.isFinite(value) || (value as number) < 0)) {
        setError("Cap must be a non-negative number.");
        setSaving(false);
        return;
      }
      await updateCap(value);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="loose">
      <span className="portal-billing__eyebrow">Spending cap</span>
      <h3 className="portal-billing__section-title">
        Monthly cap
      </h3>
      <p className="portal-billing__section-sub">
        Stirling stops processing billable work once you hit this monthly
        ceiling. Set $0 to test without spending; uncap to remove the limit.
      </p>

      {isLeader ? (
        <>
          <div className="portal-billing__cap-row">
            <label className="portal-billing__cap-field">
              <span>Cap (USD)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={draftCap}
                disabled={noCap || saving}
                onChange={(e) => setDraftCap(e.target.value)}
                className="portal-billing__cap-input"
              />
            </label>
            <label className="portal-billing__cap-nocap">
              <input
                type="checkbox"
                checked={noCap}
                disabled={saving}
                onChange={(e) => setNoCap(e.target.checked)}
              />
              <span>No cap</span>
            </label>
          </div>
          {error && (
            <p className="portal-billing__cap-error" role="alert">
              {error}
            </p>
          )}
          <div className="portal-billing__cap-actions">
            <Button loading={saving} onClick={save}>
              Save cap
            </Button>
          </div>
        </>
      ) : (
        <p className="portal-billing__cap-readonly">
          {wallet.noCap
            ? "Your team is not capped."
            : wallet.capUsd != null
              ? `Your team's monthly cap is $${wallet.capUsd}.`
              : "Cap not configured."}{" "}
          Only the team owner can change this.
        </p>
      )}
    </Card>
  );
}
