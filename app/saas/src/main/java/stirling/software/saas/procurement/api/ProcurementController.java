package stirling.software.saas.procurement.api;

import java.util.List;
import java.util.Objects;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.procurement.model.ProcurementDeal;
import stirling.software.saas.procurement.model.ProcurementQuote;
import stirling.software.saas.procurement.pricing.QuoteConfig;
import stirling.software.saas.procurement.pricing.QuoteLineItem;
import stirling.software.saas.procurement.service.ProcurementService;
import stirling.software.saas.repository.TeamMembershipRepository;
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
    private final TeamMembershipRepository memberRepo;
    private final UserRepository userRepository;

    public ProcurementController(
            ProcurementService procurement,
            TeamMembershipRepository memberRepo,
            UserRepository userRepository) {
        this.procurement = Objects.requireNonNull(procurement);
        this.memberRepo = Objects.requireNonNull(memberRepo);
        this.userRepository = Objects.requireNonNull(userRepository);
    }

    // ---- request / response DTOs -------------------------------------------

    public record QuoteRequest(
            long volume,
            int users,
            String deployment,
            int termYears,
            String serviceLevel,
            boolean indemnification,
            boolean training,
            boolean qbr,
            String currency) {
        QuoteConfig toConfig() {
            return new QuoteConfig(
                    volume,
                    users,
                    deployment,
                    termYears,
                    serviceLevel,
                    indemnification,
                    training,
                    qbr,
                    currency);
        }
    }

    public record QuoteResponse(
            Long quoteId,
            String quoteNumber,
            String status,
            String currency,
            long annualNetMinor,
            long tcvMinor,
            List<QuoteLineItem> lineItems,
            String validUntil,
            String checkoutFunction) {}

    public record SnapshotResponse(
            Long dealId,
            String stage,
            String trialStartedAt,
            String trialEndsAt,
            int trialExtensionsUsed,
            boolean licensed,
            QuoteResponse latestQuote) {}

    public record EstimateResponse(long annualVolume) {}

    // ---- endpoints ----------------------------------------------------------

    /**
     * The team's deal snapshot. Always 200 with a single shape; an unstarted procurement returns an
     * empty snapshot ({@code dealId == null}) so the portal can render the "start" state without
     * special-casing an empty body.
     */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SnapshotResponse> snapshot(Authentication auth) {
        Long teamId = resolveTeam(auth);
        if (teamId == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        return ResponseEntity.ok(
                procurement.getDeal(teamId).map(this::toSnapshot).orElse(EMPTY_SNAPSHOT));
    }

    private static final SnapshotResponse EMPTY_SNAPSHOT =
            new SnapshotResponse(null, null, null, null, 0, false, null);

    @GetMapping("/estimate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<EstimateResponse> estimate(@RequestParam("users") int users) {
        return ResponseEntity.ok(new EstimateResponse(procurement.estimateAnnualVolume(users)));
    }

    @PostMapping("/trial/start")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SnapshotResponse> startTrial(Authentication auth) {
        Long teamId = requireLeader(auth);
        if (teamId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        return ResponseEntity.ok(toSnapshot(procurement.startTrial(teamId)));
    }

    @PostMapping("/trial/extend")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SnapshotResponse> extendTrial(Authentication auth) {
        Long teamId = requireLeader(auth);
        if (teamId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        try {
            return ResponseEntity.ok(toSnapshot(procurement.extendTrial(teamId)));
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
        return ResponseEntity.ok(toQuote(procurement.buildQuote(teamId, request.toConfig())));
    }

    @PostMapping("/quote/{quoteId}/accept")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<QuoteResponse> acceptQuote(
            @PathVariable Long quoteId, Authentication auth) {
        Long teamId = requireLeader(auth);
        if (teamId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        try {
            return ResponseEntity.ok(toQuote(procurement.acceptQuote(teamId, quoteId)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
    }

    /** Reset the team's procurement (delete the deal + quotes); returns the empty snapshot. */
    @PostMapping("/reset")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SnapshotResponse> reset(Authentication auth) {
        Long teamId = requireLeader(auth);
        if (teamId == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        procurement.resetDeal(teamId);
        return ResponseEntity.ok(EMPTY_SNAPSHOT);
    }

    // ---- helpers ------------------------------------------------------------

    /**
     * Resolve the caller's team from their primary membership; null when unauthenticated/teamless.
     */
    private Long resolveTeam(Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return null;
        }
        List<TeamMembership> rows = memberRepo.findPrimaryMembership(user.getId());
        return rows.isEmpty() ? null : rows.get(0).getTeam().getId();
    }

    /** Team id only when the caller is the team leader; null otherwise (commercial actions). */
    private Long requireLeader(Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return null;
        }
        List<TeamMembership> rows = memberRepo.findPrimaryMembership(user.getId());
        if (rows.isEmpty() || rows.get(0).getRole() != TeamRole.LEADER) return null;
        return rows.get(0).getTeam().getId();
    }

    private SnapshotResponse toSnapshot(ProcurementDeal deal) {
        QuoteResponse latest =
                procurement.quotesForDeal(deal.getDealId()).stream()
                        .findFirst()
                        .map(this::toQuote)
                        .orElse(null);
        return new SnapshotResponse(
                deal.getDealId(),
                deal.getStage(),
                str(deal.getTrialStartedAt()),
                str(deal.getTrialEndsAt()),
                deal.getTrialExtensionsUsed(),
                deal.getLicenseRef() != null,
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
                parseLineItems(q.getLineItemsJson()),
                q.getValidUntil() == null ? null : q.getValidUntil().toString(),
                procurement.checkoutFunctionName());
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
