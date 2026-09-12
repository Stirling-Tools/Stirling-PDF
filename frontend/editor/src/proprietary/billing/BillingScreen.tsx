import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@app/ui";
import { formatMinor } from "@app/billing/format";
import { KvRow } from "@app/billing/KvRow";
import { TeamPlanRow } from "@app/billing/TeamPlanRow";
import { ProcessorPlanRow } from "@app/billing/ProcessorPlanRow";
import type { Wallet } from "@app/billing/types";
import "@app/billing/billing-screen.css";

export interface BillingScreenProps {
  /**
   * Null while loading, or when the host could not read one. A non-null wallet must be complete:
   * the sections dereference its fields without guards, so a hand-built partial object throws
   * rather than rendering a blank row.
   */
  wallet: Wallet | null;
  loading?: boolean;
  /** Self-hosted phrases its free tier differently. */
  selfHosted?: boolean;
  /** Units a linked instance has accrued that the cloud has not billed yet. */
  pendingUnits?: number;
  /** Leader-only: sells Team capacity from the Users row. */
  onAddCapacity?: () => void;
  /** Leader-only: switches the Processor on from its row. */
  onActivateProcessor?: () => void;
  /** Overrides activation with a quote or invoice resume action. */
  activateLabel?: ReactNode;
  /** Leader-only: opens the spend limit from the Processor row once it is on. */
  onGovernSpend?: () => void;
  /** Overrides the governing door's label, e.g. "Top up" for a prepaid team. */
  governLabel?: ReactNode;
  /** Banners above the card: a lapsed session, a failed wallet read. Host-owned. */
  notices?: ReactNode;
  /** An existing deal stays above the plan, even when the wallet cannot be loaded. */
  procurementSection?: ReactNode;
  /** Local server license management, supplied only by self-hosted admin views. */
  licenseSection?: ReactNode;
  /** Omit where the edition has no payment surface; the chip drops out with the section. */
  paymentSection?: ReactNode;
  /** Omit where there are no invoices, for the same reason. */
  invoicesSection?: ReactNode;
  /** Null when the backend cannot compute it, which omits the row rather than showing a zero. */
  editorsDeployed?: number | null;
  /** The enterprise door. Omitted for a team already on an agreement. */
  onEnterpriseQuote?: () => void;
  /** Host-owned surfaces that are not sections of this card: modals, upsells, detail cards. */
  extras?: ReactNode;
}

/** Inclusive day index within the billing period, and the period's length, from real dates. */
function cycleDay(
  start: string,
  end: string,
): { day: number; of: number } | null {
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null;
  const day = 24 * 60 * 60 * 1000;
  const of = Math.round((e - s) / day);
  const elapsed = Math.floor((Date.now() - s) / day) + 1;
  return { day: Math.min(Math.max(1, elapsed), of), of };
}

/**
 * The billing screen, one view for every edition.
 *
 * <p>Nothing here reaches for a router, an API client or a modal stack: the wallet, the actions
 * and the payment and invoice sections all arrive as props and slots. That is what lets one
 * component serve the cloud, self-hosted and the desktop app, and it makes a member's read-only
 * screen a matter of passing no callbacks rather than a role check.
 *
 * <p>A chip exists only where its section does, so an omitted slot removes both.
 */
export function BillingScreen({
  wallet,
  loading = false,
  selfHosted = false,
  pendingUnits = 0,
  onAddCapacity,
  onActivateProcessor,
  activateLabel,
  onGovernSpend,
  governLabel,
  notices,
  procurementSection,
  licenseSection,
  editorsDeployed,
  paymentSection,
  invoicesSection,
  onEnterpriseQuote,
  extras,
}: BillingScreenProps) {
  const { t } = useTranslation();

  const jump = useCallback((id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const paying = Boolean(wallet?.processor?.active);
  const teamHeld = Boolean(wallet?.team?.held);

  const chips = useMemo(() => {
    const out: Array<[string, string]> = [];
    if (procurementSection)
      out.push([
        "ub-procurement",
        t("portal.billing.chip.procurement", "Procurement"),
      ]);
    if (wallet) out.push(["ub-plan", t("portal.billing.chip.plan", "Plan")]);
    if (wallet) out.push(["ub-usage", t("portal.billing.chip.usage", "Usage")]);
    if (wallet && paymentSection)
      out.push(["ub-pay", t("portal.billing.chip.payment", "Payment")]);
    if (wallet && invoicesSection)
      out.push(["ub-inv", t("portal.billing.chip.invoices", "Invoices")]);
    if (licenseSection)
      out.push([
        "ub-license",
        t("admin.settings.premium.inputMethod.text", "License Key"),
      ]);
    return out;
  }, [
    wallet,
    procurementSection,
    licenseSection,
    paymentSection,
    invoicesSection,
    t,
  ]);

  const identity = useMemo(() => {
    if (!wallet) return null;
    const rate = wallet.pricePerDocMinor;
    if (paying) {
      return {
        name: t("portal.billing.identity.processor.name", "Processor"),
        sub:
          rate != null
            ? t(
                "portal.billing.identity.processor.sub",
                "Team base plus {{rate}} per credit",
                {
                  rate: formatMinor(rate, wallet.currency),
                },
              )
            : t(
                "portal.billing.identity.processor.subNoRate",
                "Team base plus metered processing",
              ),
        chips: [
          t(
            "portal.billing.identity.processor.chipMetered",
            "Metered processing",
          ),
          t(
            "portal.billing.identity.processor.chipPipelines",
            "Pipelines & API",
          ),
        ],
      };
    }
    if (teamHeld) {
      return {
        name: t("portal.billing.identity.team.name", "Team"),
        sub:
          wallet.team.licensedUsers != null
            ? t("portal.billing.identity.team.sub", "Up to {{users}} users", {
                users: wallet.team.licensedUsers.toLocaleString(),
              })
            : t("portal.billing.identity.team.subNoLimit", "No user limit"),
        chips: [
          t("portal.billing.identity.team.chipSso", "SSO"),
          t("portal.billing.identity.team.chipFleet", "Fleet control"),
        ],
      };
    }
    return {
      name: t("portal.billing.identity.free.name", "Free"),
      sub: t("portal.billing.identity.free.sub", "The full PDF Editor."),
      chips: [
        t("portal.billing.identity.free.chipTools", "Every PDF tool"),
        t(
          "portal.billing.identity.free.chipAnywhere",
          "Web, desktop & self-hosted",
        ),
        t(
          "portal.billing.identity.free.chipCredits",
          "{{allowance}} free credits monthly",
          {
            allowance: wallet.freeAllowance.toLocaleString(),
          },
        ),
      ],
    };
  }, [wallet, paying, teamHeld, t]);

  // One rule for the whole screen: a linked instance's locally-accrued units are real spend the
  // cloud has not billed yet, so every figure counts them. Showing some totals with and some
  // without is what leaves two numbers on one page and no way to reconcile them. The server
  // cannot do this itself -- it has not seen these units -- so the fold happens here, once.
  const rate = wallet?.pricePerDocMinor ?? null;
  const creditUnits = (wallet?.spendUnitsThisPeriod ?? 0) + pendingUnits;
  // A host with no user figures at all -- an unlinked instance whose admin endpoint refused -- has
  // nothing true to put in this row, and "0 users" is not nothing, it is wrong.
  const showTeam = Boolean(
    wallet &&
    (wallet.team.held ||
      wallet.team.usersInUse > 0 ||
      wallet.freeUserAllowance > 0),
  );
  const pendingMinor = rate != null ? pendingUnits * rate : 0;
  const estimatedMinor =
    wallet?.estimatedBillMinor != null
      ? wallet.estimatedBillMinor + pendingMinor
      : null;

  const cycle = wallet
    ? cycleDay(wallet.billingPeriodStart, wallet.billingPeriodEnd)
    : null;

  return (
    <div className="billing-page">
      <header className="billing-page__head">
        <h1 className="billing-page__title">
          {t("portal.usage.title", "Usage & Billing")}
        </h1>
        <p className="billing-page__subtitle">
          {t(
            "portal.usage.subtitle",
            "Your plan, your usage, and every invoice.",
          )}
        </p>
      </header>

      <div className="billing-page__body">
        <div className="billing-page__notices">{notices}</div>

        {loading && !wallet && (
          <div aria-hidden>
            <Skeleton height="12rem" />
          </div>
        )}

        {(procurementSection || licenseSection || (wallet && identity)) && (
          <div className="billing-card">
            <nav
              className="billing-card__chips"
              aria-label={t("portal.billing.chip.nav", "Sections")}
            >
              {chips.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="billing-card__chip"
                  onClick={() => jump(id)}
                >
                  {label}
                </button>
              ))}
            </nav>

            {procurementSection && (
              <section
                id="ub-procurement"
                className="billing-sec billing-sec--procurement"
                aria-label={t("portal.billing.chip.procurement", "Procurement")}
              >
                {procurementSection}
              </section>
            )}

            {wallet && identity && (
              <>
                <section id="ub-plan" className="billing-sec">
                  <span className="billing-eyebrow">
                    {t("portal.billing.section.plan", "Your plan")}
                  </span>
                  <div className="billing-id">
                    <span className="billing-id__name">{identity.name}</span>
                    <span className="billing-id__sub">{identity.sub}</span>
                  </div>
                  <div className="billing-id__chips">
                    {identity.chips.map((c) => (
                      <span key={c} className="billing-id__chip">
                        {c}
                      </span>
                    ))}
                  </div>
                  <div className="billing-meters">
                    {showTeam && (
                      <TeamPlanRow
                        wallet={wallet}
                        selfHosted={selfHosted}
                        onAddCapacity={onAddCapacity}
                      />
                    )}
                    {wallet.processor && (
                      <ProcessorPlanRow
                        wallet={wallet}
                        pendingUnits={pendingUnits}
                        onActivate={onActivateProcessor}
                        activateLabel={activateLabel}
                        onGovern={onGovernSpend}
                        governLabel={governLabel}
                      />
                    )}
                  </div>
                </section>

                <section id="ub-usage" className="billing-sec">
                  <div className="billing-eyebrow-row">
                    <span className="billing-eyebrow">
                      {t("portal.billing.section.cycle", "This cycle")}
                    </span>
                    {cycle && (
                      <span className="billing-eyebrow-row__fact">
                        {t(
                          "portal.billing.cycle.day",
                          "Day {{day}} of {{of}}",
                          {
                            day: cycle.day,
                            of: cycle.of,
                          },
                        )}
                      </span>
                    )}
                  </div>

                  {/* The bill leads only once there is a bill. On the free tier the estimate is zero
                  by definition, and a zero hero would read as a figure rather than as a state. */}
                  {paying && estimatedMinor != null && (
                    <div className="billing-bignum-row">
                      <span className="billing-bignum">
                        {formatMinor(estimatedMinor, wallet.currency)}
                      </span>
                      <span className="billing-bignum__note">
                        {pendingUnits > 0
                          ? t(
                              "portal.billing.cycle.estimatedPending",
                              "estimated · includes {{pending}} not yet synced from your instances",
                              { pending: pendingUnits.toLocaleString() },
                            )
                          : t(
                              "portal.billing.cycle.estimated",
                              "estimated · the meter settles at close",
                            )}
                      </span>
                    </div>
                  )}

                  <KvRow
                    label={t("portal.billing.cycle.pdfs", "PDFs processed")}
                    value={wallet.docsProcessedThisPeriod.toLocaleString()}
                  />
                  {showTeam && (
                    <KvRow
                      label={t("portal.billing.cycle.users", "Users")}
                      value={wallet.team.usersInUse.toLocaleString()}
                    />
                  )}
                  {editorsDeployed != null && (
                    <KvRow
                      label={t(
                        "portal.billing.cycle.editors",
                        "Editors deployed",
                      )}
                      value={editorsDeployed.toLocaleString()}
                    />
                  )}
                  {paying && (
                    <KvRow
                      label={t("portal.billing.cycle.credits", "Credits")}
                      note={
                        wallet.pricePerDocMinor != null
                          ? t(
                              "portal.billing.cycle.creditsNote",
                              "{{units}} · {{rate}} each",
                              {
                                units: creditUnits.toLocaleString(),
                                rate: formatMinor(
                                  wallet.pricePerDocMinor,
                                  wallet.currency,
                                ),
                              },
                            )
                          : undefined
                      }
                      value={
                        wallet.pricePerDocMinor != null
                          ? formatMinor(
                              creditUnits * wallet.pricePerDocMinor,
                              wallet.currency,
                            )
                          : creditUnits.toLocaleString()
                      }
                    />
                  )}
                  {wallet.sizeMultiplierPdfsThisPeriod > 0 && (
                    <KvRow
                      label={t(
                        "portal.billing.cycle.largeFiles",
                        "Large files",
                      )}
                      value={t(
                        "portal.billing.cycle.largeFilesValue",
                        "{{pdfs}} PDFs past the size threshold",
                        {
                          pdfs: wallet.sizeMultiplierPdfsThisPeriod.toLocaleString(),
                        },
                      )}
                    />
                  )}
                </section>

                {paymentSection && (
                  <section id="ub-pay" className="billing-sec">
                    <span className="billing-eyebrow">
                      {t("portal.billing.section.payment", "Payment")}
                    </span>
                    {paymentSection}
                  </section>
                )}

                {invoicesSection && (
                  <section id="ub-inv" className="billing-sec">
                    <span className="billing-eyebrow">
                      {t("portal.billing.section.invoices", "Invoices")}
                    </span>
                    {invoicesSection}
                  </section>
                )}
              </>
            )}
            {licenseSection && (
              <section
                id="ub-license"
                className="billing-sec billing-sec--license"
                aria-label={t(
                  "admin.settings.premium.inputMethod.text",
                  "License Key",
                )}
              >
                {licenseSection}
              </section>
            )}
          </div>
        )}

        {onEnterpriseQuote && (
          <div className="billing-ent">
            <div>
              <div className="billing-ent__title">
                {t(
                  "portal.billing.enterprise.title",
                  "Running Stirling in a regulated environment?",
                )}
              </div>
              <div className="billing-ent__sub">
                {t(
                  "portal.billing.enterprise.sub",
                  "Air-gapped deployment, SCIM, data residency, uptime SLAs, and an agreement to match.",
                )}
              </div>
            </div>
            <button
              type="button"
              className="billing-ent__cta"
              onClick={onEnterpriseQuote}
            >
              {t("portal.billing.enterprise.cta", "Get an enterprise quote")}
            </button>
          </div>
        )}

        {extras}
      </div>
    </div>
  );
}
