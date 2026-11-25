import { Icon } from "@editor/ui/Icon";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui";
import {
  FLOW_JOURNEY,
  type DealStage,
  type ProcurementSnapshot,
} from "@processor/api/procurement";
import {
  daysLeft,
  trialLeftLabel,
} from "@processor/components/procurement/format";
import "@processor/theme/surface.css";
import "@processor/views/Procurement.css";

/** What each stage asks of the buyer, read out in the stage sentence. */
const STAGE_SENTENCE: Record<DealStage, string> = {
  // Exploring sits on the Trial rung: same sentence, since the ask is what differs.
  exploring: "portal.procurement.hero.sentenceTrial",
  trial: "portal.procurement.hero.sentenceTrial",
  quote: "portal.procurement.hero.sentenceQuote",
  security: "portal.procurement.hero.sentenceAgreement",
  procurement: "portal.procurement.hero.sentencePayment",
  active: "portal.procurement.hero.sentenceLive",
};

/**
 * Where a deal stands, as a progress band and a stage sentence, with one way into the Enterprise
 * page where every step of it is taken. Shown wherever billing is, so a deal underway is never
 * more than a click from its next action.
 */
export function DealStatusHero({
  snapshot,
  onOpen,
}: {
  snapshot: ProcurementSnapshot;
  /** Omitted for members, who follow the deal here but do not run it. */
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const stage = snapshot.stage ?? "trial";
  const trialEndsAt =
    snapshot.trialEndsAt && ["trial", "quote", "security"].includes(stage)
      ? snapshot.trialEndsAt
      : null;
  const isLive = stage === "active";
  // Known from trial setup onward. The quote's own copy wins when present, since the buyer may have
  // corrected it there; before either exists the eyebrow stands alone rather than inventing a name.
  const company =
    snapshot.latestQuote?.config.businessName?.trim() ||
    snapshot.businessName?.trim();

  const journeyStage = stage === "exploring" ? "trial" : stage;
  const currentIdx = Math.max(
    0,
    FLOW_JOURNEY.findIndex((s) => s.stage === journeyStage),
  );
  const nextStage = FLOW_JOURNEY[currentIdx + 1];

  return (
    <div className="portal-surface portal-hero">
      <div className="portal-hero__top">
        <div className="portal-hero__ident">
          <span className="portal-hero__eyebrow">
            {company
              ? t("portal.procurement.hero.eyebrowCompany", { company })
              : t("portal.procurement.hero.eyebrow")}
          </span>

          <div
            className="portal-hero__bar"
            role="img"
            aria-label={t("portal.procurement.hero.barAria", {
              current: currentIdx + 1,
              total: FLOW_JOURNEY.length,
            })}
          >
            {FLOW_JOURNEY.map((s, i) => (
              <span key={s.stage} data-on={i <= currentIdx || undefined} />
            ))}
          </div>

          <p className="portal-hero__sentence">
            <strong>{t(FLOW_JOURNEY[currentIdx].label)}</strong>
            {` · ${t(STAGE_SENTENCE[stage])} `}
            {nextStage && (
              <span className="portal-hero__sentence-next">
                {t("portal.procurement.hero.next", {
                  stage: t(nextStage.label),
                })}
              </span>
            )}
          </p>

          {trialEndsAt && Number.isFinite(daysLeft(trialEndsAt)) && (
            <div className="portal-hero__chips">
              <span className="portal-hero__chip">
                {trialLeftLabel(t, trialEndsAt)}
              </span>
            </div>
          )}
        </div>
      </div>

      {isLive && (
        <div className="portal-hero__live">
          <span className="portal-hero__live-tile" aria-hidden>
            <Icon name="check" size={15} />
          </span>
          <span className="portal-hero__live-text">
            <span className="portal-hero__live-title">
              {t("portal.procurement.hero.liveTitle")}
            </span>
            <span className="portal-hero__live-sub">
              {t("portal.procurement.hero.liveSub")}
            </span>
          </span>
        </div>
      )}

      {onOpen && (
        <div className="portal-hero__cta">
          <Button variant="primary" onClick={onOpen}>
            {t("portal.procurement.hero.open")}
          </Button>
        </div>
      )}
    </div>
  );
}
