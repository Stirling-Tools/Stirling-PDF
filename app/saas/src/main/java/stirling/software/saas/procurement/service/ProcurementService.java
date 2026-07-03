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

import stirling.software.saas.procurement.config.ProcurementConfigurationProperties;
import stirling.software.saas.procurement.license.EnterpriseLicenseService;
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

    public ProcurementService(
            ProcurementDealRepository dealRepo,
            ProcurementQuoteRepository quoteRepo,
            ProcurementPricingService pricing,
            EnterpriseLicenseService licenses,
            ProcurementConfigurationProperties config) {
        this.dealRepo = dealRepo;
        this.quoteRepo = quoteRepo;
        this.pricing = pricing;
        this.licenses = licenses;
        this.config = config;
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
     * Keygen licence, and the deal row is the journey state.
     */
    @Transactional
    public ProcurementDeal startTrial(Long teamId) {
        ProcurementDeal deal =
                dealRepo.findByTeamId(teamId).orElseGet(() -> new ProcurementDeal(teamId));
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime ends = now.plusDays(config.getTrialDurationDays());
        deal.setStage(ProcurementDeal.STAGE_TRIAL);
        deal.setTrialStartedAt(now);
        deal.setTrialEndsAt(ends);
        deal.setTrialExtensionsUsed(0);
        deal.setLicenseRef(licenses.issueTrialLicense(teamId, ends));
        deal = dealRepo.save(deal);
        log.info(
                "[procurement] trial started team={} deal={} ends={}",
                teamId,
                deal.getDealId(),
                ends);
        return deal;
    }

    /** Extend the current trial by the configured increment, up to the cap. */
    @Transactional
    public ProcurementDeal extendTrial(Long teamId) {
        ProcurementDeal deal =
                dealRepo.findByTeamId(teamId)
                        .orElseThrow(() -> new IllegalStateException("No deal for team " + teamId));
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
        if (ProcurementDeal.STAGE_TRIAL.equals(deal.getStage())) {
            deal.setStage(ProcurementDeal.STAGE_QUOTE);
        }
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
        quote.setDeployment(cfg.deployment());
        quote.setTermYears(cfg.termYears());
        quote.setServiceLevel(cfg.serviceLevel());
        quote.setIndemnification(cfg.indemnification());
        quote.setTraining(cfg.training());
        quote.setQbr(cfg.qbr());
        quote.setBusinessName(businessName);
        quote.setAnnualNetMinor(breakdown.annualNetMinor());
        quote.setTcvMinor(breakdown.tcvMinor());
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
     * Accept a quote: mark it accepted and advance the deal to the payment stage, where the portal
     * hands off to the checkout edge function. (Agreement e-sign is a later stage; for this slice
     * acceptance moves straight to payment.)
     */
    @Transactional
    public ProcurementQuote acceptQuote(Long teamId, Long quoteId) {
        ProcurementDeal deal =
                dealRepo.findByTeamId(teamId)
                        .orElseThrow(() -> new IllegalStateException("No deal for team " + teamId));
        ProcurementQuote quote =
                quoteRepo
                        .findById(quoteId)
                        .filter(q -> q.getDealId().equals(deal.getDealId()))
                        .orElseThrow(
                                () -> new IllegalArgumentException("Quote not found: " + quoteId));
        quote.setStatus(ProcurementQuote.STATUS_ACCEPTED);
        quote = quoteRepo.save(quote);
        deal.setAcceptedQuoteId(quote.getQuoteId());
        deal.setStage(ProcurementDeal.STAGE_PAYMENT);
        dealRepo.save(deal);
        log.info("[procurement] quote accepted team={} quote={}", teamId, quote.getQuoteNumber());
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
        deal.setStage(ProcurementDeal.STAGE_AGREEMENT);
        deal = dealRepo.save(deal);
        log.info("[procurement] agreement stage team={} deal={}", teamId, deal.getDealId());
        return deal;
    }

    /**
     * Mark the deal live: issue the annual licence and advance to the active stage. In production
     * this is driven by the {@code invoice.paid} webhook once the first invoice is settled; this
     * method is the demo/manual stand-in until that webhook lands.
     */
    @Transactional
    public ProcurementDeal markLive(Long teamId) {
        ProcurementDeal deal =
                dealRepo.findByTeamId(teamId)
                        .orElseThrow(() -> new IllegalStateException("No deal for team " + teamId));
        int term = 1;
        String deployment = "cloud";
        if (deal.getAcceptedQuoteId() != null) {
            ProcurementQuote q = quoteRepo.findById(deal.getAcceptedQuoteId()).orElse(null);
            if (q != null) {
                term = Math.max(1, q.getTermYears());
                if (q.getDeployment() != null && !q.getDeployment().isBlank()) {
                    deployment = q.getDeployment();
                }
            }
        }
        deal.setLicenseRef(
                licenses.issueAnnualLicense(
                        teamId, deployment, LocalDateTime.now().plusYears(term)));
        deal.setStage(ProcurementDeal.STAGE_LIVE);
        deal = dealRepo.save(deal);
        log.info("[procurement] deal live team={} deal={}", teamId, deal.getDealId());
        return deal;
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

    public long estimateAnnualVolume(int users) {
        return pricing.estimateAnnualVolume(users);
    }

    /**
     * The Supabase edge function the portal calls to create the Stripe checkout for an accepted
     * quote.
     */
    public String checkoutFunctionName() {
        return config.getCheckoutFunction();
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
