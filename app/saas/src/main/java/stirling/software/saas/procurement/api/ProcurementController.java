package stirling.software.saas.procurement.api;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.saas.procurement.config.ProcurementConfigurationProperties;
import stirling.software.saas.procurement.model.ProcurementDeal;
import stirling.software.saas.procurement.model.ProcurementQuote;
import stirling.software.saas.procurement.model.QuoteDetails;
import stirling.software.saas.procurement.pricing.ProcurementPricingService;
import stirling.software.saas.procurement.pricing.QuoteConfig;
import stirling.software.saas.procurement.pricing.QuoteLineItem;
import stirling.software.saas.procurement.service.ProcurementService;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * The enterprise procurement journey for a linked team: read the deal snapshot, start/extend a
 * (mock-licensed) trial, build a server-priced quote, and accept it. Stripe checkout itself is a
 * Supabase edge function the portal calls with the accepted quote — this controller never touches
 * Stripe. The caller's team is resolved from the authenticated principal; a team id is never
 * trusted from the request. Mutations require the team leader.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/procurement")
@Profile("saas")
public class ProcurementController {

    // Local mapper to parse the stored line-items JSON; the saas context exposes no injectable
    // ObjectMapper bean.
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final ProcurementService procurement;
    private final ProcurementPricingService pricing;
    private final TeamMembershipRepository memberRepo;
    private final UserRepository userRepository;
    private final ProcurementConfigurationProperties config;

    public ProcurementController(
            ProcurementService procurement,
            ProcurementPricingService pricing,
            TeamMembershipRepository memberRepo,
            UserRepository userRepository,
            ProcurementConfigurationProperties config) {
        this.procurement = Objects.requireNonNull(procurement);
        this.pricing = Objects.requireNonNull(pricing);
        this.memberRepo = Objects.requireNonNull(memberRepo);
        this.userRepository = Objects.requireNonNull(userRepository);
        this.config = Objects.requireNonNull(config);
    }

    // ---- request / response DTOs -------------------------------------------

    public record QuoteRequest(
            long volume,
            int users,
            int intensity, // policy posture (runs/PDF): 2 / 4 / 7; 0 → default Governed
            double sizeMult, // PDF-size tier multiplier: 1.0 / 1.4 / 2.4; 0 → no uplift
            String deployment,
            int termYears,
            String serviceLevel,
            boolean indemnification,
            boolean training,
            boolean qbr,
            String currency,
            String businessName,
            // Buyer / AP details (all optional). Country + currency intentionally out of scope.
            String contactName,
            String contactEmail,
            String addressLine1,
            String addressLine2,
            String city,
            String region,
            String postalCode,
            String poNumber,
            String taxId) {
        QuoteConfig toConfig() {
            return new QuoteConfig(
                    volume,
                    users,
                    intensity,
                    sizeMult,
                    deployment,
                    termYears,
                    serviceLevel,
                    indemnification,
                    training,
                    qbr,
                    currency);
        }

        QuoteDetails toDetails() {
            return new QuoteDetails(
                    businessName,
                    contactName,
                    contactEmail,
                    addressLine1,
                    addressLine2,
                    city,
                    region,
                    postalCode,
                    poNumber,
                    taxId);
        }
    }

    public record QuoteResponse(
            Long quoteId,
            String quoteNumber,
            String status,
            String currency,
            long annualNetMinor,
            long tcvMinor,
            // First post-term renewal fee after the CPI escalator, and that escalator as a whole
            // percent — the committed term is flat, so these describe only the auto-renewal.
            long renewalAnnualNetMinor,
            int cpiRatePct,
            List<QuoteLineItem> lineItems,
            String validUntil,
            String stripeQuoteId,
            String invoiceUrl,
            String invoicePdf,
            QuoteConfigEcho config) {}

    /**
     * The inputs the quote was priced from, echoed back so the builder can seed itself when the
     * buyer re-edits an existing quote. {@code users} is not persisted (only the resulting volume
     * is), so it is always 0 here; the builder treats the seeded volume as manually set.
     */
    public record QuoteConfigEcho(
            long volume,
            int users,
            int intensity,
            double sizeMult,
            String deployment,
            int termYears,
            String serviceLevel,
            boolean indemnification,
            boolean training,
            boolean qbr,
            String currency,
            String businessName,
            String contactName,
            String contactEmail,
            String addressLine1,
            String addressLine2,
            String city,
            String region,
            String postalCode,
            String poNumber,
            String taxId) {}

    /** Trial setup captured before the trial starts: deployment target + seat count. */
    public record StartTrialRequest(String deployment, int users) {}

    public record SnapshotResponse(
            Long dealId,
            String stage,
            String deployment,
            int seats,
            String trialStartedAt,
            String trialEndsAt,
            int trialExtensionsUsed,
            boolean licensed,
            String licenseKey,
            QuoteResponse latestQuote) {}

    // ---- endpoints ----------------------------------------------------------

    /**
     * The team's deal snapshot. Always 200 with a single shape; an unstarted procurement returns an
     * empty snapshot ({@code dealId == null}) so the portal can render the "start" state without
     * special-casing an empty body.
     */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SnapshotResponse> snapshot(Authentication auth) {
        Optional<TeamMembership> membership = primaryMembership(auth);
        if (membership.isEmpty()) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        Long teamId = membership.get().getTeam().getId();
        // The licence key is the team's secret entitlement — leader-only. Members still see the
        // journey (stage, trial, quote) but the key is withheld; the .lic file is likewise gated.
        boolean leader = membership.get().getRole() == TeamRole.LEADER;
        return ResponseEntity.ok(
                procurement.getDeal(teamId).map(d -> toSnapshot(d, leader)).orElse(EMPTY_SNAPSHOT));
    }

    private static final SnapshotResponse EMPTY_SNAPSHOT =
            new SnapshotResponse(null, null, null, 0, null, null, 0, false, null, null);

    /**
     * Download the offline / air-gapped licence file (.lic) for the team — available for an
     * air-gapped deployment from the trial licence onward. 404 when there's no licence yet or the
     * deployment isn't air-gapped, so we don't leak that a licence exists.
     */
    @GetMapping("/license/file")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<String> licenseFile(Authentication auth) {
        // Leader-only: the offline .lic is the team's portable entitlement, not a member artefact.
        Long teamId = requireLeader(auth);
        if (teamId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return procurement
                .offlineLicenseFile(teamId)
                .<ResponseEntity<String>>map(
                        cert ->
                                ResponseEntity.ok()
                                        .header(
                                                HttpHeaders.CONTENT_DISPOSITION,
                                                "attachment; filename=\"stirling-enterprise.lic\"")
                                        .contentType(MediaType.TEXT_PLAIN)
                                        .body(cert))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/trial/start")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SnapshotResponse> startTrial(
            @RequestBody(required = false) StartTrialRequest request, Authentication auth) {
        Long teamId = requireLeader(auth);
        if (teamId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        // Body is optional so an older client (no setup step) still starts a cloud trial.
        String deployment = request != null ? request.deployment() : null;
        int seats = request != null ? request.users() : 0;
        return ResponseEntity.ok(
                toSnapshot(procurement.startTrial(teamId, deployment, seats), true));
    }

    @PostMapping("/trial/extend")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SnapshotResponse> extendTrial(Authentication auth) {
        Long teamId = requireLeader(auth);
        if (teamId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        try {
            return ResponseEntity.ok(toSnapshot(procurement.extendTrial(teamId), true));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
    }

    @PostMapping("/quote")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<QuoteResponse> buildQuote(
            @RequestBody QuoteRequest request, Authentication auth) {
        Long teamId = requireLeader(auth);
        if (teamId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(
                toQuote(procurement.buildQuote(teamId, request.toConfig(), request.toDetails())));
    }

    // Issue + accept are Supabase edge functions (they own Stripe): issue-procurement-quote turns a
    // draft into a finalized Stripe Quote; accept-procurement-quote accepts it into a subscription.
    // Both persist their results via SECURITY DEFINER RPCs; the snapshot above reflects them.

    /**
     * Advance an issued quote to the agreement (security) stage, where the buyer reviews + agrees.
     */
    @PostMapping("/agreement")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SnapshotResponse> startAgreement(Authentication auth) {
        Long teamId = requireLeader(auth);
        if (teamId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        try {
            return ResponseEntity.ok(toSnapshot(procurement.startAgreement(teamId), true));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
    }

    /**
     * Provision on accept: upgrade the team's licence to the committed annual term, valid
     * immediately. Called server-side by the accept edge function (ROLE_ADMIN via X-API-Key) once
     * the subscription + invoice exist, so the buyer is licensed the moment they accept — the deal
     * stays in the payment step until the invoice settles. Idempotent.
     */
    @PostMapping("/provision")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> provision(@RequestParam("teamId") long teamId) {
        try {
            procurement.provisionLicense(teamId);
            return ResponseEntity.ok().build();
        } catch (IllegalStateException e) {
            log.warn("[procurement] provision rejected team={}: {}", teamId, e.getMessage());
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
    }

    /**
     * Demo/manual stand-in for the {@code invoice.paid} webhook: mark the deal live (issue the
     * annual licence, advance to active). The real go-live is webhook-driven once payment settles.
     */
    @PostMapping("/go-live")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SnapshotResponse> goLive(Authentication auth) {
        if (!config.isDemoControlsEnabled()) return ResponseEntity.notFound().build();
        Long teamId = requireLeader(auth);
        if (teamId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        try {
            return ResponseEntity.ok(toSnapshot(procurement.markLive(teamId), true));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
    }

    /** Reset the team's procurement (delete the deal + quotes); returns the empty snapshot. */
    @PostMapping("/reset")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SnapshotResponse> reset(Authentication auth) {
        if (!config.isDemoControlsEnabled()) return ResponseEntity.notFound().build();
        Long teamId = requireLeader(auth);
        if (teamId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        procurement.resetDeal(teamId);
        return ResponseEntity.ok(EMPTY_SNAPSHOT);
    }

    // ---- helpers ------------------------------------------------------------

    /** The caller's primary team membership; empty when unauthenticated/teamless. */
    private Optional<TeamMembership> primaryMembership(Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return Optional.empty();
        }
        return memberRepo.findPrimaryMembership(user.getId()).stream().findFirst();
    }

    /** Team id only when the caller is the team leader; null otherwise (commercial actions). */
    private Long requireLeader(Authentication auth) {
        return primaryMembership(auth)
                .filter(m -> m.getRole() == TeamRole.LEADER)
                .map(m -> m.getTeam().getId())
                .orElse(null);
    }

    /**
     * Build the snapshot for a deal. {@code includeLicenseKey} is true only for the team leader; a
     * member sees {@code licensed} but not the key itself (see {@link #snapshot}). Mutation
     * endpoints are leader-gated, so they always pass true.
     */
    private SnapshotResponse toSnapshot(ProcurementDeal deal, boolean includeLicenseKey) {
        QuoteResponse latest =
                procurement.quotesForDeal(deal.getDealId()).stream()
                        .findFirst()
                        .map(this::toQuote)
                        .orElse(null);
        return new SnapshotResponse(
                deal.getDealId(),
                deal.getStage(),
                deal.getDeployment(),
                deal.getSeats(),
                str(deal.getTrialStartedAt()),
                str(deal.getTrialEndsAt()),
                deal.getTrialExtensionsUsed(),
                deal.getLicenseRef() != null,
                includeLicenseKey ? deal.getLicenseRef() : null,
                latest);
    }

    private QuoteResponse toQuote(ProcurementQuote q) {
        return new QuoteResponse(
                q.getQuoteId(),
                q.getQuoteNumber(),
                q.getStatus(),
                q.getCurrency(),
                q.getAnnualNetMinor(),
                q.getTcvMinor(),
                // Prefer the renewal locked at quote time; fall back to a live projection for
                // quotes
                // priced before the column existed.
                q.getRenewalAnnualMinor() > 0
                        ? q.getRenewalAnnualMinor()
                        : pricing.renewalAnnualMinor(q.getAnnualNetMinor()),
                pricing.cpiRatePct(),
                parseLineItems(q.getLineItemsJson()),
                q.getValidUntil() == null ? null : q.getValidUntil().toString(),
                q.getStripeQuoteId(),
                q.getStripeInvoiceUrl(),
                q.getStripeInvoicePdf(),
                new QuoteConfigEcho(
                        q.getVolume(),
                        0,
                        q.getIntensity(),
                        q.getSizeMult(),
                        q.getDeployment(),
                        q.getTermYears(),
                        q.getServiceLevel(),
                        q.isIndemnification(),
                        q.isTraining(),
                        q.isQbr(),
                        q.getCurrency(),
                        q.getBusinessName(),
                        q.getContactName(),
                        q.getContactEmail(),
                        q.getAddressLine1(),
                        q.getAddressLine2(),
                        q.getCity(),
                        q.getRegion(),
                        q.getPostalCode(),
                        q.getPoNumber(),
                        q.getTaxId()));
    }

    private List<QuoteLineItem> parseLineItems(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return OBJECT_MAPPER.readValue(
                    json,
                    OBJECT_MAPPER
                            .getTypeFactory()
                            .constructCollectionType(List.class, QuoteLineItem.class));
        } catch (Exception e) {
            log.warn("[procurement] failed to parse line items", e);
            return List.of();
        }
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
