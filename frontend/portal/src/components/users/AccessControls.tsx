import { useState } from "react";
import {
  Banner,
  Button,
  Card,
  ProgressBar,
  StatTile,
  StatusBadge,
  ToggleSwitch,
} from "@shared/components";
import type { AccessControls as Access } from "@portal/api/users";
import { seatsLabel } from "@portal/components/users/format";
import "@portal/views/Users.css";

interface AccessControlsProps {
  access: Access;
}

/**
 * Access posture for the org, scaling by tier:
 *   free       — seat limit + upgrade nudge only
 *   pro        — adds self-service MFA + session timeout toggles
 *   enterprise — adds SSO/SAML, SCIM provisioning and enforced MFA
 *
 * Toggles hold local state only; persisting them is a backend wiring task.
 */
export function AccessControls({ access }: AccessControlsProps) {
  const [mfaEnforced, setMfaEnforced] = useState(access.mfaEnforced ?? false);
  const [shortSessions, setShortSessions] = useState(false);

  const seatPct =
    access.seatLimit === null
      ? 0
      : Math.min(1, access.seatsUsed / access.seatLimit);

  return (
    <section className="portal-users__access">
      <header className="portal-users__section-head">
        <h2 className="portal-users__section-title">Access &amp; security</h2>
        <p className="portal-users__section-sub">
          Seats, authentication and provisioning for your organization.
        </p>
      </header>

      <div className="portal-users__access-grid">
        {/* Seats — shown on every tier. */}
        <Card padding="default">
          <div className="portal-users__access-card-head">
            <h3 className="portal-users__access-card-title">Seats</h3>
            <span className="portal-users__muted">
              {seatsLabel(access.seatsUsed, access.seatLimit)}
            </span>
          </div>
          {access.seatLimit === null ? (
            <p className="portal-users__access-note">
              Your plan includes unlimited seats.
            </p>
          ) : (
            <ProgressBar
              value={seatPct}
              thresholded
              label={`${access.seatsUsed} of ${access.seatLimit} seats used`}
            />
          )}
        </Card>

        {/* Pro+: MFA + sessions self-service. */}
        {access.mfaAvailable && (
          <Card padding="default">
            <h3 className="portal-users__access-card-title">Authentication</h3>
            <div className="portal-users__toggle-rows">
              <div className="portal-users__toggle-row">
                <ToggleSwitch
                  checked={mfaEnforced}
                  onChange={(v) => {
                    setMfaEnforced(v);
                    // TODO(backend): PATCH /v1/users/access { mfaEnforced }
                  }}
                  label="Require MFA"
                  description={
                    access.mfaEnforced
                      ? "Enforced org-wide on this plan."
                      : "Members must set up a second factor to sign in."
                  }
                  disabled={access.mfaEnforced}
                />
              </div>
              <div className="portal-users__toggle-row">
                <ToggleSwitch
                  checked={shortSessions}
                  onChange={(v) => {
                    setShortSessions(v);
                    // TODO(backend): PATCH /v1/users/access { sessionTimeout }
                  }}
                  label="Short-lived sessions"
                  description={`Sign members out after inactivity (currently ${access.sessionTimeout}).`}
                />
              </div>
            </div>
          </Card>
        )}

        {/* Enterprise: SSO. */}
        {access.sso && (
          <Card padding="default">
            <div className="portal-users__access-card-head">
              <h3 className="portal-users__access-card-title">SSO / SAML</h3>
              <StatusBadge
                tone={access.sso.status === "connected" ? "success" : "neutral"}
                size="sm"
              >
                {access.sso.status === "connected"
                  ? "Connected"
                  : "Not configured"}
              </StatusBadge>
            </div>
            <div className="portal-users__access-stats">
              <StatTile label="Provider" value={access.sso.provider} />
              <StatTile
                label="Domains"
                value={access.sso.domains.join(", ") || "—"}
              />
            </div>
            <Button variant="ghost" size="sm">
              Manage connection
            </Button>
          </Card>
        )}

        {/* Enterprise: SCIM provisioning. */}
        {access.scim && (
          <Card padding="default">
            <div className="portal-users__access-card-head">
              <h3 className="portal-users__access-card-title">
                SCIM provisioning
              </h3>
              <StatusBadge
                tone={access.scim.enabled ? "success" : "neutral"}
                size="sm"
              >
                {access.scim.enabled ? "Active" : "Off"}
              </StatusBadge>
            </div>
            <div className="portal-users__access-stats">
              <StatTile label="Directory" value={access.scim.directory} />
              <StatTile label="Last sync" value={access.scim.lastSync} />
            </div>
            <p className="portal-users__access-note">
              Members are created, updated and deactivated automatically from
              your identity provider.
            </p>
          </Card>
        )}
      </div>

      {/* Free: upgrade nudge spans the section. */}
      {access.upgradeHint && (
        <Banner
          tone="info"
          title="Unlock team access controls"
          description={access.upgradeHint}
          action={
            <Button size="sm" accent="neutral">
              Upgrade plan
            </Button>
          }
        />
      )}
    </section>
  );
}
