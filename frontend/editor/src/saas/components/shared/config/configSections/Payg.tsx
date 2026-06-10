/**
 * Pay-as-you-go billing & usage section — the SUBSCRIBED leader/member views.
 *
 * All data comes from the real {@code Wallet} snapshot ({@code GET
 * /api/v1/payg/wallet} via {@link useWallet}); there is no mock fallback. What
 * the wallet doesn't provide, the UI doesn't show:
 *
 *   - spend + cap render in the units/USD the backend actually returns
 *     ({@code spendUnitsThisPeriod}, {@code capUsd}, {@code noCap})
 *   - the per-category breakdown comes from {@code categoryBreakdown}
 *     (wallet_category_summary view)
 *   - money-equivalent display and the units↔money cap preview need
 *     stripe.prices via Sync Engine (design §13 / PR-C2) and are deliberately
 *     absent until that ships
 *   - the activity feed renders {@code wallet.recent}, which is {@code []} in
 *     V1 — so it shows a real empty state, not fabricated rows
 */
import React, { useState } from "react";
import { Button, Group, NumberInput, Stack, Switch, Text } from "@mantine/core";
import { useRenderCount } from "@app/hooks/useRenderCount";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LockIcon from "@mui/icons-material/LockOutlined";
import CheckIcon from "@mui/icons-material/CheckRounded";
import LocalIcon from "@app/components/shared/LocalIcon";
import { alert as showToast } from "@app/components/toast";
// Relative (not @app/*) so the co-located CSS resolves directly.
// eslint-disable-next-line no-restricted-imports
import "./Payg.css";
import { useTranslation } from "react-i18next";
import type { SubCapUpdateResult, Wallet } from "@app/hooks/useWallet";

// ─── Types ────────────────────────────────────────────────────────────────

type Gate = "OFFSITE_PROCESSING" | "AUTOMATION" | "AI_SUPPORT" | "CLIENT_SIDE";

interface MemberSubCap {
  userId: string;
  name: string;
  email: string;
  capUnits: number | null; // null = no sub-cap
  spendUnits: number;
}

interface PaygProps {
  role: "LEADER" | "MEMBER";
  /** Real wallet snapshot from {@code useWallet}. Single source of truth. */
  wallet: Wallet;
  /**
   * Persist a cap change. Provided by {@code Plan} → {@code useWallet} for the
   * leader view; absent on the member view (read-only).
   */
  onSaveCap?: (capUsd: number | null) => Promise<void> | void;
  /**
   * Persist a per-member sub-cap. Same provenance as {@link onSaveCap}.
   */
  onSaveSubCap?: (
    userId: string,
    capUnits: number | null,
  ) => Promise<SubCapUpdateResult>;
  /**
   * Open the Stripe Customer Portal. When omitted the Stripe card is hidden.
   * On error the implementation shows a friendly toast and resolves — callers
   * don't need to wrap in try/catch.
   */
  onOpenPortal?: () => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

// Stable-ish avatar colour from a string.
const AVATAR_COLORS = [
  "#0a8bff",
  "#8b5cf6",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#06b6d4",
];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function gateLabel(
  g: Gate,
  t: (k: string, fallback: string) => string,
): string {
  switch (g) {
    case "OFFSITE_PROCESSING":
      return t(
        "payg.gates.offsite",
        "Server tools (compress, OCR, convert, watermark…)",
      );
    case "AUTOMATION":
      return t("payg.gates.automation", "Automations & pipelines");
    case "AI_SUPPORT":
      return t("payg.gates.ai", "AI tools (AI Create, suggestions, AI-OCR)");
    case "CLIENT_SIDE":
      return t(
        "payg.gates.client",
        "Browser-only tools (viewer, page editor, file management)",
      );
  }
}

// ─── Hero usage panel ───────────────────────────────────────────────────────

/**
 * Usage hero — gradient panel with the allowance bar. Both numbers are real:
 * {@code billableUsed} (wallet_ledger period sum) over {@code billableLimit}
 * (free-tier allowance for free teams; the USD cap translated to units for
 * subscribed teams — the backend's resolveBillableLimit does that translation
 * server-side). The display state (healthy / approaching / reached) derives
 * from the real percentage at the backend's default thresholds (80/100); the
 * money-spent estimate stays out until stripe.prices wiring lands (PR-C2).
 */
function UsageHero({ wallet }: { wallet: Wallet }) {
  const { t } = useTranslation();

  const periodEnd = new Date(wallet.billingPeriodEnd);
  const daysLeft = Math.max(
    0,
    Math.ceil((periodEnd.getTime() - Date.now()) / 86_400_000),
  );
  const hasCap = !wallet.noCap && wallet.capUsd != null;
  const breakdown = wallet.categoryBreakdown;

  const hasLimit = wallet.billableLimit > 0;
  const pct = hasLimit
    ? Math.min(100, (wallet.billableUsed / wallet.billableLimit) * 100)
    : 0;
  const state = pct >= 100 ? "DEGRADED" : pct >= 80 ? "WARNED" : "FULL";
  const stateLabel = {
    FULL: t("payg.state.full", "Healthy"),
    WARNED: t("payg.state.warned", "Approaching cap"),
    DEGRADED: t("payg.state.degraded", "Cap reached"),
  }[state];

  return (
    <div className="payg-hero" data-state={state}>
      <div className="payg-hero__inner">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <div className="payg-hero__eyebrow">
              {t("payg.usage.thisPeriod", "This billing period")}
            </div>
            <div className="payg-hero__figure">
              <span className="payg-hero__spend">
                {wallet.billableUsed.toLocaleString()}
              </span>
              {hasLimit && (
                <span className="payg-hero__cap">
                  / {wallet.billableLimit.toLocaleString()}{" "}
                  {t("payg.usage.units", "units")}
                </span>
              )}
            </div>
          </div>
          <div className="payg-status" data-state={state}>
            <span className="payg-status__dot" />
            {stateLabel}
          </div>
        </Group>

        {hasLimit && (
          <div className="payg-bar">
            <div
              className="payg-bar__fill"
              data-state={state}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}

        <div className="payg-hero__meta">
          <span>
            {t(
              "payg.usage.breakdown",
              "AI {{ai}} • Automation {{automation}} • API {{api}}",
              {
                ai: breakdown.ai.toLocaleString(),
                automation: breakdown.automation.toLocaleString(),
                api: breakdown.api.toLocaleString(),
              },
            )}
          </span>
          <span className="payg-hero__meta-dot">•</span>
          <span>
            {hasCap
              ? t("payg.usage.capLine", "${{cap}}/mo cap", {
                  cap: wallet.capUsd,
                })
              : t("payg.usage.noCap", "No monthly cap")}
          </span>
          <span className="payg-hero__meta-dot">•</span>
          <span>
            {daysLeft === 1
              ? t("payg.usage.resetsTomorrow", "Resets tomorrow")
              : t("payg.usage.resetsIn", "Resets in {{days}} days", {
                  days: daysLeft,
                })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Cap editor ─────────────────────────────────────────────────────────────

interface CapEditorProps {
  /** Current cap in whole USD; null = no cap set. */
  capUsd: number | null;
  /** True when the leader explicitly disabled the cap. */
  noCap: boolean;
  /**
   * Persist the cap change. Receives whole USD (matches the backend's
   * {@code PATCH /api/v1/payg/cap} body) or null for no-cap.
   */
  onSaveCap?: (capUsd: number | null) => Promise<void> | void;
}

/**
 * Edits exactly what the backend stores: a USD cap + a no-cap flag. The
 * units↔money preview and warn/degrade threshold editors from the original
 * design need backend surfaces that don't exist yet (cap-preview via
 * stripe.prices, PATCH support for wallet_policy thresholds) and will return
 * with PR-C2 — until then the editor doesn't render controls it can't save.
 */
function CapEditor({ capUsd, noCap, onSaveCap }: CapEditorProps) {
  const { t } = useTranslation();
  const [money, setMoney] = useState<number>(capUsd ?? 25);
  const [uncapped, setUncapped] = useState<boolean>(noCap || capUsd == null);
  const [saving, setSaving] = useState<boolean>(false);

  const dirty =
    uncapped !== (noCap || capUsd == null) ||
    (!uncapped && money !== (capUsd ?? 25));

  return (
    <div className="payg-card">
      <Stack gap="lg">
        <div>
          <div className="payg-card__title">
            {t("payg.cap.title", "Monthly spending cap")}
          </div>
          <div className="payg-card__subtitle">
            {t(
              "payg.cap.subtitleUsd",
              "Set the maximum your team can spend per month. Usage pauses at the cap and resumes next period.",
            )}
          </div>
        </div>

        <Group align="flex-end" gap="sm" wrap="nowrap">
          <NumberInput
            label={t("payg.cap.amount", "Cap amount")}
            value={money}
            onChange={(v) => setMoney(typeof v === "number" ? v : 0)}
            min={0}
            step={5}
            decimalScale={0}
            prefix="$"
            size="md"
            style={{ flex: 1 }}
            disabled={uncapped}
          />
          <Text size="sm" pb={10} c="dimmed">
            {t("payg.cap.perMonth", "/ month")}
          </Text>
        </Group>

        <Switch
          checked={uncapped}
          onChange={(e) => setUncapped(e.currentTarget.checked)}
          label={t("payg.cap.noCapLabel", "No monthly cap")}
          description={t(
            "payg.cap.noCapDesc",
            "Usage is billed without an upper limit. You can re-enable a cap at any time.",
          )}
        />

        <Group justify="flex-end" gap="sm">
          <Button
            variant="default"
            size="xs"
            disabled={!dirty}
            onClick={() => {
              setMoney(capUsd ?? 25);
              setUncapped(noCap || capUsd == null);
            }}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            variant="default"
            size="xs"
            disabled={!dirty || saving}
            loading={saving}
            leftSection={<LocalIcon icon="check-rounded" />}
            onClick={async () => {
              if (!onSaveCap) return;
              setSaving(true);
              try {
                await onSaveCap(uncapped ? null : Math.round(money));
              } finally {
                setSaving(false);
              }
            }}
          >
            {t("payg.cap.save", "Update cap")}
          </Button>
        </Group>
      </Stack>
    </div>
  );
}

function CapReadOnly({ capUsd, noCap }: { capUsd: number | null; noCap: boolean }) {
  const { t } = useTranslation();
  const hasCap = !noCap && capUsd != null;
  return (
    <div className="payg-card">
      <Stack gap="sm">
        <div className="payg-card__title">
          {t("payg.cap.title", "Monthly spending cap")}
        </div>
        <Group gap="xs" align="baseline">
          <Text fz={28} fw={750} lh={1}>
            {hasCap ? `$${capUsd}` : t("payg.cap.noneShort", "No cap")}
          </Text>
          {hasCap && (
            <Text c="dimmed">{t("payg.cap.perMonth", "/ month")}</Text>
          )}
        </Group>
        <div className="payg-preview" style={{ marginTop: 6 }}>
          <div>
            <div className="payg-preview__main">
              {t(
                "payg.member.askLeader",
                "Only your team owner can change the cap.",
              )}
            </div>
          </div>
        </div>
      </Stack>
    </div>
  );
}

// ─── Gates ────────────────────────────────────────────────────────────────

// What still works once the cap is hit. Everyday tools keep running; only AI
// and automation/pipelines pause until the cap resets or is raised.
const GATE_CAP_BEHAVIOR: { gate: Gate; staysAtCap: boolean }[] = [
  { gate: "CLIENT_SIDE", staysAtCap: true },
  { gate: "OFFSITE_PROCESSING", staysAtCap: true },
  { gate: "AUTOMATION", staysAtCap: false },
  { gate: "AI_SUPPORT", staysAtCap: false },
];

function GatesCard() {
  const { t } = useTranslation();
  return (
    <div className="payg-card">
      <Stack gap="md">
        <div>
          <div className="payg-card__title">
            {t("payg.gates.title", "What happens when the cap is reached")}
          </div>
          <div className="payg-card__subtitle">
            {t(
              "payg.gates.subtitle",
              "Your everyday tools keep working. Only AI and automation pause until the cap resets or is raised.",
            )}
          </div>
        </div>
        <div className="payg-gates">
          {GATE_CAP_BEHAVIOR.map(({ gate, staysAtCap }) => (
            <div className="payg-gate" data-enabled={staysAtCap} key={gate}>
              <span className="payg-gate__chip">
                {staysAtCap ? (
                  <CheckIcon sx={{ fontSize: 18 }} />
                ) : (
                  <LockIcon sx={{ fontSize: 16 }} />
                )}
              </span>
              <span className="payg-gate__label">{gateLabel(gate, t)}</span>
              {!staysAtCap && (
                <span className="payg-gate__tag" data-variant="pause">
                  {t("payg.gates.pauses", "pauses at cap")}
                </span>
              )}
            </div>
          ))}
        </div>
      </Stack>
    </div>
  );
}

// ─── Member sub-caps ────────────────────────────────────────────────────────

interface MemberSubCapsProps {
  members: MemberSubCap[];
  /**
   * Persist a sub-cap edit. Returns the effective (post-clamp) value so the
   * row can show "Clamped to team cap" when the server reduced the request.
   */
  onSaveSubCap?: (
    userId: string,
    capUnits: number | null,
  ) => Promise<SubCapUpdateResult>;
}

function MemberSubCaps({ members, onSaveSubCap }: MemberSubCapsProps) {
  const { t } = useTranslation();
  // Track which row is in edit mode by userId. Only one row is editable at a
  // time — a second Edit click on a different row swaps the focus rather
  // than opening a parallel editor. That keeps the table readable and means
  // the saving spinner can't fight for the same scope.
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  return (
    <div className="payg-card">
      <Stack gap="sm">
        <div>
          <div className="payg-card__title">
            {t("payg.subcaps.title", "Per-member sub-caps")}
          </div>
          <div className="payg-card__subtitle">
            {t(
              "payg.subcaps.subtitle",
              "Optional: cap individual teammates so one person can't drain the team budget.",
            )}
          </div>
        </div>
        <div>
          {members.map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              editing={editingUserId === m.userId}
              onBeginEdit={() => setEditingUserId(m.userId)}
              onCancelEdit={() => setEditingUserId(null)}
              onSaveSubCap={onSaveSubCap}
              onSaved={() => setEditingUserId(null)}
            />
          ))}
        </div>
      </Stack>
    </div>
  );
}

interface MemberRowProps {
  member: MemberSubCap;
  editing: boolean;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onSaveSubCap?: (
    userId: string,
    capUnits: number | null,
  ) => Promise<SubCapUpdateResult>;
  onSaved: () => void;
}

function MemberRow({
  member,
  editing,
  onBeginEdit,
  onCancelEdit,
  onSaveSubCap,
  onSaved,
}: MemberRowProps) {
  const { t } = useTranslation();
  // Seed the editor with the current value (or 100 as a sensible default
  // when the member has no cap yet — matches the smallest team-cap tier so
  // a first-time leader doesn't have to guess at units).
  const [draft, setDraft] = useState<number>(member.capUnits ?? 100);
  const [saving, setSaving] = useState(false);

  const subPct =
    member.capUnits && member.capUnits > 0
      ? Math.min(100, (member.spendUnits / member.capUnits) * 100)
      : null;

  const handleSave = async (capUnits: number | null) => {
    if (!onSaveSubCap) return;
    setSaving(true);
    try {
      const result = await onSaveSubCap(member.userId, capUnits);
      if (result.clamped) {
        // Effective < requested: surface that explicitly so the leader
        // knows the row didn't land at their typed value. Phrasing it as
        // "Clamped to team cap" rather than just showing the new number
        // is the difference between "the system did something" and "the
        // system is broken" in the leader's head.
        showToast({
          alertType: "warning",
          title: t("payg.subcaps.toast.clamped.title", "Sub-cap clamped"),
          body: t(
            "payg.subcaps.toast.clamped.body",
            "Clamped to team cap of {{units}} documents.",
            { units: result.effective.toLocaleString() },
          ),
          location: "bottom-right",
        });
      } else {
        showToast({
          alertType: "success",
          title: t("payg.subcaps.toast.saved.title", "Sub-cap updated"),
          location: "bottom-right",
        });
      }
      onSaved();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[Payg] sub-cap update failed", e);
      showToast({
        alertType: "error",
        title: t("payg.subcaps.toast.error.title", "Couldn't update sub-cap"),
        body: t(
          "payg.subcaps.toast.error.body",
          "Please try again in a moment.",
        ),
        location: "bottom-right",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="payg-member">
      <span
        className="payg-member__avatar"
        style={{ background: avatarColor(member.userId) }}
      >
        {member.name.charAt(0).toUpperCase()}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="payg-member__name">{member.name}</div>
        <div className="payg-member__email">{member.email}</div>
      </div>
      {editing ? (
        <Group gap="xs" wrap="nowrap" align="center">
          <NumberInput
            value={draft}
            onChange={(v) => setDraft(typeof v === "number" ? v : 0)}
            min={0}
            step={50}
            w={120}
            size="xs"
            disabled={saving}
            suffix={` ${t("payg.member.units", "units")}`}
            aria-label={t(
              "payg.subcaps.editor.label",
              "Sub-cap for {{name}}",
              { name: member.name },
            )}
          />
          <Button
            size="xs"
            variant="default"
            disabled={saving}
            onClick={onCancelEdit}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          {member.capUnits !== null && (
            // Removing an existing sub-cap is a meaningfully different op
            // from setting one — clearer to give it its own button than
            // overload "Save" with a null sentinel.
            <Button
              size="xs"
              variant="subtle"
              color="red"
              disabled={saving}
              loading={saving}
              onClick={() => handleSave(null)}
            >
              {t("payg.subcaps.editor.remove", "Remove cap")}
            </Button>
          )}
          <Button
            size="xs"
            variant="filled"
            disabled={saving || draft < 0}
            loading={saving}
            onClick={() => handleSave(draft)}
          >
            {t("common.save", "Save")}
          </Button>
        </Group>
      ) : (
        <>
          <div className="payg-member__usage">
            <div className="payg-member__usage-num">
              {member.spendUnits.toLocaleString()}
              {member.capUnits !== null ? (
                <> / {member.capUnits.toLocaleString()}</>
              ) : (
                <Text span size="xs" c="dimmed">
                  {" "}
                  {t("payg.member.noCap", "· no sub-cap")}
                </Text>
              )}
            </div>
            {subPct !== null && (
              <div className="payg-member__minibar">
                <div
                  className="payg-member__minibar-fill"
                  style={{ width: `${subPct}%` }}
                />
              </div>
            )}
          </div>
          <Button
            size="xs"
            variant="default"
            onClick={onBeginEdit}
            disabled={!onSaveSubCap}
          >
            {member.capUnits === null
              ? t("payg.member.setCap", "Set cap")
              : t("payg.member.editCap", "Edit")}
          </Button>
        </>
      )}
    </div>
  );
}

// ─── Activity feed ──────────────────────────────────────────────────────────

/**
 * Renders {@code wallet.recent} — the backend returns {@code []} in V1 (the
 * meter-event surface ships in Wave 2), so today this shows a real empty
 * state. The row renderer is ready for when the rows arrive; fields are read
 * defensively because the activity-row shape isn't finalised yet (the Wallet
 * type carries {@code Record<string, unknown>} for the same reason).
 */
function ActivityFeed({ recent }: { recent: Wallet["recent"] }) {
  const { t } = useTranslation();
  return (
    <div className="payg-card">
      <Stack gap="sm">
        <div>
          <div className="payg-card__title">
            {t("payg.activity.title", "Recent billable activity")}
          </div>
          <div className="payg-card__subtitle">
            {t(
              "payg.activity.subtitle",
              "Only AI and automation draw from your budget. Everyday tools are free and aren't listed here.",
            )}
          </div>
        </div>
        {recent.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t(
              "payg.activity.empty",
              "No billable activity yet this period.",
            )}
          </Text>
        ) : (
          <div>
            {recent.map((r, i) => (
              <div className="payg-activity-row" key={String(r.id ?? i)}>
                <span
                  className="payg-activity__dot"
                  data-kind={String(r.kind ?? "")}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="payg-activity__label">
                    {String(r.label ?? "")}
                  </div>
                  <div className="payg-activity__ts">{String(r.ts ?? "")}</div>
                </div>
                <span className="payg-activity__kind">
                  {String(r.kind ?? "")}
                </span>
                <span className="payg-activity__units">
                  {String(r.docUnits ?? 0)} {t("payg.activity.units", "units")}
                </span>
              </div>
            ))}
          </div>
        )}
      </Stack>
    </div>
  );
}

// ─── Stripe CTA ──────────────────────────────────────────────────────────────

function StripePortalLink({ onOpenPortal }: { onOpenPortal: () => Promise<void> }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onOpenPortal();
    } catch (e: unknown) {
      // 503 = Supabase edge fn isn't configured (local dev without
      // PORTAL_NOT_CONFIGURED env). 404 = no Stripe customer yet (e.g. the
      // team was force-subscribed via dev hooks). Both are user-actionable
      // in roughly the same way ("try again later or contact support") so
      // we don't bother branching the copy.
      // eslint-disable-next-line no-console
      console.warn("[Payg] portal session failed", e);
      showToast({
        alertType: "warning",
        title: t(
          "payg.stripe.toast.unavailable.title",
          "Billing portal unavailable",
        ),
        body: t(
          "payg.stripe.toast.unavailable.body",
          "Billing portal isn't available right now. Try again in a moment.",
        ),
        location: "bottom-right",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="payg-stripe">
      <div>
        <div className="payg-stripe__title">
          {t("payg.stripe.title", "Manage billing in Stripe")}
        </div>
        <div className="payg-stripe__subtitle">
          {t(
            "payg.stripe.subtitle",
            "Receipts, invoices, payment method, billing currency.",
          )}
        </div>
      </div>
      <Button
        onClick={handleClick}
        loading={loading}
        rightSection={<OpenInNewIcon sx={{ fontSize: 16 }} />}
        variant="light"
      >
        {t("payg.stripe.open", "Open billing portal")}
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

const Payg: React.FC<PaygProps> = ({
  role,
  wallet,
  onSaveCap,
  onSaveSubCap,
  onOpenPortal,
}) => {
  useRenderCount(role === "LEADER" ? "PaygLeader" : "PaygMember");
  const { t } = useTranslation();
  const isLeader = role === "LEADER";

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });

  return (
    <div className="payg">
      <Stack gap="lg">
        {/* The modal chrome already renders the section title ("Billing &
            usage"), so we lead with the descriptive subtitle + role pill. */}
        <Group justify="space-between" align="center" wrap="nowrap">
          <div className="payg-header__subtitle">
            {t(
              "payg.subtitle",
              "Pay-as-you-go — you only pay for what you process. Billing period {{start}} – {{end}}.",
              {
                start: fmt(wallet.billingPeriodStart),
                end: fmt(wallet.billingPeriodEnd),
              },
            )}
          </div>
          <span className="payg-role-pill" data-leader={isLeader}>
            {isLeader
              ? t("payg.role.leader", "Team owner")
              : t("payg.role.member", "Member")}
          </span>
        </Group>

        <UsageHero wallet={wallet} />

        {isLeader ? (
          <CapEditor
            capUsd={wallet.capUsd}
            noCap={wallet.noCap}
            onSaveCap={onSaveCap}
          />
        ) : (
          <CapReadOnly capUsd={wallet.capUsd} noCap={wallet.noCap} />
        )}

        <GatesCard />

        {isLeader && wallet.members.length > 0 && (
          <MemberSubCaps
            members={wallet.members}
            onSaveSubCap={onSaveSubCap}
          />
        )}

        <ActivityFeed recent={wallet.recent} />

        {isLeader && onOpenPortal && (
          <StripePortalLink onOpenPortal={onOpenPortal} />
        )}
      </Stack>
    </div>
  );
};

export default Payg;

// Convenience exports for the config nav to render either variant directly.
export interface PaygLeaderProps {
  /** See {@link PaygProps#wallet}. */
  wallet: Wallet;
  /** See {@link PaygProps#onSaveCap}. */
  onSaveCap?: (capUsd: number | null) => Promise<void> | void;
  /** See {@link PaygProps#onSaveSubCap}. */
  onSaveSubCap?: (
    userId: string,
    capUnits: number | null,
  ) => Promise<SubCapUpdateResult>;
  /** See {@link PaygProps#onOpenPortal}. */
  onOpenPortal?: () => Promise<void>;
}
export const PaygLeader: React.FC<PaygLeaderProps> = ({
  wallet,
  onSaveCap,
  onSaveSubCap,
  onOpenPortal,
}) => (
  <Payg
    role="LEADER"
    wallet={wallet}
    onSaveCap={onSaveCap}
    onSaveSubCap={onSaveSubCap}
    onOpenPortal={onOpenPortal}
  />
);
export const PaygMember: React.FC<{ wallet: Wallet }> = ({ wallet }) => (
  <Payg role="MEMBER" wallet={wallet} />
);
