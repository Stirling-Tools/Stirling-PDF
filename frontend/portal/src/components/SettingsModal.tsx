import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Avatar,
  Button,
  FormField,
  Input,
  Modal,
  Select,
  SettingsShell,
  Skeleton,
  StatusBadge,
  ToggleSwitch,
  type SelectOption,
  type SettingsNavSection,
} from "@shared/components";
import { useTier, type Tier } from "@portal/contexts/TierContext";
import { useTheme, type Theme } from "@portal/contexts/ThemeContext";
import { useAsync } from "@portal/hooks/useAsync";
import {
  fetchSettings,
  type ActiveSession,
  type BetaFeature,
  type SettingsSnapshot,
} from "@portal/api/settings";
import {
  UsersIcon,
  SunIcon,
  BellIcon,
  SettingsIcon,
  PoliciesIcon,
  InfrastructureIcon,
  SparklesIcon,
  LinkIcon,
} from "@portal/components/icons";
import { AccountLinkPanel } from "@portal/components/account-link/AccountLinkPanel";
import "@portal/components/SettingsModal.css";

type SettingsSection =
  | "profile"
  | "appearance"
  | "notifications"
  | "general"
  | "authentication"
  | "sessions"
  | "early-access"
  | "account-link";

function isSettingsSection(value: string | null): value is SettingsSection {
  return (
    value === "profile" ||
    value === "appearance" ||
    value === "notifications" ||
    value === "general" ||
    value === "authentication" ||
    value === "sessions" ||
    value === "early-access" ||
    value === "account-link"
  );
}

/** Org-wide auth posture the Admin sections edit, mirrored into local state. */
interface SecurityForm {
  mfaEnforced: boolean;
  ssoEnabled: boolean;
  scimEnabled: boolean;
  sessionTimeoutMins: number;
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Optional section to land on when opening. When `null`/unsupported the modal
   * picks the default ("profile"). Set by callers like the sidebar's "Link
   * account" affordance → "account-link".
   */
  initialSection?: string | null;
}

/**
 * Notification categories with known display copy, in the order the snapshot
 * exposes them. Labels and descriptions are resolved via i18n at render time,
 * keyed by id; ids absent from this list are skipped.
 */
const NOTIFICATION_IDS = [
  "pipeline-failures",
  "pipeline-success",
  "usage-alerts",
  "weekly-digest",
  "security-alerts",
  "product-updates",
] as const;

const THEME_OPTIONS: { value: Theme }[] = [
  { value: "light" },
  { value: "dark" },
];

const SESSION_TIMEOUT_VALUES = ["60", "240", "480", "720", "1440"] as const;

/**
 * Account settings as a portal-wide overlay. A grouped left-nav (Account /
 * Workspace / Admin) over a tier-aware snapshot that seeds editable local form
 * state. Save is a no-op for the demo — it closes — but the theme control
 * writes straight through to ThemeProvider so the change is real and visible.
 */
export function SettingsModal({
  open,
  onClose,
  initialSection,
}: SettingsModalProps) {
  const { t } = useTranslation();
  const { tier } = useTier();
  const { theme, setTheme } = useTheme();
  const [section, setSection] = useState<SettingsSection>("profile");

  const navSections = useMemo<SettingsNavSection[]>(
    () => [
      {
        title: t("settings.groups.account"),
        items: [
          {
            key: "profile",
            label: t("settings.sections.profile"),
            icon: <UsersIcon size={16} />,
          },
          {
            key: "appearance",
            label: t("settings.sections.appearance"),
            icon: <SunIcon size={16} />,
          },
          {
            key: "notifications",
            label: t("settings.sections.notifications"),
            icon: <BellIcon size={16} />,
          },
        ],
      },
      {
        title: t("settings.groups.workspace"),
        items: [
          {
            key: "general",
            label: t("settings.sections.general"),
            icon: <SettingsIcon size={16} />,
          },
        ],
      },
      {
        title: t("settings.groups.admin"),
        items: [
          {
            key: "account-link",
            label: t("settings.sections.account-link"),
            icon: <LinkIcon size={16} />,
          },
          {
            key: "authentication",
            label: t("settings.sections.authentication"),
            icon: <PoliciesIcon size={16} />,
          },
          {
            key: "sessions",
            label: t("settings.sections.sessions"),
            icon: <InfrastructureIcon size={16} />,
          },
          {
            key: "early-access",
            label: t("settings.sections.early-access"),
            icon: <SparklesIcon size={16} />,
          },
        ],
      },
    ],
    [t],
  );

  const { data: snapshot, loading } = useAsync<SettingsSnapshot>(
    () => fetchSettings(tier),
    [tier],
  );

  // Editable copies seeded from the snapshot. Re-seed whenever a fresh snapshot
  // arrives (tier switch) or the modal is re-opened, so edits never leak across
  // sessions or stack on stale values.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [region, setRegion] = useState("");
  const [notifications, setNotifications] = useState<Record<string, boolean>>(
    {},
  );
  const [security, setSecurity] = useState<SecurityForm>({
    mfaEnforced: false,
    ssoEnabled: false,
    scimEnabled: false,
    sessionTimeoutMins: 480,
  });
  const [betaToggles, setBetaToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!snapshot) return;
    setName(snapshot.profile.name);
    setEmail(snapshot.profile.email);
    setWorkspaceName(snapshot.workspace.name);
    setRegion(snapshot.workspace.region);
    setNotifications(
      Object.fromEntries(snapshot.notifications.map((n) => [n.id, n.enabled])),
    );
    setSecurity({
      mfaEnforced: snapshot.security.mfaEnforced,
      ssoEnabled: snapshot.security.ssoEnabled,
      scimEnabled: snapshot.security.scimEnabled,
      sessionTimeoutMins: snapshot.security.sessionTimeoutMins,
    });
    setBetaToggles(
      Object.fromEntries(snapshot.betaFeatures.map((f) => [f.id, f.enabled])),
    );
  }, [snapshot]);

  useEffect(() => {
    if (!open) return;
    const requested = initialSection ?? null;
    setSection(isSettingsSection(requested) ? requested : "profile");
  }, [open, initialSection]);

  const regionOptions = useMemo<SelectOption[]>(() => {
    if (!snapshot) return [];
    return snapshot.regions.map((r) => ({
      value: r.value,
      label:
        r.enterpriseOnly && tier !== "enterprise"
          ? t("settings.workspace.regionEnterpriseSuffix", { region: r.label })
          : r.label,
      disabled: r.enterpriseOnly && tier !== "enterprise",
    }));
  }, [snapshot, tier, t]);

  const isLoading = loading && !snapshot;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="xl"
      ariaLabel={t("settings.ariaLabel")}
      className="portal-settings"
    >
      <SettingsShell
        sections={navSections}
        activeKey={section}
        onSelect={(k) => setSection(k as SettingsSection)}
        title={t(`settings.sections.${section}`)}
        onClose={onClose}
        footer={
          <>
            <span className="portal-settings__footer-note">
              {t("settings.footerNote")}
            </span>
            <Button variant="ghost" onClick={onClose}>
              {t("settings.cancel")}
            </Button>
            <Button variant="gradient" onClick={onClose}>
              {t("settings.saveChanges")}
            </Button>
          </>
        }
      >
        {section === "profile" && (
          <ProfilePanel
            loading={isLoading}
            name={name}
            email={email}
            role={snapshot?.profile.role}
            avatarUrl={snapshot?.profile.avatarUrl ?? undefined}
            onName={setName}
            onEmail={setEmail}
          />
        )}

        {section === "appearance" && (
          <AppearancePanel theme={theme} onTheme={setTheme} />
        )}

        {section === "notifications" && (
          <NotificationsPanel
            loading={isLoading}
            notifications={notifications}
            order={snapshot?.notifications.map((n) => n.id) ?? []}
            onToggle={(id, value) =>
              setNotifications((prev) => ({ ...prev, [id]: value }))
            }
          />
        )}

        {section === "general" && (
          <WorkspacePanel
            loading={isLoading}
            workspaceName={workspaceName}
            onWorkspaceName={setWorkspaceName}
            region={region}
            onRegion={setRegion}
            regionOptions={regionOptions}
            planLabel={snapshot?.workspace.planLabel}
            seats={snapshot?.workspace.seats}
          />
        )}

        {section === "authentication" && (
          <AuthenticationPanel
            loading={isLoading}
            tier={tier}
            security={security}
            onSecurity={(patch) => setSecurity((s) => ({ ...s, ...patch }))}
          />
        )}

        {section === "sessions" && (
          <SessionsPanel
            loading={isLoading}
            sessions={snapshot?.security.activeSessions ?? []}
          />
        )}

        {section === "early-access" && (
          <EarlyAccessPanel
            loading={isLoading}
            tier={tier}
            betaFeatures={snapshot?.betaFeatures ?? []}
            betaToggles={betaToggles}
            onBeta={(id, value) =>
              setBetaToggles((prev) => ({ ...prev, [id]: value }))
            }
          />
        )}

        {section === "account-link" && <AccountLinkPanel />}
      </SettingsShell>
    </Modal>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Profile                                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

function ProfilePanel({
  loading,
  name,
  email,
  role,
  avatarUrl,
  onName,
  onEmail,
}: {
  loading: boolean;
  name: string;
  email: string;
  role?: string;
  avatarUrl?: string;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="portal-settings__section">
        <div className="portal-settings__identity">
          <Skeleton width="3.5rem" height="3.5rem" shape="circle" />
          <div className="portal-settings__identity-meta">
            <Skeleton width="9rem" />
            <Skeleton width="12rem" height="0.625rem" />
          </div>
        </div>
        <Skeleton height="3rem" />
        <Skeleton height="3rem" />
      </div>
    );
  }

  return (
    <div className="portal-settings__section">
      <div className="portal-settings__identity">
        <Avatar
          src={avatarUrl}
          name={name || t("settings.profile.accountFallback")}
          size="lg"
          tone="blue"
        />
        <div className="portal-settings__identity-meta">
          <div className="portal-settings__identity-name">
            {name || t("settings.profile.accountFallback")}
            {role && (
              <StatusBadge tone="info" size="sm" showDot={false}>
                {role}
              </StatusBadge>
            )}
          </div>
          <span className="portal-settings__identity-email">{email}</span>
        </div>
        <Button variant="outline" size="sm" disabled>
          {t("settings.profile.changePhoto")}
        </Button>
      </div>

      <FormField label={t("settings.profile.fullName")}>
        <Input
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder={t("settings.profile.namePlaceholder")}
        />
      </FormField>

      <FormField
        label={t("settings.profile.email")}
        helperText={t("settings.profile.emailHelper")}
      >
        <Input
          type="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder={t("settings.profile.emailPlaceholder")}
        />
      </FormField>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Appearance                                                               */
/* ──────────────────────────────────────────────────────────────────────── */

function AppearancePanel({
  theme,
  onTheme,
}: {
  theme: Theme;
  onTheme: (theme: Theme) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="portal-settings__section">
      <div className="portal-settings__group">
        <div className="portal-settings__group-head">
          <h3 className="portal-settings__group-title">
            {t("settings.appearance.themeTitle")}
          </h3>
          <p className="portal-settings__group-sub">
            {t("settings.appearance.themeSub")}
          </p>
        </div>
        <div
          className="portal-settings__theme"
          role="radiogroup"
          aria-label={t("settings.appearance.themeTitle")}
        >
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={theme === opt.value}
              className={
                "portal-settings__theme-card" +
                (theme === opt.value ? " is-active" : "")
              }
              onClick={() => onTheme(opt.value)}
            >
              <span
                className={`portal-settings__theme-swatch portal-settings__theme-swatch--${opt.value}`}
                aria-hidden
              >
                <span />
                <span />
              </span>
              <span className="portal-settings__theme-text">
                <strong>{t(`settings.appearance.${opt.value}.label`)}</strong>
                <span>{t(`settings.appearance.${opt.value}.hint`)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Notifications                                                            */
/* ──────────────────────────────────────────────────────────────────────── */

function NotificationsPanel({
  loading,
  notifications,
  order,
  onToggle,
}: {
  loading: boolean;
  notifications: Record<string, boolean>;
  order: string[];
  onToggle: (id: string, value: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="portal-settings__section">
      <div className="portal-settings__group">
        <div className="portal-settings__group-head">
          <h3 className="portal-settings__group-title">
            {t("settings.notifications.title")}
          </h3>
          <p className="portal-settings__group-sub">
            {t("settings.notifications.sub")}
          </p>
        </div>

        {loading && (
          <div className="portal-settings__notifs">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="portal-settings__notif-row">
                <div className="portal-settings__notif-text">
                  <Skeleton width="9rem" />
                  <Skeleton width="14rem" height="0.625rem" />
                </div>
                <Skeleton width="2.25rem" height="1.25rem" shape="rect" />
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <div className="portal-settings__notifs">
            {order.map((id) => {
              if (!(NOTIFICATION_IDS as readonly string[]).includes(id)) {
                return null;
              }
              return (
                <div key={id} className="portal-settings__notif-row">
                  <div className="portal-settings__notif-text">
                    <strong>{t(`settings.notifications.${id}.label`)}</strong>
                    <span>{t(`settings.notifications.${id}.description`)}</span>
                  </div>
                  <ToggleSwitch
                    checked={notifications[id] ?? false}
                    onChange={(v) => onToggle(id, v)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Workspace                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

function WorkspacePanel({
  loading,
  workspaceName,
  onWorkspaceName,
  region,
  onRegion,
  regionOptions,
  planLabel,
  seats,
}: {
  loading: boolean;
  workspaceName: string;
  onWorkspaceName: (v: string) => void;
  region: string;
  onRegion: (v: string) => void;
  regionOptions: SelectOption[];
  planLabel?: string;
  seats?: { used: number; total: number };
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="portal-settings__section">
        <Skeleton height="3rem" />
        <Skeleton height="3rem" />
        <Skeleton height="4rem" />
      </div>
    );
  }

  return (
    <div className="portal-settings__section">
      <FormField label={t("settings.workspace.nameLabel")}>
        <Input
          value={workspaceName}
          onChange={(e) => onWorkspaceName(e.target.value)}
          placeholder={t("settings.workspace.namePlaceholder")}
        />
      </FormField>

      <FormField
        label={t("settings.workspace.regionLabel")}
        helperText={t("settings.workspace.regionHelper")}
      >
        <Select
          value={region}
          onChange={(e) => onRegion(e.target.value)}
          options={regionOptions}
        />
      </FormField>

      <div className="portal-settings__plan">
        <div className="portal-settings__plan-row">
          <span className="portal-settings__plan-label">
            {t("settings.workspace.plan")}
          </span>
          <StatusBadge tone="purple" size="sm">
            {planLabel ?? "—"}
          </StatusBadge>
        </div>
        {seats && (
          <div className="portal-settings__plan-row">
            <span className="portal-settings__plan-label">
              {t("settings.workspace.seats")}
            </span>
            <span className="portal-settings__plan-value">
              {t("settings.workspace.seatsUsed", {
                used: seats.used,
                total: seats.total,
              })}
            </span>
          </div>
        )}
        <Button variant="outline" size="sm" disabled>
          {t("settings.workspace.manageBilling")}
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Admin · Authentication                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

function AuthenticationPanel({
  loading,
  tier,
  security,
  onSecurity,
}: {
  loading: boolean;
  tier: Tier;
  security: SecurityForm;
  onSecurity: (patch: Partial<SecurityForm>) => void;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="portal-settings__section">
        <Skeleton height="3rem" />
        <Skeleton height="3rem" />
        <Skeleton height="3rem" />
      </div>
    );
  }

  // SSO/SCIM are enterprise capabilities; below it they render locked with a
  // badge rather than disappearing, so the upgrade path stays visible.
  const isEnterprise = tier === "enterprise";

  return (
    <div className="portal-settings__section">
      <div className="portal-settings__group">
        <div className="portal-settings__group-head">
          <h3 className="portal-settings__group-title">
            {t("settings.authentication.title")}
          </h3>
          <p className="portal-settings__group-sub">
            {t("settings.authentication.sub")}
          </p>
        </div>

        <div className="portal-settings__notifs">
          <div className="portal-settings__notif-row">
            <div className="portal-settings__notif-text">
              <strong>{t("settings.authentication.mfa.label")}</strong>
              <span>{t("settings.authentication.mfa.description")}</span>
            </div>
            <ToggleSwitch
              checked={security.mfaEnforced}
              onChange={(v) => onSecurity({ mfaEnforced: v })}
            />
          </div>

          <div className="portal-settings__notif-row">
            <div className="portal-settings__notif-text">
              <span className="portal-settings__row-label">
                <strong>{t("settings.authentication.sso.label")}</strong>
                {!isEnterprise && (
                  <StatusBadge tone="info" size="sm" showDot={false}>
                    {t("settings.enterpriseBadge")}
                  </StatusBadge>
                )}
              </span>
              <span>{t("settings.authentication.sso.description")}</span>
            </div>
            <ToggleSwitch
              checked={isEnterprise && security.ssoEnabled}
              disabled={!isEnterprise}
              onChange={(v) => onSecurity({ ssoEnabled: v })}
            />
          </div>

          <div className="portal-settings__notif-row">
            <div className="portal-settings__notif-text">
              <span className="portal-settings__row-label">
                <strong>{t("settings.authentication.scim.label")}</strong>
                {!isEnterprise && (
                  <StatusBadge tone="info" size="sm" showDot={false}>
                    {t("settings.enterpriseBadge")}
                  </StatusBadge>
                )}
              </span>
              <span>{t("settings.authentication.scim.description")}</span>
            </div>
            <ToggleSwitch
              checked={isEnterprise && security.scimEnabled}
              disabled={!isEnterprise}
              onChange={(v) => onSecurity({ scimEnabled: v })}
            />
          </div>
        </div>

        <FormField
          label={t("settings.authentication.sessionTimeout")}
          helperText={t("settings.authentication.sessionTimeoutHelper")}
        >
          <Select
            value={String(security.sessionTimeoutMins)}
            onChange={(e) =>
              onSecurity({ sessionTimeoutMins: Number(e.target.value) })
            }
            options={SESSION_TIMEOUT_VALUES.map((value) => ({
              value,
              label: t(`settings.authentication.timeout.${value}`),
            }))}
          />
        </FormField>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Admin · Active sessions                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

function SessionsPanel({
  loading,
  sessions,
}: {
  loading: boolean;
  sessions: ActiveSession[];
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="portal-settings__section">
        <Skeleton height="3rem" />
        <Skeleton height="3rem" />
      </div>
    );
  }

  return (
    <div className="portal-settings__section">
      <div className="portal-settings__group">
        <div className="portal-settings__group-head">
          <h3 className="portal-settings__group-title">
            {t("settings.sessions.title")}
          </h3>
          <p className="portal-settings__group-sub">
            {t("settings.sessions.sub")}
          </p>
        </div>
        <div className="portal-settings__notifs">
          {sessions.map((s) => (
            <div key={s.id} className="portal-settings__notif-row">
              <div className="portal-settings__notif-text">
                <strong>{s.device}</strong>
                <span>
                  {s.location} · {s.lastActive}
                </span>
              </div>
              {s.current ? (
                <StatusBadge tone="success" size="sm">
                  {t("settings.sessions.thisDevice")}
                </StatusBadge>
              ) : (
                // TODO(backend): DELETE /v1/settings/sessions/{id}
                <Button variant="ghost" size="sm">
                  {t("settings.sessions.revoke")}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Admin · Early access                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

function EarlyAccessPanel({
  loading,
  tier,
  betaFeatures,
  betaToggles,
  onBeta,
}: {
  loading: boolean;
  tier: Tier;
  betaFeatures: BetaFeature[];
  betaToggles: Record<string, boolean>;
  onBeta: (id: string, value: boolean) => void;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="portal-settings__section">
        <Skeleton height="3rem" />
        <Skeleton height="3rem" />
      </div>
    );
  }

  const isEnterprise = tier === "enterprise";

  return (
    <div className="portal-settings__section">
      <div className="portal-settings__group">
        <div className="portal-settings__group-head">
          <h3 className="portal-settings__group-title">
            {t("settings.earlyAccess.title")}
          </h3>
          <p className="portal-settings__group-sub">
            {t("settings.earlyAccess.sub")}
          </p>
        </div>
        <div className="portal-settings__notifs">
          {betaFeatures.map((f) => {
            const locked = Boolean(f.enterpriseOnly) && !isEnterprise;
            return (
              <div key={f.id} className="portal-settings__notif-row">
                <div className="portal-settings__notif-text">
                  <span className="portal-settings__row-label">
                    <strong>{f.label}</strong>
                    {locked && (
                      <StatusBadge tone="info" size="sm" showDot={false}>
                        {t("settings.enterpriseBadge")}
                      </StatusBadge>
                    )}
                  </span>
                  <span>{f.description}</span>
                </div>
                <ToggleSwitch
                  checked={!locked && (betaToggles[f.id] ?? false)}
                  disabled={locked}
                  onChange={(v) => onBeta(f.id, v)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
