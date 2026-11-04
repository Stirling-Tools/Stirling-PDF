import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banner, Button, Card, Dropdown, Logo, Skeleton } from "@editor/ui";
import { Icon } from "@editor/ui/Icon";
import { useAuth } from "@editor/auth";
import { stripBasePath, withBasePath } from "@editor/constants/app";
import { rememberPendingDestination } from "@editor/services/pendingDestination";
import {
  FLOW_JOURNEY,
  type DealStage,
  type QuoteResult,
} from "@processor/api/procurement";
import { refreshWalletCache } from "@processor/api/billing";
import { openApiUrl } from "@processor/api/externalUrl";
import { qk } from "@processor/queries/keys";
import { walletQuery } from "@processor/queries/wallet";
import { useLinkOptional } from "@processor/contexts/LinkContext";
import { useUI } from "@processor/contexts/UIContext";
import { useConnectGate } from "@processor/hooks/useConnectGate";
import { useAccountLinkOwner } from "@processor/hooks/useAccountLinkOwner";
import { useLinkedAccountEmail } from "@processor/hooks/useLinkedAccountEmail";
import { SaasSessionBanner } from "@processor/components/account-link/SaasSessionBanner";
import { useProcurement } from "@processor/components/procurement/useProcurement";
import {
  ProcurementFlow,
  procurementFlowStep,
} from "@processor/components/procurement/ProcurementFlow";
import {
  DocumentsList,
  ScheduleCallModal,
  TrialSetupForm,
} from "@processor/components/procurement/ProcurementExtras";
import { DeploymentOptions } from "@processor/components/procurement/DeploymentOptions";
import { LicensePanel } from "@processor/components/procurement/ProcurementStages";
import { SetupChecklist } from "@processor/components/procurement/SetupChecklist";
import { ConfirmModal } from "@processor/components/users/ConfirmModal";
import { daysLeft } from "@processor/components/procurement/DealStatusHero";
import { money } from "@processor/components/procurement/format";
import {
  saveTrialDraft,
  takeTrialDraft,
} from "@processor/components/procurement/trialDraft";
import "@processor/views/Procurement.css";
import "@processor/views/Enterprise.css";

/** Stages that still run on the trial licence, so the trial's clock and controls apply. */
const TRIAL_STAGES: DealStage[] = ["trial", "quote", "security"];

/**
 * The whole Enterprise journey on one page: why Enterprise and the trial setup for a new buyer,
 * then where the deal stands, its next action, licence key, trial, documents and a way to talk to
 * us. Building a quote and signing the agreement are long enough to open over it.
 *
 * <p>Open to visitors without an account where the build allows it (the hosted page, linked from
 * the website): they read the page and fill in the trial setup, and sign in only to start it.
 */
export function Enterprise({
  onSignIn = signIn,
}: {
  /** Replaces the redirect to sign-in; the Storybook demo signs in on the spot. */
  onSignIn?: () => void;
}) {
  const { session, isAnonymous, loading } = useAuth();
  if (loading) {
    return (
      <Shell>
        <PageSkeleton />
      </Shell>
    );
  }
  return session && !isAnonymous ? (
    <SignedIn />
  ) : (
    <SignedOut onSignIn={onSignIn} />
  );
}

/**
 * Sign in, then come back here. Remembered for sign-up's confirmation email, which cannot carry a
 * `next`; named in the URL too, so the sign-in screens know where the visitor is headed.
 */
function signIn() {
  const here = `${stripBasePath(window.location.pathname)}${window.location.search}`;
  rememberPendingDestination(here);
  window.location.href = withBasePath(
    `/login?next=${encodeURIComponent(here)}`,
  );
}

function SignedOut({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation();
  const [scheduling, setScheduling] = useState(false);
  return (
    <Shell
      headerAction={
        <Button variant="secondary" onClick={onSignIn}>
          {t("portal.enterprise.signIn", "Sign in")}
        </Button>
      }
      onSchedule={() => setScheduling(true)}
    >
      <Landing>
        <TrialSetupForm
          busy={false}
          startLabel={t(
            "portal.enterprise.signInToStart",
            "Sign in to start your trial",
          )}
          onScheduleCall={() => setScheduling(true)}
          onConfirm={(deployment, seats, details) => {
            saveTrialDraft({ deployment, seats, details, eulaAgreed: true });
            onSignIn();
          }}
        />
      </Landing>
      <ScheduleCallModal
        open={scheduling}
        onClose={() => setScheduling(false)}
      />
    </Shell>
  );
}

function SignedIn() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const procurement = useProcurement();
  const gate = useConnectGate();
  // No provider on SaaS: the signed-in account is the Stirling account, so there is nothing to link.
  const link = useLinkOptional();
  const isOwner = useAccountLinkOwner();
  const email = useLinkedAccountEmail();
  const { openSettings } = useUI();
  // Answers given before signing in, if this visit is the return from it. Only the account they
  // were given for picks them up: on a shared browser, whoever signs in next must not start a
  // trial on another person's details and consent.
  const [draft] = useState(() => {
    const saved = takeTrialDraft();
    const given = saved?.details.contactEmail?.trim().toLowerCase();
    return given && given === user?.email?.trim().toLowerCase() ? saved : null;
  });
  const { isLinked, data, started, stage, latest, busy } = procurement;
  const wallet = useQuery(walletQuery(isLinked));
  // Members follow the deal; only the team leader can act on it. Unknown while the wallet fails,
  // which a banner says rather than showing a leader the member view.
  const canManage = wallet.data?.role === "leader";
  const roleKnown = wallet.isSuccess;
  // Without the snapshot it is unknown whether a deal exists, so none is offered a fresh start.
  const exploring =
    !procurement.loadError && (!started || stage === "exploring");

  // Arriving here is asking about Enterprise. Recorded once, so accounts that never ask stay free of
  // the deal surface and drop-off before the trial is visible.
  const recordedInterest = useRef(false);
  // Back from signing in with the setup finished and the terms agreed, that click was to start the
  // trial, so it starts rather than showing the form again.
  const resumeTrial = draft?.eulaAgreed === true && exploring;
  useEffect(() => {
    if (
      recordedInterest.current ||
      !canManage ||
      procurement.loading ||
      procurement.loadError ||
      (started && !resumeTrial)
    )
      return;
    recordedInterest.current = true;
    if (resumeTrial && draft) {
      procurement.onConfirmSetup(draft.deployment, draft.seats, draft.details);
    } else {
      procurement.onExploreEnterprise();
    }
  }, [canManage, procurement, started, resumeTrial, draft]);

  // A trial or agreement changes entitlements; billing must not show the old plan on return.
  const previousDeal = useRef(data);
  useEffect(() => {
    const previous = previousDeal.current;
    previousDeal.current = data;
    if (!previous || previous === data) return;
    void refreshWalletCache()
      .catch(() => {})
      .then(() =>
        queryClient.invalidateQueries({ queryKey: qk.wallet(isLinked) }),
      );
  }, [data, isLinked, queryClient]);

  // Only a visit opened from within the app has somewhere in it to return to; a link straight here,
  // or the return from signing in, goes to the app itself.
  const goBack = () =>
    (location.state as { fromApp?: boolean } | null)?.fromApp
      ? navigate(-1)
      : navigate("/");
  const schedule = () => procurement.setExtra("schedule");

  // While the trial starts from the saved answers the page stays on its placeholder rather than
  // flashing the form it is about to leave. Settled by the attempt ending as well as by an error:
  // a session failure clears the error and would otherwise hold the placeholder for good.
  const startingTrial =
    resumeTrial &&
    canManage &&
    !procurement.error &&
    !procurement.loadError &&
    (!recordedInterest.current || busy);
  const loading =
    gate.loading ||
    (isLinked && (procurement.loading || wallet.isPending)) ||
    startingTrial;

  const company =
    latest?.config.businessName?.trim() || data?.businessName?.trim() || null;
  // Building a quote or signing opens within the deal, at the stage it belongs to.
  const flowOpen = procurement.open && procurementFlowStep(procurement) != null;

  return (
    <Shell
      company={company}
      onInvite={canManage ? () => openSettings("users") : undefined}
      scrollKey={flowOpen ? "flow" : "page"}
      headerAction={
        <Button
          variant="tertiary"
          leftSection={<Icon name="arrow-left" size={16} />}
          onClick={goBack}
        >
          {t("portal.enterprise.back", "Back to Stirling")}
        </Button>
      }
      // A deal carries its own contact section, so the footer would only repeat it.
      onSchedule={loading || !isLinked || exploring ? schedule : undefined}
    >
      <div className="ent__wrap ent__notices">
        {link && <SaasSessionBanner />}
        {gate.error && (
          <Banner
            tone="danger"
            title={t("portal.procurement.error.title")}
            action={
              <Button size="sm" onClick={gate.retry}>
                {t("portal.accountLink.gate.retry", "Try again")}
              </Button>
            }
          >
            {gate.error}
          </Banner>
        )}
        {wallet.isError && (
          <Banner
            tone="danger"
            title={t("portal.procurement.error.title")}
            action={
              <Button size="sm" onClick={() => void wallet.refetch()}>
                {t("portal.accountLink.gate.retry", "Try again")}
              </Button>
            }
          >
            {wallet.error.message}
          </Banner>
        )}
        {procurement.loadError && (
          <Banner
            tone="danger"
            title={t("portal.procurement.error.title")}
            action={
              <Button size="sm" onClick={procurement.retry}>
                {t("portal.accountLink.gate.retry", "Try again")}
              </Button>
            }
          >
            {procurement.loadError}
          </Banner>
        )}
        {procurement.error && !procurement.open && (
          <Banner
            tone="danger"
            title={t("portal.procurement.error.title")}
            onDismiss={() => procurement.setError(null)}
          >
            {procurement.error}
          </Banner>
        )}
      </div>

      {loading ? (
        <PageSkeleton />
      ) : !isLinked ? (
        <Landing>
          <ConnectPanel
            available={gate.available}
            isOwner={isOwner}
            onConnect={gate.connect}
            onSchedule={schedule}
          />
        </Landing>
      ) : procurement.loadError ? null : exploring ? (
        <Landing>
          {canManage ? (
            <TrialSetupForm
              busy={busy}
              email={email}
              initial={draft}
              onScheduleCall={schedule}
              onConfirm={procurement.onConfirmSetup}
            />
          ) : (
            roleKnown && (
              <p className="ent__note">
                {t(
                  "portal.enterprise.member",
                  "Your team leader runs the Enterprise deal. Once it starts, you can follow its progress here.",
                )}
              </p>
            )
          )}
        </Landing>
      ) : (
        <Deal
          controller={procurement}
          canManage={canManage}
          roleKnown={roleKnown}
          teamSize={wallet.data?.team?.usersInUse ?? 1}
          onInvite={canManage ? () => openSettings("users") : undefined}
          onSchedule={schedule}
          flowStep={flowOpen ? procurementFlowStep(procurement) : null}
          flow={flowOpen && <ProcurementFlow controller={procurement} />}
        />
      )}

      {/* Mounted here while no step is open: booking a call opens from anywhere on the page. */}
      {!flowOpen && <ProcurementFlow controller={procurement} />}
    </Shell>
  );
}

/** The page's own header and footer, in place of the app's chrome. */
function Shell({
  company,
  headerAction,
  onInvite,
  onSchedule,
  scrollKey,
  children,
}: {
  company?: string | null;
  /** Team actions under the company name; omitted for members, who see it as a label. */
  onInvite?: () => void;
  headerAction?: ReactNode;
  onSchedule?: () => void;
  /** A change of view: the page scrolls itself, so it returns to the top as a new page would. */
  scrollKey?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    pageRef.current?.scrollTo?.({ top: 0 });
  }, [scrollKey]);
  return (
    <div className="ent" ref={pageRef}>
      <header className="ent__header">
        <div className="ent__wrap ent__header-inner">
          <div className="ent__brand">
            <Logo variant="iconAndText" iconHeight="1.5rem" textHeight="1rem" />
            <span className="ent__brand-tag">
              {t("portal.enterprise.brandTag", "Enterprise")}
            </span>
          </div>
          <div className="ent__header-end">
            {company &&
              (onInvite ? (
                <Dropdown.Root align="end">
                  <Dropdown.Trigger>
                    <button type="button" className="ent__company">
                      {company}
                      <Icon name="chevron-down" size={14} />
                    </button>
                  </Dropdown.Trigger>
                  <Dropdown.Menu>
                    <Dropdown.Item
                      onSelect={onInvite}
                      leading={<Icon name="user-plus" size={16} />}
                    >
                      {t("portal.procurement.hero.inviteTeammates")}
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Root>
              ) : (
                <span className="ent__company">{company}</span>
              ))}
            {headerAction}
          </div>
        </div>
      </header>

      <main className="ent__main">{children}</main>

      {onSchedule && (
        <footer className="ent__footer">
          <div className="ent__wrap ent__footer-inner">
            <span>
              {t(
                "portal.enterprise.footer",
                "Questions about Stirling Enterprise?",
              )}
            </span>
            <button
              type="button"
              className="portal-legal__link"
              onClick={onSchedule}
            >
              {t("portal.procurement.hero.scheduleCall")}
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="ent__wrap ent__loading" aria-hidden>
      <Skeleton height="2.5rem" width="60%" />
      <Skeleton height="16rem" shape="rect" />
    </div>
  );
}

/** First visit: what Enterprise is, beside the one thing to do next. */
function Landing({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const ticks = [
    t(
      "portal.enterprise.landing.tickDeploy",
      "Run it on Stirling Cloud, your own servers, or fully air-gapped",
    ),
    t(
      "portal.enterprise.landing.tickCompliance",
      "SCIM, data residency and uptime SLAs",
    ),
    t(
      "portal.enterprise.landing.tickAgreement",
      "One agreement covering the MSA, order form, EULA and DPA",
    ),
  ];
  return (
    <div className="ent__wrap ent__landing">
      <section className="ent__intro">
        <span className="ent__eyebrow">
          {t("portal.enterprise.brandTag", "Enterprise")}
        </span>
        <h1 className="ent__h1">
          {t("portal.enterprise.landing.title", "Stirling Enterprise")}
        </h1>
        <p className="ent__lede">
          {t(
            "portal.enterprise.landing.lede",
            "Try it free for 14 days, then build your quote and sign your agreement here. No card required.",
          )}
        </p>
        <ul className="ent__ticks">
          {ticks.map((tick) => (
            <li key={tick}>
              <Icon name="check" size={16} />
              {tick}
            </li>
          ))}
        </ul>
        <DeploymentOptions />
      </section>
      <Card padding="loose" className="ent__panel">
        {children}
      </Card>
    </div>
  );
}

/** Self-hosted, before the server has a Stirling account to run the trial and quote on. */
function ConnectPanel({
  available,
  isOwner,
  onConnect,
  onSchedule,
}: {
  available: boolean;
  isOwner: boolean;
  onConnect: () => void;
  onSchedule: () => void;
}) {
  const { t } = useTranslation();
  if (!available) {
    return (
      <div className="ent__panel-body">
        <h2 className="ent__h2">{t("portal.procurement.link.title")}</h2>
        <p className="ent__text">
          {t(
            "portal.enterprise.connect.unavailable",
            "Connecting to a Stirling account is turned off on this server. Book a call and we’ll set up your trial with you.",
          )}
        </p>
        <div className="ent__actions">
          <Button variant="primary" onClick={onSchedule}>
            {t("portal.procurement.hero.scheduleCall")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="ent__panel-body">
      <h2 className="ent__h2">{t("portal.procurement.link.title")}</h2>
      <p className="ent__text">{t("portal.procurement.link.description")}</p>
      {isOwner ? (
        <div className="ent__actions">
          <Button variant="primary" onClick={onConnect}>
            {t("portal.procurement.link.cta")}
          </Button>
        </div>
      ) : (
        <p className="ent__note">
          {t(
            "portal.enterprise.connect.ownerOnly",
            "Only this server’s owner can connect it. Ask them to open this page.",
          )}
        </p>
      )}
    </div>
  );
}

/** A deal underway: where it stands, its next action, and everything it has produced so far. */
function Deal({
  controller,
  canManage,
  roleKnown,
  teamSize,
  onInvite,
  onSchedule,
  flowStep,
  flow,
}: {
  controller: ReturnType<typeof useProcurement>;
  canManage: boolean;
  /** False while the viewer's role could not be loaded: neither the leader's nor a member's view. */
  roleKnown: boolean;
  teamSize: number;
  onInvite?: () => void;
  onSchedule: () => void;
  /** The long step open within the deal, if any; the header follows it to its stage. */
  flowStep?: "builder" | "agreement" | null;
  flow?: ReactNode;
}) {
  const { t } = useTranslation();
  const {
    data,
    latest,
    isIssued,
    busy,
    setOpen,
    downloading,
    downloadingLicense,
    downloadingAgreement,
    invoicePdf,
  } = controller;
  const stage = controller.stage ?? "trial";
  // A finished stage opened from the tracker, shown as it was left; the deal itself stays put.
  const [review, setReview] = useState<{
    index: number;
    stage: DealStage;
  } | null>(null);
  // Opening a step or the deal moving on ends the review, so it never resurfaces over a later stage.
  if (review && (flow || review.stage !== stage)) setReview(null);
  const reviewing = flow ? null : (review?.index ?? null);
  const shownStage: DealStage =
    reviewing != null
      ? FLOW_JOURNEY[reviewing].stage
      : flowStep === "builder"
        ? "quote"
        : flowStep === "agreement"
          ? "security"
          : stage;
  const currentIdx = Math.max(
    0,
    FLOW_JOURNEY.findIndex((s) => s.stage === shownStage),
  );
  const step = FLOW_JOURNEY[currentIdx];
  const actualIdx = FLOW_JOURNEY.findIndex((s) => s.stage === stage);
  // The tracker doubles as navigation: a finished stage opens for review, the deal's own stage
  // returns to its overview or opens its long step, and from the trial, the quote stage is the same
  // as "Build your quote".
  const stageAction = (index: number): (() => void) | undefined => {
    const target = FLOW_JOURNEY[index].stage;
    if (index < actualIdx && !flowStep)
      return () => setReview({ index, stage });
    if (index === actualIdx) {
      if (flowStep) return () => setOpen(false);
      if (reviewing != null) return () => setReview(null);
      if (canManage && (target === "quote" || target === "security"))
        return () => setOpen(true);
      return undefined;
    }
    if (canManage && target === "quote" && stage === "trial") {
      return flowStep ? undefined : () => setOpen(true);
    }
    return undefined;
  };
  const inTrial = TRIAL_STAGES.includes(stage) && data?.trialEndsAt != null;
  // What the licence is issued for, which a quote can change from the trial's choice.
  const deployment = data?.entitledDeployment ?? data?.deployment ?? "cloud";
  const isLive = stage === "active";
  // Once a quote is on the table it is what the buyer is deciding on, so it takes the panel and
  // the trial's clock drops to a chip beside the stage.
  const quoteOnTable =
    reviewing == null && stage === "quote" && isIssued && latest != null;

  return (
    <>
      <section className="ent__band">
        <div className="ent__wrap ent__hero">
          <div className="ent__hero-main">
            <div className="ent__hero-head">
              <div className="ent__eyebrow-row">
                <span className="ent__eyebrow">
                  {t(
                    "portal.enterprise.stage",
                    "Stage {{current}} of {{total}}",
                    {
                      current: currentIdx + 1,
                      total: FLOW_JOURNEY.length,
                    },
                  )}
                </span>
                {reviewing != null && (
                  <span className="ent__chip">
                    {t("portal.enterprise.review.completed", "Completed")}
                  </span>
                )}
                {quoteOnTable && data?.trialEndsAt && (
                  <span className="ent__chip">
                    {daysLeft(data.trialEndsAt) === 0
                      ? t("portal.procurement.journey.expired", "Trial expired")
                      : t("portal.procurement.journey.daysLeft", {
                          count: daysLeft(data.trialEndsAt),
                        })}
                  </span>
                )}
              </div>
              <h1 className="ent__h1">{t(step.label)}</h1>
              <p className="ent__lede">{t(step.blurb)}</p>
              {reviewing != null ? (
                <div className="ent__actions">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setReview(null)}
                  >
                    {t("portal.enterprise.review.back", {
                      stage: t(FLOW_JOURNEY[actualIdx].label),
                    })}
                  </Button>
                </div>
              ) : (
                !flow &&
                (isLive ? (
                  <div className="ent__live">
                    <Icon name="circle-check" size={22} />
                    <div>
                      <h2 className="ent__h3">
                        {t("portal.procurement.live.title")}
                      </h2>
                      <p className="ent__text">
                        {t("portal.procurement.live.description")}
                      </p>
                    </div>
                  </div>
                ) : (
                  roleKnown && (
                    <NextStep
                      controller={controller}
                      canManage={canManage}
                      stage={stage}
                    />
                  )
                ))
              )}
            </div>
            {!flow && reviewing == null && (
              <>
                {/* Talking to us outranks the trial's own controls, so it sits under the next step. */}
                <div className="ent__call">
                  <span className="ent__call-icon">
                    <Icon name="calendar" size={20} />
                  </span>
                  <div className="ent__call-text">
                    <h2 className="ent__h3">
                      {t(
                        "portal.enterprise.callTitle",
                        "Talk to a solutions engineer",
                      )}
                    </h2>
                    <p className="ent__text">
                      {t(
                        "portal.enterprise.callInfo",
                        "A 15-minute call. Bring your questions on pricing, deployment or security, or plan your rollout together.",
                      )}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={onSchedule}>
                    {t("portal.procurement.hero.scheduleCall")}
                  </Button>
                </div>
              </>
            )}
          </div>

          {quoteOnTable && !flow && (
            <QuotePanel
              quote={latest}
              downloading={downloading}
              onDownload={controller.onDownloadPdf}
            />
          )}
          {reviewing != null && (
            <StageReview stage={shownStage} controller={controller} />
          )}
          {inTrial && data && !quoteOnTable && !flow && reviewing == null && (
            <TrialPanel
              trialStartedAt={data.trialStartedAt}
              trialEndsAt={data.trialEndsAt!}
              extensionsUsed={data.trialExtensionsUsed}
              busy={busy}
              onExtend={
                canManage && stage === "trial"
                  ? controller.onExtendTrial
                  : undefined
              }
              onCancel={
                canManage && stage === "trial" ? controller.onReset : undefined
              }
            />
          )}

          <StageTracker
            currentIdx={reviewing != null ? actualIdx : currentIdx}
            viewingIdx={reviewing}
            isLive={isLive}
            actionFor={stageAction}
          />
        </div>
      </section>

      <div className="ent__wrap ent__body">
        {flow && <div className="ent__flow">{flow}</div>}
        {/* The trial's purpose, so it leads the page; out of the way while a quote or the
            agreement is open. */}
        {!flow && (
          <SetupChecklist
            dealId={data?.dealId}
            deployment={deployment}
            licenseKey={data?.licenseKey}
            live={isLive}
            teamSize={teamSize}
            onInvite={onInvite}
            onDownloadOfflineLicense={controller.onDownloadOfflineLicense}
            downloadingLicense={downloadingLicense}
          />
        )}
        {data?.licenseKey && (
          <Card padding="loose" className="ent__license">
            <LicensePanel
              licenseKey={data.licenseKey}
              offlineAvailable={deployment === "airgap"}
              downloadingLicense={downloadingLicense}
              onDownloadOffline={controller.onDownloadOfflineLicense}
            />
            {/* Still on the trial licence; from the agreement on, the file is the committed one. */}
            {deployment === "airgap" && TRIAL_STAGES.includes(stage) && (
              <p className="portal-proc__license-hint">
                {t("portal.procurement.license.trialFileHint")}
              </p>
            )}
          </Card>
        )}
        <Card padding="loose">
          <h2 className="ent__h2">{t("portal.procurement.documents.title")}</h2>
          <p className="ent__text">
            {t("portal.procurement.documents.subtitle")}
          </p>
          <DocumentsList
            agreementVersion={data?.agreementSignedVersion}
            downloadingAgreement={downloadingAgreement}
            onDownloadAgreement={controller.onDownloadSignedAgreement}
            onViewAgreement={
              canManage && stage === "security"
                ? () => setOpen(true)
                : undefined
            }
            quoteAvailable={!!latest?.stripeQuoteId}
            downloadingQuote={downloading}
            onDownloadQuote={controller.onDownloadPdf}
            invoiceUrl={latest?.invoiceUrl}
            invoicePdf={latest?.invoicePdf ?? invoicePdf}
          />
        </Card>
      </div>
    </>
  );
}

/** The trial's clock, and extending or ending it while the deal is still at the trial stage. */
function TrialPanel({
  trialStartedAt,
  trialEndsAt,
  extensionsUsed,
  busy,
  onExtend,
  onCancel,
}: {
  trialStartedAt: string | null;
  trialEndsAt: string;
  extensionsUsed: number;
  busy: boolean;
  onExtend?: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const left = daysLeft(trialEndsAt);
  const ends = new Date(trialEndsAt).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const maxed = extensionsUsed >= 2;
  const start = trialStartedAt ? new Date(trialStartedAt).getTime() : null;
  const end = new Date(trialEndsAt).getTime();
  const used =
    start != null && end > start
      ? Math.min(1, Math.max(0, (Date.now() - start) / (end - start)))
      : null;
  return (
    <div className="ent__trial">
      <span className="ent__trial-label">
        {t("portal.procurement.trial.title")}
      </span>
      <span className="ent__trial-days" data-expired={left === 0 || undefined}>
        {left === 0
          ? t("portal.procurement.journey.expired", "Trial expired")
          : t("portal.procurement.journey.daysLeft", { count: left })}
      </span>
      {used != null && (
        <span className="ent__trial-bar" aria-hidden>
          <span style={{ width: `${used * 100}%` }} />
        </span>
      )}
      <p className="ent__text">
        {t("portal.procurement.trial.subtitle", { date: ends })}
      </p>
      {onExtend && onCancel && (
        <>
          <p className="ent__hint">
            {maxed
              ? t("portal.procurement.trial.bodyMaxed")
              : t("portal.procurement.trial.body")}
          </p>
          <div className="ent__actions">
            <Button
              variant="tertiary"
              loading={busy}
              disabled={maxed}
              onClick={onExtend}
            >
              {maxed
                ? t("portal.procurement.trial.maxed")
                : t("portal.procurement.trial.extend")}
            </Button>
            <Button
              variant="tertiary"
              disabled={busy}
              onClick={() => setConfirmingCancel(true)}
            >
              {t("portal.procurement.trial.cancel")}
            </Button>
          </div>
          {/* Cancelling ends the deal along with its licence, quote and progress. */}
          <ConfirmModal
            open={confirmingCancel}
            danger
            busy={busy}
            title={t(
              "portal.procurement.trial.cancelTitle",
              "Cancel your trial?",
            )}
            body={t(
              "portal.procurement.trial.cancelBody",
              "Your trial licence stops working and the deal starts over. You can start a new trial later.",
            )}
            confirmLabel={t("portal.procurement.trial.cancel")}
            onCancel={() => setConfirmingCancel(false)}
            onConfirm={() => {
              setConfirmingCancel(false);
              onCancel();
            }}
          />
        </>
      )}
    </div>
  );
}

const SERVICE_LEVEL_LABEL: Record<string, string> = {
  standard: "portal.procurement.builder.slStandard",
  priority: "portal.procurement.builder.slPriority",
  dedicated: "portal.procurement.builder.slDedicated",
};

/** The issued quote's figures, so the buyer can weigh it without opening the paper. */
function QuotePanel({
  quote,
  downloading,
  onDownload,
}: {
  quote: QuoteResult;
  downloading: boolean;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="ent__trial ent__quote">
      <span className="ent__trial-label">
        {t("portal.enterprise.quotePanel", "Your quote")}
        {quote.quoteNumber && (
          <span className="ent__quote-number">{quote.quoteNumber}</span>
        )}
      </span>
      <span className="ent__trial-days">
        {money(quote.annualNetMinor, quote.currency)}
      </span>
      <span className="ent__quote-caption">
        {t("portal.procurement.review.annual")}
      </span>
      <dl className="ent__facts">
        {/* Quotes from before the seat count was kept carry 0. */}
        {quote.config.users > 0 && (
          <div>
            <dt>{t("portal.procurement.builder.users")}</dt>
            <dd>{quote.config.users.toLocaleString()}</dd>
          </div>
        )}
        <div>
          <dt>{t("portal.enterprise.deployment", "Deployment")}</dt>
          <dd>{t(`portal.procurement.setup.${quote.config.deployment}`)}</dd>
        </div>
        <div>
          <dt>{t("portal.procurement.builder.serviceLevel")}</dt>
          <dd>
            {SERVICE_LEVEL_LABEL[quote.config.serviceLevel]
              ? t(SERVICE_LEVEL_LABEL[quote.config.serviceLevel])
              : quote.config.serviceLevel}
          </dd>
        </div>
      </dl>
      <p className="ent__text">
        {t("portal.procurement.review.tcv", {
          years: quote.config.termYears,
          tcv: money(quote.tcvMinor, quote.currency),
        })}
      </p>
      <p className="ent__hint">
        {t("portal.procurement.review.renewal", {
          amount: money(quote.renewalAnnualNetMinor, quote.currency),
          pct: quote.cpiRatePct,
        })}
      </p>
      <div className="ent__actions">
        <Button variant="tertiary" loading={downloading} onClick={onDownload}>
          {t("portal.procurement.review.downloadCta")}
        </Button>
        {/* An accepted quote is a commitment, so its offer window no longer applies. */}
        {quote.validUntil && quote.status !== "accepted" && (
          <span className="ent__quote-valid">
            {t("portal.procurement.review.validUntil", {
              date: new Date(quote.validUntil).toLocaleDateString(),
            })}
          </span>
        )}
      </div>
    </div>
  );
}

/** A finished stage as it was left, to look back on without changing anything. */
function StageReview({
  stage,
  controller,
}: {
  stage: DealStage;
  controller: ReturnType<typeof useProcurement>;
}) {
  const { t } = useTranslation();
  const { data, latest } = controller;
  if (stage === "quote") {
    return latest ? (
      <QuotePanel
        quote={latest}
        downloading={controller.downloading}
        onDownload={controller.onDownloadPdf}
      />
    ) : null;
  }
  if (!data) return null;
  const date = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "\u2014";
  const company = latest?.config.businessName || data.businessName;
  const invoiceUrl = latest?.invoiceUrl;
  const invoicePdf = latest?.invoicePdf ?? controller.invoicePdf;
  return (
    <div className="ent__trial">
      {(stage === "trial" || stage === "exploring") && (
        <>
          <span className="ent__trial-label">
            {t("portal.enterprise.review.trialTitle", "Your trial")}
          </span>
          <dl className="ent__facts">
            <div>
              <dt>{t("portal.enterprise.review.started", "Started")}</dt>
              <dd>{date(data.trialStartedAt)}</dd>
            </div>
            <div>
              <dt>
                {t("portal.enterprise.review.trialEnds", "Trial end date")}
              </dt>
              <dd>{date(data.trialEndsAt)}</dd>
            </div>
            <div>
              <dt>{t("portal.enterprise.deployment", "Deployment")}</dt>
              <dd>{t(`portal.procurement.setup.${data.deployment}`)}</dd>
            </div>
            {data.seats > 0 && (
              <div>
                <dt>{t("portal.enterprise.review.people", "People")}</dt>
                <dd>{data.seats.toLocaleString()}</dd>
              </div>
            )}
            <div>
              <dt>
                {t("portal.enterprise.review.extensions", "Extensions used")}
              </dt>
              <dd>{data.trialExtensionsUsed}</dd>
            </div>
          </dl>
        </>
      )}
      {stage === "security" && (
        <>
          <span className="ent__trial-label">
            {t("portal.procurement.documents.agreement")}
          </span>
          <dl className="ent__facts">
            {data.agreementSignedVersion && (
              <div>
                <dt>{t("portal.enterprise.review.version", "Version")}</dt>
                <dd>{data.agreementSignedVersion}</dd>
              </div>
            )}
            {company && (
              <div>
                <dt>{t("portal.enterprise.review.company", "Company")}</dt>
                <dd>{company}</dd>
              </div>
            )}
          </dl>
          {data.agreementSignedVersion && (
            <div className="ent__actions">
              <Button
                variant="tertiary"
                loading={controller.downloadingAgreement}
                onClick={controller.onDownloadSignedAgreement}
              >
                {t("portal.procurement.documents.download")}
              </Button>
            </div>
          )}
        </>
      )}
      {stage === "procurement" && (
        <>
          <span className="ent__trial-label">
            {t("portal.procurement.documents.invoice")}
          </span>
          <p className="ent__text">
            {t(
              "portal.enterprise.review.paid",
              "Paid. Your invoice stays available here.",
            )}
          </p>
          <div className="ent__actions">
            {invoiceUrl && (
              <Button variant="tertiary" onClick={() => openApiUrl(invoiceUrl)}>
                {t("portal.enterprise.review.viewInvoice", "View invoice")}
              </Button>
            )}
            {invoicePdf && (
              <Button variant="tertiary" onClick={() => openApiUrl(invoicePdf)}>
                {t("portal.procurement.payment.downloadInvoice")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** What the buyer does next at this stage; a member follows along instead. */
function NextStep({
  controller,
  canManage,
  stage,
}: {
  controller: ReturnType<typeof useProcurement>;
  canManage: boolean;
  stage: DealStage;
}) {
  const { t } = useTranslation();
  const { isIssued, busy, setOpen, latest } = controller;
  const invoiceUrl = latest?.invoiceUrl;
  const invoicePdf = latest?.invoicePdf ?? controller.invoicePdf;
  if (!canManage) {
    return (
      <p className="ent__note">
        {t(
          "portal.enterprise.memberDeal",
          "Your team leader runs this deal. You can follow its progress here.",
        )}
      </p>
    );
  }
  return (
    <div className="ent__actions">
      {stage === "trial" && (
        <Button variant="primary" size="md" onClick={() => setOpen(true)}>
          {t("portal.procurement.hero.ctaTrial")}
        </Button>
      )}
      {stage === "quote" &&
        (isIssued ? (
          <>
            <Button
              variant="primary"
              size="md"
              loading={busy}
              onClick={() => void controller.onAcceptQuote()}
            >
              {t("portal.procurement.review.acceptCta")}
            </Button>
            <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
              {t("portal.procurement.hero.ctaReviewQuote")}
            </Button>
          </>
        ) : (
          <Button variant="primary" size="md" onClick={() => setOpen(true)}>
            {t("portal.procurement.hero.ctaQuote")}
          </Button>
        ))}
      {stage === "security" && (
        <Button variant="primary" size="md" onClick={() => setOpen(true)}>
          {t("portal.procurement.hero.ctaAgreement")}
        </Button>
      )}
      {stage === "procurement" && invoiceUrl && (
        <Button
          variant="primary"
          size="md"
          onClick={() => openApiUrl(invoiceUrl)}
        >
          {t("portal.procurement.payment.viewInvoice")}
        </Button>
      )}
      {stage === "procurement" && invoicePdf && (
        <Button
          variant="secondary"
          size="md"
          onClick={() => openApiUrl(invoicePdf)}
        >
          {t("portal.procurement.payment.downloadInvoice")}
        </Button>
      )}
      {stage === "procurement" && (
        <p className="ent__hint ent__next-hint">
          {t("portal.procurement.payment.description")}
        </p>
      )}
    </div>
  );
}

/** Where the deal stands; stages with something to open are buttons. */
function StageTracker({
  currentIdx,
  viewingIdx,
  isLive,
  actionFor,
}: {
  currentIdx: number;
  /** A finished stage open for review, marked apart from where the deal stands. */
  viewingIdx: number | null;
  isLive: boolean;
  actionFor: (index: number) => (() => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <ol
      className="ent__stages"
      aria-label={t("portal.enterprise.stagesLabel", "Progress")}
    >
      {FLOW_JOURNEY.map((s, index) => {
        const done = index < currentIdx || (isLive && index === currentIdx);
        const action = actionFor(index);
        const content = (
          <>
            <span className="ent__stage-dot">
              {done ? <Icon name="check" size={14} /> : index + 1}
            </span>
            <span className="ent__stage-label">{t(s.label)}</span>
          </>
        );
        return (
          <li
            key={s.stage}
            className="ent__stage"
            data-state={
              done ? "done" : index === currentIdx ? "current" : "next"
            }
            data-viewing={index === viewingIdx || undefined}
            aria-current={
              index === viewingIdx
                ? "page"
                : index === currentIdx
                  ? "step"
                  : undefined
            }
          >
            {action ? (
              <button type="button" className="ent__stage-btn" onClick={action}>
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}
