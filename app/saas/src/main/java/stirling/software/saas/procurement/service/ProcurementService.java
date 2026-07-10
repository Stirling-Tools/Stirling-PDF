package stirling.software.saas.procurement.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.saas.procurement.config.ProcurementConfigurationProperties;
import stirling.software.saas.procurement.license.EnterpriseLicenseService;
import stirling.software.saas.procurement.license.LicenseEntitlements;
import stirling.software.saas.procurement.model.ProcurementDeal;
import stirling.software.saas.procurement.model.ProcurementQuote;
import stirling.software.saas.procurement.pricing.ProcurementPricingService;
import stirling.software.saas.procurement.pricing.QuoteBreakdown;
import stirling.software.saas.procurement.pricing.QuoteConfig;
import stirling.software.saas.procurement.repository.ProcurementDealRepository;
import stirling.software.saas.procurement.repository.ProcurementQuoteRepository;

/**
 * Orchestrates a linked team's procurement journey: start a (mock-licensed) trial, build a
 * server-priced quote, and accept it. Stripe checkout itself lives in a Supabase edge function the
 * portal calls with the accepted quote; on payment the webhook seeds {@code billing_subscriptions}
 * and this service issues the annual licence. All amounts are minor units (cents).
 */
@Slf4j
@Service
@Profile("saas")
public class ProcurementService {

    // Local mapper for the line-items JSON snapshot; the saas context exposes no injectable
    // ObjectMapper bean, and this (de)serialisation doesn't need Spring's configured one.
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final ProcurementDealRepository dealRepo;
    private final ProcurementQuoteRepository quoteRepo;
    private final ProcurementPricingService pricing;
    private final EnterpriseLicenseService licenses;
    private final ProcurementConfigurationProperties config;
    private final TeamMembershipRepository memberRepo;

    public ProcurementService(
            ProcurementDealRepository dealRepo,
            ProcurementQuoteRepository quoteRepo,
            ProcurementPricingService pricing,
            EnterpriseLicenseService licenses,
            ProcurementConfigurationProperties config,
            TeamMembershipRepository memberRepo) {
        this.dealRepo = dealRepo;
        this.quoteRepo = quoteRepo;
        this.pricing = pricing;
        this.licenses = licenses;
        this.config = config;
        this.memberRepo = memberRepo;
    }

    /**
     * The team leader's email — the natural owner of the team's Keygen licence. Falls back to the
     * username when no email is set; null when the team has no leader.
     */
    private String leaderEmail(Long teamId) {
        return memberRepo.findByTeamIdAndRole(teamId, TeamRole.LEADER).stream()
                .findFirst()
                .map(TeamMembership::getUser)
                .map(
                        u ->
                                u.getEmail() != null && !u.getEmail().isBlank()
                                        ? u.getEmail()
                                        : u.getUsername())
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public Optional<ProcurementDeal> getDeal(Long teamId) {
        return dealRepo.findByTeamId(teamId);
    }

    @Transactional(readOnly = true)
    public List<ProcurementQuote> quotesForDeal(Long dealId) {
        return quoteRepo.findByDealIdOrderByCreatedAtDesc(dealId);
    }

    /**
     * Start (or restart) the free trial for a team: issue a mock trial licence and stamp the trial
     * window on the deal. No Stripe: a no-card trial has no subscription; the entitlement is the
     * Keygen licence, and the deal row is the journey state. The buyer's chosen deployment target
     * ({@code cloud}/{@code selfhost}/{@code airgap}) and seat count are captured here so the quote
     * builder opens seeded to their environment; both are still editable when the quote is built.
     */
    @Transactional
    public ProcurementDeal startTrial(Long teamId, String deployment, int seats) {
        ProcurementDeal deal =
                dealRepo.findByTeamId(teamId).orElseGet(() -> new ProcurementDeal(teamId));
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime ends = now.plusDays(config.getTrialDurationDays());
        deal.setStage(ProcurementDeal.STAGE_TRIAL);
        deal.setDeployment(normalizeDeployment(deployment));
        deal.setSeats(Math.max(0, seats));
        deal.setTrialStartedAt(now);
        deal.setTrialEndsAt(ends);
        deal.setTrialExtensionsUsed(0);
        deal.setLicenseRef(licenses.issueTrialLicense(teamId, leaderEmail(teamId), ends));
        deal = dealRepo.save(deal);
        log.info(
                "[procurement] trial started team={} deal={} deployment={} seats={} ends={}",
                teamId,
                deal.getDealId(),
                deal.getDeployment(),
                deal.getSeats(),
                ends);
        return deal;
    }

    /**
     * Constrain a caller-supplied deployment to the known set; anything else falls back to cloud.
     */
    private static String normalizeDeployment(String deployment) {
        if (deployment == null) return "cloud";
        String d = deployment.trim().toLowerCase(Locale.ROOT);
        return switch (d) {
            case "selfhost", "airgap", "cloud" -> d;
            default -> "cloud";
        };
    }

    /** Extend the current trial by the configured increment, up to the cap. */
    @Transactional
    public ProcurementDeal extendTrial(Long teamId) {
        ProcurementDeal deal =
                dealRepo.findByTeamId(teamId)
                        .orElseThrow(() -> new IllegalStateException("No deal for team " + teamId));
        // Only extend while still in the trial. Past the trial (e.g. active), licenseRef points at
        // the committed annual licence — extending would rewind its expiry.
        if (!ProcurementDeal.STAGE_TRIAL.equals(deal.getStage())) {
            throw new IllegalStateException("Trial extension only allowed during the trial stage");
        }
        if (deal.getTrialExtensionsUsed() >= config.getMaxTrialExtensions()) {
            throw new IllegalStateException("Trial extension cap reached");
        }
        LocalDateTime base =
                deal.getTrialEndsAt() != null ? deal.getTrialEndsAt() : LocalDateTime.now();
        LocalDateTime newEnd = base.plusDays(config.getTrialExtensionDays());
        deal.setTrialEndsAt(newEnd);
        deal.setTrialExtensionsUsed(deal.getTrialExtensionsUsed() + 1);
        if (deal.getLicenseRef() != null) {
            licenses.extendLicense(deal.getLicenseRef(), newEnd);
        }
        return dealRepo.save(deal);
    }

    /** Price a quote config server-side and persist it as a draft against the team's deal. */
    @Transactional
    public ProcurementQuote buildQuote(Long teamId, QuoteConfig cfg, String businessName) {
        ProcurementDeal deal =
                dealRepo.findByTeamId(teamId).orElseGet(() -> new ProcurementDeal(teamId));
        if (ProcurementDeal.STAGE_LIVE.equals(deal.getStage())) {
            throw new IllegalStateException("Cannot rebuild a quote on a live deal");
        }
        // (Re)building a quote returns the deal to the quote stage and drops any prior acceptance,
        // so a rebuild from security/payment can't leave a stale stage or accepted-quote pointer.
        deal.setStage(ProcurementDeal.STAGE_QUOTE);
        deal.setAcceptedQuoteId(null);
        deal = dealRepo.save(deal);

        QuoteBreakdown breakdown = pricing.price(cfg);

        ProcurementQuote quote = new ProcurementQuote();
        quote.setDealId(deal.getDealId());
        quote.setQuoteNumber(nextQuoteNumber(deal.getDealId()));
        // Priced but not yet issued: the edge fn creates the Stripe Quote and flips this to SENT.
        quote.setStatus(ProcurementQuote.STATUS_DRAFT);
        quote.setCurrency(cfg.currency());
        quote.setVolume(cfg.volume());
        quote.setSeats(cfg.users() > 0 ? cfg.users() : null);
        quote.setIntensity(cfg.intensity());
        quote.setSizeMult(cfg.sizeMult());
        quote.setDeployment(cfg.deployment());
        quote.setTermYears(cfg.termYears());
        quote.setServiceLevel(cfg.serviceLevel());
        quote.setIndemnification(cfg.indemnification());
        quote.setTraining(cfg.training());
        quote.setQbr(cfg.qbr());
        quote.setBusinessName(businessName);
        quote.setAnnualNetMinor(breakdown.annualNetMinor());
        quote.setTcvMinor(breakdown.tcvMinor());
        quote.setRenewalAnnualMinor(breakdown.renewalAnnualNetMinor());
        quote.setLineItemsJson(writeLineItems(breakdown));
        quote.setValidUntil(LocalDate.now().plusDays(30));
        quote = quoteRepo.save(quote);
        log.info(
                "[procurement] quote built team={} quote={} annualNet={} tcv={}",
                teamId,
                quote.getQuoteNumber(),
                quote.getAnnualNetMinor(),
                quote.getTcvMinor());
        return quote;
    }

    /**
     * Advance the deal to the agreement (security) stage: the buyer has an issued quote and is
     * reviewing the enterprise agreement before it's accepted into a subscription. Requires an
     * issued quote on the deal.
     */
    @Transactional
    public ProcurementDeal startAgreement(Long teamId) {
        ProcurementDeal deal =
                dealRepo.findByTeamId(teamId)
                        .orElseThrow(() -> new IllegalStateException("No deal for team " + teamId));
        boolean hasIssuedQuote =
                quoteRepo.findByDealIdOrderByCreatedAtDesc(deal.getDealId()).stream()
                        .anyMatch(q -> ProcurementQuote.STATUS_SENT.equals(q.getStatus()));
        if (!hasIssuedQuote) {
            throw new IllegalStateException("No issued quote for team " + teamId);
        }
        deal.setStage(ProcurementDeal.STAGE_AGREEMENT);
        deal = dealRepo.save(deal);
        log.info("[procurement] agreement stage team={} deal={}", teamId, deal.getDealId());
        return deal;
    }

    /**
     * Provision on accept: upgrade the team's licence to the committed annual term (valid
     * immediately), so the buyer can get going the moment they accept — before the invoice is paid.
     * Driven by the accept edge function once the subscription + invoice are created. Idempotent
     * (upgrades the existing licence in place); deliberately does NOT change the stage — the deal
     * stays in the payment step so the outstanding invoice remains visible until it settles.
     */
    @Transactional
    public ProcurementDeal provisionLicense(Long teamId) {
        ProcurementDeal deal =
                dealRepo.findByTeamId(teamId)
                        .orElseThrow(() -> new IllegalStateException("No deal for team " + teamId));
        deal.setLicenseRef(issueOrUpgradeAnnual(deal));
        deal = dealRepo.save(deal);
        log.info("[procurement] licence provisioned team={} deal={}", teamId, deal.getDealId());
        return deal;
    }

    /**
     * Mark the deal fully live (advance to the active stage) once payment settles. In production
     * this is the {@code invoice.paid} webhook; here it's the demo/manual stand-in. Re-affirms the
     * annual licence in case provisioning didn't run at accept.
     */
    @Transactional
    public ProcurementDeal markLive(Long teamId) {
        ProcurementDeal deal =
                dealRepo.findByTeamId(teamId)
                        .orElseThrow(() -> new IllegalStateException("No deal for team " + teamId));
        deal.setLicenseRef(issueOrUpgradeAnnual(deal));
        deal.setStage(ProcurementDeal.STAGE_LIVE);
        deal = dealRepo.save(deal);
        log.info("[procurement] deal live team={} deal={}", teamId, deal.getDealId());
        return deal;
    }

    /**
     * Issue or upgrade the committed annual licence from the deal's accepted (else latest) quote,
     * stamping the full entitlement snapshot onto it and upgrading the trial licence in place when
     * one exists.
     */
    private String issueOrUpgradeAnnual(ProcurementDeal deal) {
        ProcurementQuote q =
                deal.getAcceptedQuoteId() != null
                        ? quoteRepo.findById(deal.getAcceptedQuoteId()).orElse(null)
                        : quoteRepo.findByDealIdOrderByCreatedAtDesc(deal.getDealId()).stream()
                                .findFirst()
                                .orElse(null);
        int term = q != null ? Math.max(1, q.getTermYears()) : 1;
        String deployment =
                q != null && q.getDeployment() != null && !q.getDeployment().isBlank()
                        ? q.getDeployment()
                        : "cloud";
        int seats = q != null && q.getSeats() != null ? q.getSeats() : 0; // 0 = unlimited
        LicenseEntitlements entitlements =
                new LicenseEntitlements(
                        q != null ? q.getVolume() : 0,
                        seats,
                        deployment,
                        term,
                        q != null ? q.getServiceLevel() : null,
                        q != null && q.isIndemnification(),
                        q != null && q.isTraining(),
                        q != null && q.isQbr(),
                        "airgap".equalsIgnoreCase(deployment), // offline .lic = air-gapped deploy
                        deal.getDealId(),
                        deal.getSubscriptionId());
        return licenses.issueAnnualLicense(
                deal.getTeamId(),
                leaderEmail(deal.getTeamId()),
                LocalDateTime.now().plusYears(term),
                deal.getLicenseRef(),
                entitlements);
    }

    /**
     * Check out the offline/air-gapped licence file (.lic) for a team. Available for an air-gapped
     * deployment (chosen at trial setup) from the trial licence onward — cloud/self-hosted verify
     * online against Keygen and don't get a file. Returns empty when there's no licence yet or the
     * deployment isn't air-gapped, so the controller can 404 rather than leak that a licence
     * exists. The certificate is generated on demand by Keygen (from whatever licence the deal
     * currently holds — trial or committed annual) and never stored.
     *
     * <p>By design a team can self-select air-gapped at trial and download a real signed .lic
     * before paying — that's bounded: the trial licence carries {@code expiry = trialEndsAt}, so
     * the file the verifier accepts self-expires at trial end. The buyer must re-download after
     * provisioning to get the committed-term file (the portal warns about this).
     */
    @Transactional(readOnly = true)
    public Optional<String> offlineLicenseFile(Long teamId) {
        ProcurementDeal deal = dealRepo.findByTeamId(teamId).orElse(null);
        if (deal == null || deal.getLicenseRef() == null) return Optional.empty();
        if (!"airgap".equalsIgnoreCase(deal.getDeployment())) return Optional.empty();
        return Optional.of(licenses.checkOutLicenseFile(deal.getLicenseRef()));
    }

    /**
     * Reset a team's procurement: delete the deal (quotes + activity cascade). For
     * re-demos/testing.
     */
    @Transactional
    public void resetDeal(Long teamId) {
        dealRepo.deleteByTeamId(teamId);
        log.info("[procurement] deal reset team={}", teamId);
    }

    private String nextQuoteNumber(Long dealId) {
        int seq = quoteRepo.findByDealIdOrderByCreatedAtDesc(dealId).size() + 1;
        String token = UUID.randomUUID().toString().substring(0, 4).toUpperCase(Locale.ROOT);
        return String.format(Locale.ROOT, "QT-%s-%04d", token, seq);
    }

    private String writeLineItems(QuoteBreakdown breakdown) {
        try {
            return OBJECT_MAPPER.writeValueAsString(breakdown.lineItems());
        } catch (JsonProcessingException e) {
            log.warn("[procurement] failed to serialise line items", e);
            return "[]";
        }
    }
}
