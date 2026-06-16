import { useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  FormField,
  Input,
  Modal,
  Select,
  Skeleton,
  StatusBadge,
  Tabs,
  ToggleSwitch,
  type SelectOption,
  type TabItem,
} from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useTheme, type Theme } from "@portal/contexts/ThemeContext";
import { useAsync } from "@portal/hooks/useAsync";
import { fetchSettings, type SettingsSnapshot } from "@portal/api/settings";
import "@portal/components/SettingsModal.css";

type SettingsTab = "profile" | "preferences" | "workspace";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

/** Display copy for each notification category, keyed by the snapshot id. */
const NOTIFICATION_COPY: Record<
  string,
  { label: string; description: string }
> = {
  "pipeline-failures": {
    label: "Pipeline failures",
    description: "A run errors out or a step times out.",
  },
  "pipeline-success": {
    label: "Pipeline completions",
    description: "Every successful pipeline run finishes.",
  },
  "usage-alerts": {
    label: "Usage & quota alerts",
    description: "You approach a plan limit or rate cap.",
  },
  "weekly-digest": {
    label: "Weekly digest",
    description: "A Monday summary of volume and health.",
  },
  "security-alerts": {
    label: "Security alerts",
    description: "New API keys, sign-ins, or permission changes.",
  },
  "product-updates": {
    label: "Product updates",
    description: "New operations, sources, and release notes.",
  },
};

const TABS: TabItem<SettingsTab>[] = [
  { key: "profile", label: "Profile" },
  { key: "preferences", label: "Preferences" },
  { key: "workspace", label: "Workspace" },
];

const THEME_OPTIONS: { value: Theme; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "Bright surfaces" },
  { value: "dark", label: "Dark", hint: "Dim surfaces" },
];

/**
 * Account settings as a portal-wide overlay. Opens onto a tier-aware snapshot
 * (profile, notification defaults, workspace + region) which seeds editable
 * local form state. Save is a no-op for the demo — it simply closes — but the
 * theme control writes straight through to ThemeProvider so the change is real
 * and visible immediately.
 */
export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { tier } = useTier();
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState<SettingsTab>("profile");

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

  useEffect(() => {
    if (!snapshot) return;
    setName(snapshot.profile.name);
    setEmail(snapshot.profile.email);
    setWorkspaceName(snapshot.workspace.name);
    setRegion(snapshot.workspace.region);
    setNotifications(
      Object.fromEntries(snapshot.notifications.map((n) => [n.id, n.enabled])),
    );
  }, [snapshot]);

  useEffect(() => {
    if (open) setTab("profile");
  }, [open]);

  const regionOptions = useMemo<SelectOption[]>(() => {
    if (!snapshot) return [];
    return snapshot.regions.map((r) => ({
      value: r.value,
      label:
        r.enterpriseOnly && tier !== "enterprise"
          ? `${r.label} · Enterprise`
          : r.label,
      disabled: r.enterpriseOnly && tier !== "enterprise",
    }));
  }, [snapshot, tier]);

  const isLoading = loading && !snapshot;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="Settings"
      subtitle="Manage your profile, preferences, and workspace."
      className="portal-settings"
      footer={
        <>
          <span className="portal-settings__footer-note">
            Changes apply to this workspace.
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gradient" onClick={onClose}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="portal-settings__tabs">
        <Tabs
          items={TABS}
          activeKey={tab}
          onChange={setTab}
          variant="underline"
          ariaLabel="Settings sections"
        />
      </div>

      <div className="portal-settings__panel">
        {tab === "profile" && (
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

        {tab === "preferences" && (
          <PreferencesPanel
            loading={isLoading}
            notifications={notifications}
            order={snapshot?.notifications.map((n) => n.id) ?? []}
            onToggle={(id, value) =>
              setNotifications((prev) => ({ ...prev, [id]: value }))
            }
            theme={theme}
            onTheme={setTheme}
          />
        )}

        {tab === "workspace" && (
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
      </div>
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
          name={name || "Account"}
          size="lg"
          tone="blue"
        />
        <div className="portal-settings__identity-meta">
          <div className="portal-settings__identity-name">
            {name || "Account"}
            {role && (
              <StatusBadge tone="info" size="sm" showDot={false}>
                {role}
              </StatusBadge>
            )}
          </div>
          <span className="portal-settings__identity-email">{email}</span>
        </div>
        <Button variant="outline" size="sm" disabled>
          Change photo
        </Button>
      </div>

      <FormField label="Full name">
        <Input
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Your name"
        />
      </FormField>

      <FormField
        label="Email"
        helperText="Used for sign-in and notification delivery."
      >
        <Input
          type="email"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="you@company.com"
        />
      </FormField>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Preferences                                                              */
/* ──────────────────────────────────────────────────────────────────────── */

function PreferencesPanel({
  loading,
  notifications,
  order,
  onToggle,
  theme,
  onTheme,
}: {
  loading: boolean;
  notifications: Record<string, boolean>;
  order: string[];
  onToggle: (id: string, value: boolean) => void;
  theme: Theme;
  onTheme: (theme: Theme) => void;
}) {
  return (
    <div className="portal-settings__section">
      <div className="portal-settings__group">
        <div className="portal-settings__group-head">
          <h3 className="portal-settings__group-title">Appearance</h3>
          <p className="portal-settings__group-sub">
            Choose how the portal looks on this device.
          </p>
        </div>
        <div
          className="portal-settings__theme"
          role="radiogroup"
          aria-label="Theme"
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
                <strong>{opt.label}</strong>
                <span>{opt.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="portal-settings__group">
        <div className="portal-settings__group-head">
          <h3 className="portal-settings__group-title">Notifications</h3>
          <p className="portal-settings__group-sub">
            Pick which events reach your inbox.
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
              const copy = NOTIFICATION_COPY[id];
              if (!copy) return null;
              return (
                <div key={id} className="portal-settings__notif-row">
                  <div className="portal-settings__notif-text">
                    <strong>{copy.label}</strong>
                    <span>{copy.description}</span>
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
      <FormField label="Workspace name">
        <Input
          value={workspaceName}
          onChange={(e) => onWorkspaceName(e.target.value)}
          placeholder="Workspace name"
        />
      </FormField>

      <FormField
        label="Data residency region"
        helperText="Where documents are processed and stored at rest."
      >
        <Select
          value={region}
          onChange={(e) => onRegion(e.target.value)}
          options={regionOptions}
        />
      </FormField>

      <div className="portal-settings__plan">
        <div className="portal-settings__plan-row">
          <span className="portal-settings__plan-label">Plan</span>
          <StatusBadge tone="purple" size="sm">
            {planLabel ?? "—"}
          </StatusBadge>
        </div>
        {seats && (
          <div className="portal-settings__plan-row">
            <span className="portal-settings__plan-label">Seats</span>
            <span className="portal-settings__plan-value">
              {seats.used} of {seats.total} used
            </span>
          </div>
        )}
        <Button variant="outline" size="sm" disabled>
          Manage billing
        </Button>
      </div>
    </div>
  );
}
