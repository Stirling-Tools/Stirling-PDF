import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Card,
  ProgressBar,
  StatTile,
  StatusBadge,
  ToggleSwitch,
} from "@app/ui";
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
  const { t } = useTranslation();
  const [mfaEnforced, setMfaEnforced] = useState(access.mfaEnforced ?? false);
  const [shortSessions, setShortSessions] = useState(false);

  const seatPct =
    access.seatLimit === null
      ? 0
      : Math.min(1, access.seatsUsed / access.seatLimit);

  return (
    <section className="portal-users__access">
      <header className="portal-users__section-head">
        <h2 className="portal-users__section-title">
          {t("portal.users.access.title")}
        </h2>
        <p className="portal-users__section-sub">
          {t("portal.users.access.subtitle")}
        </p>
      </header>

      <div className="portal-users__access-grid">
        {/* Seats — shown on every tier. */}
        <Card padding="default">
          <div className="portal-users__access-card-head">
            <h3 className="portal-users__access-card-title">
              {t("portal.users.access.seats.title")}
            </h3>
            <span className="portal-users__muted">
              {seatsLabel(access.seatsUsed, access.seatLimit)}
            </span>
          </div>
          {access.seatLimit === null ? (
            <p className="portal-users__access-note">
              {t("portal.users.access.seats.unlimited")}
            </p>
          ) : (
            <ProgressBar
              value={seatPct}
              thresholded
              label={t("portal.users.access.seats.usedLabel", {
                used: access.seatsUsed,
                limit: access.seatLimit,
              })}
            />
          )}
        </Card>

        {/* Pro+: MFA + sessions self-service. */}
        {access.mfaAvailable && (
          <Card padding="default">
            <h3 className="portal-users__access-card-title">
              {t("portal.users.access.auth.title")}
            </h3>
            <div className="portal-users__toggle-rows">
              <div className="portal-users__toggle-row">
                <ToggleSwitch
                  checked={mfaEnforced}
                  onChange={(v) => {
                    setMfaEnforced(v);
                    // TODO(backend): PATCH /v1/users/access { mfaEnforced }
                  }}
                  label={t("portal.users.access.auth.requireMfa.label")}
                  description={
                    access.mfaEnforced
                      ? t("portal.users.access.auth.requireMfa.enforced")
                      : t("portal.users.access.auth.requireMfa.description")
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
                  label={t("portal.users.access.auth.shortSessions.label")}
                  description={t(
                    "portal.users.access.auth.shortSessions.description",
                    {
                      timeout: access.sessionTimeout,
                    },
                  )}
                />
              </div>
            </div>
          </Card>
        )}

        {/* Enterprise: SSO. */}
        {access.sso && (
          <Card padding="default">
            <div className="portal-users__access-card-head">
              <h3 className="portal-users__access-card-title">
                {t("portal.users.access.sso.title")}
              </h3>
              <StatusBadge
                tone={access.sso.status === "connected" ? "success" : "neutral"}
                size="sm"
              >
                {access.sso.status === "connected"
                  ? t("portal.users.access.sso.connected")
                  : t("portal.users.access.sso.notConfigured")}
              </StatusBadge>
            </div>
            <div className="portal-users__access-stats">
              <StatTile
                label={t("portal.users.access.sso.provider")}
                value={access.sso.provider}
              />
              <StatTile
                label={t("portal.users.access.sso.domains")}
                value={access.sso.domains.join(", ") || "—"}
              />
            </div>
            <Button variant="tertiary" size="sm">
              {t("portal.users.access.sso.manage")}
            </Button>
          </Card>
        )}

        {/* Enterprise: SCIM provisioning. */}
        {access.scim && (
          <Card padding="default">
            <div className="portal-users__access-card-head">
              <h3 className="portal-users__access-card-title">
                {t("portal.users.access.scim.title")}
              </h3>
              <StatusBadge
                tone={access.scim.enabled ? "success" : "neutral"}
                size="sm"
              >
                {access.scim.enabled
                  ? t("portal.users.access.scim.active")
                  : t("portal.users.access.scim.off")}
              </StatusBadge>
            </div>
            <div className="portal-users__access-stats">
              <StatTile
                label={t("portal.users.access.scim.directory")}
                value={access.scim.directory}
              />
              <StatTile
                label={t("portal.users.access.scim.lastSync")}
                value={access.scim.lastSync}
              />
            </div>
            <p className="portal-users__access-note">
              {t("portal.users.access.scim.note")}
            </p>
          </Card>
        )}
      </div>

      {/* Free: upgrade nudge spans the section. */}
      {access.upgradeHint && (
        <Banner
          tone="info"
          title={t("portal.users.access.upgrade.title")}
          description={access.upgradeHint}
          action={
            <Button size="sm" accent="premium">
              {t("portal.users.access.upgrade.action")}
            </Button>
          }
        />
      )}
    </section>
  );
}
