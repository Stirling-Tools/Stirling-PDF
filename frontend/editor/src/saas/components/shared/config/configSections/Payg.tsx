/**
 * Pay-as-you-go billing & usage section.
 *
 * Design mockup for the PAYG settings screen. Mocked data, no backend wiring.
 * Mirrors the framework in docs/PAYG design review:
 *   - doc units as the billing unit (max(pages/25, bytes/10MB))
 *   - customer sets cap in their own currency, backend translates to units
 *     via POST /api/v1/payg/cap-preview
 *   - wallet_policy fields: cap_units, cap_source_money, cap_source_currency,
 *     warn_at_pct (default 80), degrade_at_pct (default 100)
 *   - states: FULL → WARNED (80%) → DEGRADED (100%)
 *   - gates: OFFSITE_PROCESSING, AUTOMATION, AI_SUPPORT, CLIENT_SIDE
 *   - per-member sub-caps
 */
import React, { useMemo, useState } from "react";
import { Button, Group, NumberInput, Select, Stack, Text } from "@mantine/core";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LockIcon from "@mui/icons-material/LockOutlined";
import CheckIcon from "@mui/icons-material/CheckRounded";
import BoltIcon from "@mui/icons-material/BoltRounded";
import LocalIcon from "@app/components/shared/LocalIcon";
// Relative (not @app/*) so the co-located CSS resolves directly.
// eslint-disable-next-line no-restricted-imports
import "./Payg.css";
import { useTranslation } from "react-i18next";

// ─── Types ────────────────────────────────────────────────────────────────

type WalletState = "FULL" | "WARNED" | "DEGRADED";
type Gate = "OFFSITE_PROCESSING" | "AUTOMATION" | "AI_SUPPORT" | "CLIENT_SIDE";

interface MemberSubCap {
  userId: string;
  name: string;
  email: string;
  capUnits: number | null; // null = no sub-cap
  spendUnits: number;
}

interface RecentProcess {
  id: string;
  ts: string;
  label: string;
  // Only billable categories appear in the feed — everyday tools are free.
  kind: "ai" | "automation";
  docUnits: number;
}

interface PaygSnapshot {
  billingPeriodStart: string; // ISO date
  billingPeriodEnd: string;
  spendUnits: number;
  capUnits: number;
  capSourceMoney: number; // minor units (cents)
  capSourceCurrency: string;
  /**
   * Account credit in minor units — residual bought-credits / user_credits
   * migrated to a positive ledger ADJUSTMENT that offsets future debits
   * (design doc §11-Q8). 0 when the team has none.
   */
  accountCreditMoney: number;
  warnAtPct: number;
  degradeAtPct: number;
  state: WalletState;
  enabledGates: Gate[];
  members: MemberSubCap[];
  recent: RecentProcess[];
  stripePortalUrl: string;
}

interface PaygProps {
  role: "LEADER" | "MEMBER";
}

// ─── Mock data hook (replace with real API later) ─────────────────────────

function usePaygMock(role: PaygProps["role"]): PaygSnapshot {
  return useMemo(() => {
    const capUnits = 2500;
    const spendUnits = 312;
    const pct = (spendUnits / capUnits) * 100;
    const state: WalletState =
      pct >= 100 ? "DEGRADED" : pct >= 80 ? "WARNED" : "FULL";
    // Period dates relative to today so the demo doesn't show "Resets in 0 days".
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const isoDay = (d: Date) => d.toISOString().slice(0, 10);
    return {
      billingPeriodStart: isoDay(periodStart),
      billingPeriodEnd: isoDay(periodEnd),
      spendUnits,
      capUnits,
      capSourceMoney: 5000,
      capSourceCurrency: "USD",
      accountCreditMoney: 1200,
      warnAtPct: 80,
      degradeAtPct: 100,
      state,
      enabledGates:
        state === "DEGRADED"
          ? ["CLIENT_SIDE"]
          : ["OFFSITE_PROCESSING", "AUTOMATION", "AI_SUPPORT", "CLIENT_SIDE"],
      members:
        role === "LEADER"
          ? [
              {
                userId: "u1",
                name: "Alice",
                email: "alice@example.com",
                capUnits: null,
                spendUnits: 184,
              },
              {
                userId: "u2",
                name: "Bob",
                email: "bob@example.com",
                capUnits: 500,
                spendUnits: 128,
              },
              {
                userId: "u3",
                name: "Carol",
                email: "carol@example.com",
                capUnits: null,
                spendUnits: 0,
              },
            ]
          : [],
      recent: [
        {
          id: "p1",
          ts: "Today 14:32",
          label: "AI Create — contract summary",
          kind: "ai",
          docUnits: 8,
        },
        {
          id: "p2",
          ts: "Today 11:20",
          label: "Auto-redaction pipeline",
          kind: "automation",
          docUnits: 12,
        },
        {
          id: "p3",
          ts: "Yesterday",
          label: "AI-OCR — scanned batch",
          kind: "ai",
          docUnits: 15,
        },
        {
          id: "p4",
          ts: "2 days ago",
          label: "Nightly compress automation",
          kind: "automation",
          docUnits: 6,
        },
      ],
      stripePortalUrl: "https://billing.stripe.com/p/login/mock",
    };
  }, [role]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  CNY: "¥",
  INR: "₹",
};

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

function formatMoney(minor: number, currency: string): string {
  const major = minor / 100;
  const sym = CURRENCY_SYMBOL[currency] ?? "";
  return `${sym}${major.toFixed(2)}`;
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

function UsageHero({ snap }: { snap: PaygSnapshot }) {
  const { t } = useTranslation();
  const pct = Math.min(100, (snap.spendUnits / snap.capUnits) * 100);
  const stateLabel = {
    FULL: t("payg.state.full", "Healthy"),
    WARNED: t("payg.state.warned", "Approaching cap"),
    DEGRADED: t("payg.state.degraded", "Cap reached"),
  }[snap.state];

  const periodEnd = new Date(snap.billingPeriodEnd);
  const daysLeft = Math.max(
    0,
    Math.ceil((periodEnd.getTime() - Date.now()) / 86_400_000),
  );

  return (
    <div className="payg-hero" data-state={snap.state}>
      <div className="payg-hero__inner">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div>
            <div className="payg-hero__eyebrow">
              {t("payg.usage.thisPeriod", "This billing period")}
            </div>
            <div className="payg-hero__figure">
              <span className="payg-hero__spend">
                {snap.spendUnits.toLocaleString()}
              </span>
              <span className="payg-hero__cap">
                / {snap.capUnits.toLocaleString()}{" "}
                {t("payg.usage.docs", "documents")}
              </span>
            </div>
          </div>
          <div className="payg-status" data-state={snap.state}>
            <span className="payg-status__dot" />
            {stateLabel}
          </div>
        </Group>

        <div className="payg-bar">
          <div
            className="payg-bar__fill"
            data-state={snap.state}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="payg-hero__meta">
          <span>
            {t("payg.usage.spent", "{{spend}} of {{cap}} used", {
              spend: formatMoney(
                (snap.capSourceMoney * snap.spendUnits) / snap.capUnits,
                snap.capSourceCurrency,
              ),
              cap: formatMoney(snap.capSourceMoney, snap.capSourceCurrency),
            })}
          </span>
          <span className="payg-hero__meta-dot">•</span>
          <span>
            {daysLeft === 1
              ? t("payg.usage.resetsTomorrow", "Resets tomorrow")
              : t("payg.usage.resetsIn", "Resets in {{days}} days", {
                  days: daysLeft,
                })}
          </span>
          {snap.accountCreditMoney > 0 && (
            <span className="payg-hero__credit">
              {t("payg.usage.credit", "{{amount}} account credit", {
                amount: formatMoney(
                  snap.accountCreditMoney,
                  snap.capSourceCurrency,
                ),
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Cap editor ─────────────────────────────────────────────────────────────

function CapEditor({ snap }: { snap: PaygSnapshot }) {
  const { t } = useTranslation();
  // Local edit state — real impl would call POST /api/v1/payg/cap-preview on change
  const [money, setMoney] = useState<number>(snap.capSourceMoney / 100);
  const [currency, setCurrency] = useState<string>(snap.capSourceCurrency);
  const [warnAt, setWarnAt] = useState<number>(snap.warnAtPct);
  const [degradeAt, setDegradeAt] = useState<number>(snap.degradeAtPct);

  // Mock preview — real impl reads stripe.prices.tiers via Sync Engine
  const previewUnits = Math.round(
    (money * 100 * snap.capUnits) / snap.capSourceMoney,
  );
  const dirty =
    money !== snap.capSourceMoney / 100 ||
    currency !== snap.capSourceCurrency ||
    warnAt !== snap.warnAtPct ||
    degradeAt !== snap.degradeAtPct;

  return (
    <div className="payg-card">
      <Stack gap="lg">
        <div>
          <div className="payg-card__title">
            {t("payg.cap.title", "Monthly spending cap")}
          </div>
          <div className="payg-card__subtitle">
            {t(
              "payg.cap.subtitle",
              "Set your maximum spend. We convert this to documents using the current price tier.",
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
            decimalScale={2}
            fixedDecimalScale
            prefix={CURRENCY_SYMBOL[currency] ?? ""}
            size="md"
            style={{ flex: 1 }}
          />
          <Select
            label={t("payg.cap.currency", "Currency")}
            value={currency}
            onChange={(v) => setCurrency(v ?? "USD")}
            // V1 launch currencies per design doc §11-Q9 (USD/EUR/GBP).
            // Adding a fourth is one Stripe Price + a config update, no code change.
            data={[
              { value: "USD", label: "USD ($)" },
              { value: "EUR", label: "EUR (€)" },
              { value: "GBP", label: "GBP (£)" },
            ]}
            size="md"
            w={150}
          />
          <Text size="sm" pb={10} c="dimmed">
            {t("payg.cap.perMonth", "/ month")}
          </Text>
        </Group>

        <div className="payg-preview">
          <span className="payg-preview__icon">
            <BoltIcon sx={{ fontSize: 20 }} />
          </span>
          <div>
            <div className="payg-preview__main">
              {t(
                "payg.cap.preview",
                "{{money}} ≈ {{units}} documents per month",
                {
                  money: `${CURRENCY_SYMBOL[currency] ?? ""}${money.toFixed(2)}`,
                  units: previewUnits.toLocaleString(),
                },
              )}
            </div>
            <div className="payg-preview__note">
              {t(
                "payg.cap.previewNote",
                "At current pricing. Final translation happens server-side on save.",
              )}
            </div>
          </div>
        </div>

        <Group grow align="flex-start">
          <NumberInput
            label={t("payg.cap.warnAt", "Warn me at")}
            description={t(
              "payg.cap.warnAtDesc",
              "Notify when usage crosses this threshold.",
            )}
            value={warnAt}
            onChange={(v) => setWarnAt(typeof v === "number" ? v : 80)}
            min={0}
            max={100}
            suffix=" %"
          />
          <NumberInput
            label={t("payg.cap.degradeAt", "Limit spend at")}
            description={t(
              "payg.cap.degradeAtDesc",
              "Set below 100% to leave yourself headroom.",
            )}
            value={degradeAt}
            onChange={(v) => setDegradeAt(typeof v === "number" ? v : 100)}
            min={Math.max(1, warnAt)}
            max={100}
            suffix=" %"
          />
        </Group>

        <Group justify="flex-end" gap="sm">
          <Button
            variant="default"
            size="xs"
            disabled={!dirty}
            onClick={() => {
              setMoney(snap.capSourceMoney / 100);
              setCurrency(snap.capSourceCurrency);
              setWarnAt(snap.warnAtPct);
              setDegradeAt(snap.degradeAtPct);
            }}
          >
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            variant="default"
            size="xs"
            disabled={!dirty}
            leftSection={<LocalIcon icon="check-rounded" />}
          >
            {t("payg.cap.save", "Update cap")}
          </Button>
        </Group>
      </Stack>
    </div>
  );
}

function CapReadOnly({ snap }: { snap: PaygSnapshot }) {
  const { t } = useTranslation();
  return (
    <div className="payg-card">
      <Stack gap="sm">
        <div className="payg-card__title">
          {t("payg.cap.title", "Monthly spending cap")}
        </div>
        <Group gap="xs" align="baseline">
          <Text fz={28} fw={750} lh={1}>
            {formatMoney(snap.capSourceMoney, snap.capSourceCurrency)}
          </Text>
          <Text c="dimmed">{t("payg.cap.perMonth", "/ month")}</Text>
        </Group>
        <Text size="sm" c="dimmed">
          {t(
            "payg.cap.previewShort",
            "≈ {{units}} documents per month at current pricing.",
            { units: snap.capUnits.toLocaleString() },
          )}
        </Text>
        <div className="payg-preview" style={{ marginTop: 6 }}>
          <div>
            <div className="payg-preview__main">
              {t(
                "payg.member.askLeader",
                "Only your team owner can change the cap.",
              )}
            </div>
            <Button mt={8} size="xs" variant="light">
              {t("payg.member.contactLeader", "Ask team owner to raise cap")}
            </Button>
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

function MemberSubCaps({ snap }: { snap: PaygSnapshot }) {
  const { t } = useTranslation();
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
          {snap.members.map((m) => {
            const subPct =
              m.capUnits && m.capUnits > 0
                ? Math.min(100, (m.spendUnits / m.capUnits) * 100)
                : null;
            return (
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
                    {m.spendUnits.toLocaleString()}
                    {m.capUnits !== null ? (
                      <> / {m.capUnits.toLocaleString()}</>
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
                <Button size="xs" variant="default">
                  {m.capUnits === null
                    ? t("payg.member.setCap", "Set cap")
                    : t("payg.member.editCap", "Edit")}
                </Button>
              </div>
            );
          })}
        </div>
      </Stack>
    </div>
  );
}

// ─── Activity feed ──────────────────────────────────────────────────────────

function ActivityFeed({ snap }: { snap: PaygSnapshot }) {
  const { t } = useTranslation();
  return (
    <div className="payg-card">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <div style={{ flex: 1, minWidth: 0 }}>
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
          <Button variant="default" size="xs" style={{ flexShrink: 0 }}>
            {t("payg.activity.viewAll", "View all")}
          </Button>
        </Group>
        <div>
          {snap.recent.map((r) => (
            <div className="payg-activity-row" key={r.id}>
              <span className="payg-activity__dot" data-kind={r.kind} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="payg-activity__label">{r.label}</div>
                <div className="payg-activity__ts">{r.ts}</div>
              </div>
              <span className="payg-activity__kind">{r.kind}</span>
              <span className="payg-activity__units">
                {r.docUnits} {t("payg.activity.units", "units")}
              </span>
            </div>
          ))}
        </div>
      </Stack>
    </div>
  );
}

// ─── Stripe CTA ──────────────────────────────────────────────────────────────

function StripePortalLink({ snap }: { snap: PaygSnapshot }) {
  const { t } = useTranslation();
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
        component="a"
        href={snap.stripePortalUrl}
        target="_blank"
        rel="noopener noreferrer"
        rightSection={<OpenInNewIcon sx={{ fontSize: 16 }} />}
        variant="light"
      >
        {t("payg.stripe.open", "Open billing portal")}
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

const Payg: React.FC<PaygProps> = ({ role }) => {
  const { t } = useTranslation();
  const snap = usePaygMock(role);
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
                start: fmt(snap.billingPeriodStart),
                end: fmt(snap.billingPeriodEnd),
              },
            )}
          </div>
          <span className="payg-role-pill" data-leader={isLeader}>
            {isLeader
              ? t("payg.role.leader", "Team owner")
              : t("payg.role.member", "Member")}
          </span>
        </Group>

        <UsageHero snap={snap} />

        {isLeader ? <CapEditor snap={snap} /> : <CapReadOnly snap={snap} />}

        <GatesCard />

        {isLeader && snap.members.length > 0 && <MemberSubCaps snap={snap} />}

        <ActivityFeed snap={snap} />

        {isLeader && <StripePortalLink snap={snap} />}
      </Stack>
    </div>
  );
};

export default Payg;

// Convenience exports for the config nav to render either variant directly.
export const PaygLeader: React.FC = () => <Payg role="LEADER" />;
export const PaygMember: React.FC = () => <Payg role="MEMBER" />;
