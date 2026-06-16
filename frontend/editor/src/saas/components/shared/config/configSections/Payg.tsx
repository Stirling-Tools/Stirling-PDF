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
 *     stripe.prices via Sync Engine and are deliberately absent until that
 *     ships
 *   - the activity feed renders {@code wallet.recent}, which is {@code []} in
 *     V1 — so it shows a real empty state, not fabricated rows
 */
import React, { useState } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { useRenderCount } from "@app/hooks/useRenderCount";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LockIcon from "@mui/icons-material/LockOutlined";
import CheckIcon from "@mui/icons-material/CheckRounded";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlineRounded";
import ExpandMoreIcon from "@mui/icons-material/ExpandMoreRounded";
import BoltIcon from "@mui/icons-material/BoltRounded";
import AllInclusiveIcon from "@mui/icons-material/AllInclusiveRounded";
import { alert as showToast } from "@app/components/toast";
// Relative (not @app/*) so the co-located CSS + sibling component resolve directly.
// eslint-disable-next-line no-restricted-imports
import "./Payg.css";
// eslint-disable-next-line no-restricted-imports
import SpendCapControl from "./SpendCapControl";
import { useTranslation } from "react-i18next";
import type { Wallet } from "@app/hooks/useWallet";

// ─── Types ────────────────────────────────────────────────────────────────

type Gate = "OFFSITE_PROCESSING" | "AUTOMATION" | "AI_SUPPORT" | "CLIENT_SIDE";

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

// ─── "What counts as a document?" help ──────────────────────────────────────

/**
 * Expandable explainer for the billing unit. Shared by the subscribed hero
 * here and the free-tier hero in {@code PaygFree.tsx}. The bullets state the
 * real charge mechanics (DefaultDocumentClassifier + JobChargeService)
 * without hardcoding the policy-tunable thresholds: each non-empty file is
 * at least one document; page count / file size can make it more; chained
 * steps on the same file join the open process instead of re-charging; a
 * first-step failure writes a compensating refund.
 */
export function DocHelp() {
  const { t } = useTranslation();
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
        {t("payg.docHelp.toggle", "What counts as a PDF?")}
        <ExpandMoreIcon className="payg-help__chevron" sx={{ fontSize: 16 }} />
      </button>
      {open && (
        <div className="payg-help__panel">
          <ul>
            <li>
              {t(
                "payg.docHelp.billable",
                "Only automation runs, AI tools, and API calls count. Manual tools in the editor are always free.",
              )}
            </li>
            <li>
              {t(
                "payg.docHelp.perFile",
                "Each file you process counts as one PDF. Very long or very large files can count as more than one.",
              )}
            </li>
            <li>
              {t(
                "payg.docHelp.chains",
                "Running the same file through several steps of one automation counts it once, not once per step.",
              )}
            </li>
            <li>
              {t(
                "payg.docHelp.refunds",
                "If a job fails on its first step, the PDF is credited back automatically.",
              )}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Hero usage panel ───────────────────────────────────────────────────────

/**
 * Format minor units of an ISO currency for display ("$2.24", "£0.40"). Only
 * called when the backend resolved the rate — currency is always present
 * alongside a non-null money amount.
 */
function formatMinor(minor: number, currency: string | null): string {
  const code = (currency ?? "usd").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${code}`;
  }
}

/** Currency symbol for compact inline use; falls back to the ISO code. */
function currencySymbol(currency: string | null): string {
  switch ((currency ?? "").toLowerCase()) {
    case "usd":
      return "$";
    case "eur":
      return "€";
    case "gbp":
      return "£";
    default:
      return currency ? currency.toUpperCase() + " " : "$";
  }
}

/**
 * Usage hero — gradient panel with the allowance bar. Every number is real:
 * {@code billableUsed} is the ledger's period sum over the team's actual
 * billing window (the Stripe subscription period); {@code billableLimit} is
 * the backend-derived document ceiling (free allowance + what the money cap
 * buys at the subscription Price's per-document rate, null when uncapped);
 * {@code estimatedBillMinor} is spend beyond the allowance at that rate.
 * Fields the backend couldn't resolve are null and simply not rendered.
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

  const limit = wallet.billableLimit;
  const hasLimit = limit != null && limit > 0;
  const pct = hasLimit ? Math.min(100, (wallet.billableUsed / limit) * 100) : 0;
  const state = hasLimit
    ? pct >= 100
      ? "DEGRADED"
      : pct >= 80
        ? "WARNED"
        : "FULL"
    : "FULL";
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
              <span className="payg-hero__cap">
                {hasLimit
                  ? t(
                      "payg.usage.ofLimitProcessed",
                      "/ {{limit}} PDFs processed",
                      { limit: limit.toLocaleString() },
                    )
                  : t("payg.usage.processed", "PDFs processed")}
              </span>
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
            {t("payg.usage.firstFree", "First {{free}} free", {
              free: wallet.freeAllowance.toLocaleString(),
            })}
          </span>
          {wallet.estimatedBillMinor != null && (
            <>
              <span className="payg-hero__meta-dot">•</span>
              <span>
                {t("payg.usage.estBill", "≈ {{amount}} so far this period", {
                  amount: formatMinor(
                    wallet.estimatedBillMinor,
                    wallet.currency,
                  ),
                })}
              </span>
            </>
          )}
          <span className="payg-hero__meta-dot">•</span>
          <span>
            {hasCap
              ? t("payg.usage.capLine", "{{cap}}/mo cap", {
                  cap: `${currencySymbol(wallet.currency)}${wallet.capUsd}`,
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

        <div className="payg-hero__meta" style={{ marginTop: 6 }}>
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
        </div>

        <DocHelp />
      </div>
    </div>
  );
}

// ─── Cap editor ─────────────────────────────────────────────────────────────

interface CapEditorProps {
  /** Current cap in major currency units; null = no cap set. */
  capUsd: number | null;
  /** True when the leader explicitly disabled the cap. */
  noCap: boolean;
  /** Per-document rate in minor units; null when unknown — preview hides. */
  pricePerDocMinor: number | null;
  /** Currency of the rate; pairs with {@link CapEditorProps#pricePerDocMinor}. */
  currency: string | null;
  /**
   * Persist the cap change. Receives whole major units (matches the backend's
   * {@code PATCH /api/v1/payg/cap} body) or null for no-cap.
   */
  onSaveCap?: (capUsd: number | null) => Promise<void> | void;
}

/**
 * Single-row cap editor: the shared {@link SpendCapControl} (preset chips +
 * inline custom-entry pill + no-cap + inline Save) over a live "≈ N paid
 * PDFs/month" estimate, wrapped in the plan-page card chrome + the cap-reached
 * disclosure. Save-only — the working value is local, so abandoning the card
 * abandons the edit. The very same control drives the upgrade checkout flow.
 */
function CapEditor({
  capUsd,
  noCap,
  pricePerDocMinor,
  currency,
  onSaveCap,
}: CapEditorProps) {
  const { t } = useTranslation();
  const savedCap = noCap || capUsd == null ? null : capUsd;
  const [working, setWorking] = useState<number | null>(savedCap);

  return (
    <div className="payg-card">
      <Stack gap="sm">
        <div>
          <div className="payg-card__title">
            {t("payg.cap.title", "Monthly spending cap")}
          </div>
          <div className="payg-card__subtitle">
            {t(
              "payg.cap.subtitle",
              "The most your team can spend per month. Billable processing pauses at the cap and resumes next period.",
            )}
          </div>
        </div>

        <SpendCapControl
          capUsd={working}
          onChange={setWorking}
          pricePerDocMinor={pricePerDocMinor}
          currency={currency}
          savedCapUsd={savedCap}
          onSave={onSaveCap}
        />

        <CapReachedHelp />
      </Stack>
    </div>
  );
}

function CapReadOnly({
  capUsd,
  noCap,
}: {
  capUsd: number | null;
  noCap: boolean;
}) {
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

        <CapReachedHelp />
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

/**
 * Collapsed "what happens at the cap" disclosure rendered inside the cap
 * card(s) to save vertical space. Mirrors the {@link DocHelp} toggle pattern;
 * default-collapsed so it costs no height until the user opens it.
 */
function CapReachedHelp() {
  const { t } = useTranslation();
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
        {t("payg.gates.title", "What happens when the cap is reached")}
        <ExpandMoreIcon className="payg-help__chevron" sx={{ fontSize: 16 }} />
      </button>
      {open && (
        <div className="payg-help__panel">
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
        </div>
      )}
    </div>
  );
}

// ─── Per-member usage ────────────────────────────────────────────────────────

/**
 * Leader-only roster of each teammate's billable usage this period. Display-only — per-member
 * sub-cap enforcement isn't shipped, so there's no cap control here.
 */
function MemberUsage({ members }: { members: Wallet["members"] }) {
  const { t } = useTranslation();
  return (
    <div className="payg-card">
      <Stack gap="sm">
        <div>
          <div className="payg-card__title">
            {t("payg.members.title", "Team member usage")}
          </div>
          <div className="payg-card__subtitle">
            {t(
              "payg.members.subtitle",
              "Billable PDFs each teammate has processed this period.",
            )}
          </div>
        </div>
        <div>
          {members.map((m) => (
            <div className="payg-member" key={m.userId}>
              <span
                className="payg-member__avatar"
                style={{ background: avatarColor(m.userId) }}
              >
                {m.name.charAt(0).toUpperCase()}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="payg-member__name">{m.name}</div>
                <div className="payg-member__email">{m.email}</div>
              </div>
              <div className="payg-member__usage">
                <div className="payg-member__usage-num">
                  {m.spendUnits.toLocaleString()}{" "}
                  <Text span size="xs" c="dimmed">
                    {t("payg.members.docs", "PDFs")}
                  </Text>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Stack>
    </div>
  );
}

// ─── Activity feed ──────────────────────────────────────────────────────────

/**
 * Feature flag — the activity feed is hidden until the meter-event surface is
 * built and polished (Wave 2). The backend returns {@code []} today, so an
 * unpolished "No billable activity yet" card adds nothing. Flip to {@code true}
 * once {@code wallet.recent} carries real rows. Kept as a flag (not deleted) so
 * the renderer below stays wired and ready.
 */
const SHOW_ACTIVITY_FEED = false;

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
            {t("payg.activity.empty", "No billable activity yet this period.")}
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
                  {String(r.docUnits ?? 0)} {t("payg.activity.docs", "docs")}
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

function StripePortalLink({
  onOpenPortal,
}: {
  onOpenPortal: () => Promise<void>;
}) {
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
      <Stack gap="md">
        {/* The modal chrome already renders the section title ("Billing &
            usage"), so we lead with the descriptive subtitle + role pill. */}
        <div className="payg-planhead">
          <div className="payg-planhead__top">
            <span className="payg-planhead__eyebrow">
              {t(
                "payg.header.eyebrow",
                "Processor plan · {{start}} – {{end}}",
                {
                  start: fmt(wallet.billingPeriodStart),
                  end: fmt(wallet.billingPeriodEnd),
                },
              )}
            </span>
            <span className="payg-role-pill" data-leader={isLeader}>
              {isLeader
                ? t("payg.role.leader", "Team owner")
                : t("payg.role.member", "Member")}
            </span>
          </div>

          <div className="payg-planhead__split">
            <div className="payg-planhead__col">
              <div className="payg-planhead__lbl payg-planhead__lbl--free">
                <AllInclusiveIcon
                  className="payg-planhead__lbl-icon"
                  fontSize="small"
                />
                {t("payg.header.freeLabel", "Always free")}
              </div>
              <p className="payg-planhead__title">
                {t("payg.header.freeTitle", "Unlimited PDF editing")}
              </p>
              <p className="payg-planhead__body">
                {t(
                  "payg.header.freeBody",
                  "View, edit, merge, split, sign, watermark, compress, convert and manual OCR, as much as you want, no matter where you trigger it.",
                )}
              </p>
            </div>

            <div className="payg-planhead__col payg-planhead__col--meter">
              <div className="payg-planhead__lbl payg-planhead__lbl--meter">
                <BoltIcon
                  className="payg-planhead__lbl-icon"
                  fontSize="small"
                />
                {t("payg.header.meterLabel", "Metered")}
              </div>
              <p className="payg-planhead__title">
                {t("payg.header.meterTitle", "Automation · AI · API")}
              </p>
              <p className="payg-planhead__body">
                {t(
                  "payg.header.meterBody",
                  "{{limit}} free PDFs to start, then billed per PDF up to your cap.",
                  { limit: wallet.freeAllowance.toLocaleString() },
                )}
              </p>
            </div>
          </div>
        </div>

        <UsageHero wallet={wallet} />

        {isLeader ? (
          <CapEditor
            capUsd={wallet.capUsd}
            noCap={wallet.noCap}
            pricePerDocMinor={wallet.pricePerDocMinor}
            currency={wallet.currency}
            onSaveCap={onSaveCap}
          />
        ) : (
          <CapReadOnly capUsd={wallet.capUsd} noCap={wallet.noCap} />
        )}

        {isLeader && wallet.members.length > 0 && (
          <MemberUsage members={wallet.members} />
        )}

        {SHOW_ACTIVITY_FEED && <ActivityFeed recent={wallet.recent} />}

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
  /** See {@link PaygProps#onOpenPortal}. */
  onOpenPortal?: () => Promise<void>;
}
export const PaygLeader: React.FC<PaygLeaderProps> = ({
  wallet,
  onSaveCap,
  onOpenPortal,
}) => (
  <Payg
    role="LEADER"
    wallet={wallet}
    onSaveCap={onSaveCap}
    onOpenPortal={onOpenPortal}
  />
);
export const PaygMember: React.FC<{ wallet: Wallet }> = ({ wallet }) => (
  <Payg role="MEMBER" wallet={wallet} />
);
