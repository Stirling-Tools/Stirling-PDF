package stirling.software.saas.payg.api;

import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.TeamRole;
import stirling.software.proprietary.model.TeamMembership;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.saas.payg.bundle.PrepaidPurchaseService;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Prepaid-bundle purchase surface. {@code POST /api/v1/payg/bundle/quote} server-prices a capacity
 * request and returns a short-lived quote ticket the portal hands to the
 * create-payg-bundle-checkout edge function (which owns Stripe — this controller never touches it,
 * mirroring {@link stirling.software.saas.procurement.api.ProcurementController}).
 *
 * <p>Buying prepaid capacity is a commercial action, so it is <b>leader-only</b>: the team is
 * resolved from the authenticated principal (never trusted from the request), and a member gets
 * 403. Crediting the pool happens only on the Stripe webhook (idempotent on the session id via
 * {@code payg_credit_bundle}), never on a client callback.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/payg/bundle")
@Profile("saas")
public class PaygBundleController {

    private static final DateTimeFormatter ISO_DATE_TIME = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

    private final PrepaidPurchaseService purchaseService;
    private final TeamMembershipRepository memberRepo;
    private final UserRepository userRepository;

    public PaygBundleController(
            PrepaidPurchaseService purchaseService,
            TeamMembershipRepository memberRepo,
            UserRepository userRepository) {
        this.purchaseService = Objects.requireNonNull(purchaseService, "purchaseService");
        this.memberRepo = Objects.requireNonNull(memberRepo, "memberRepo");
        this.userRepository = Objects.requireNonNull(userRepository, "userRepository");
    }

    /** Requested prepaid capacity in units — the buyer's chosen 12-month pool size. */
    public record QuoteRequest(@Min(1) long units) {}

    /**
     * A priced quote for the calculator/checkout. Money fields are minor units of {@link #currency}
     * and null when the rate is unknown; {@code unitAmountMinor} may be fractional. {@code
     * expiresAt} is ISO local date-time.
     */
    public record QuoteResponse(
            long quoteId,
            long units,
            String currency,
            BigDecimal unitAmountMinor,
            Long listAmountMinor,
            Long totalAmountMinor,
            Long savingsMinor,
            int monthsGranted,
            int monthsPaid,
            String expiresAt) {}

    @PostMapping("/quote")
    @PreAuthorize("isAuthenticated()")
    @Transactional
    public ResponseEntity<QuoteResponse> quote(
            @Valid @RequestBody QuoteRequest req, Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<TeamMembership> primary = primaryMembership(user.getId());
        if (primary.isEmpty() || primary.get().getRole() != TeamRole.LEADER) {
            // Members (and team-less callers) can see prepaid state but not buy it.
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        Long teamId = primary.get().getTeam().getId();

        try {
            PrepaidPurchaseService.PrepaidQuote q = purchaseService.quote(teamId, req.units());
            return ResponseEntity.ok(toResponse(q));
        } catch (IllegalArgumentException e) {
            log.debug("bundle quote rejected for team {}: {}", teamId, e.getMessage());
            return ResponseEntity.badRequest().build();
        }
    }

    private static QuoteResponse toResponse(PrepaidPurchaseService.PrepaidQuote q) {
        return new QuoteResponse(
                q.quoteId(),
                q.units(),
                q.currency(),
                q.unitAmountMinor(),
                q.listAmountMinor(),
                q.totalAmountMinor(),
                q.savingsMinor(),
                q.monthsGranted(),
                q.monthsPaid(),
                ISO_DATE_TIME.format(q.expiresAt()));
    }

    private Optional<TeamMembership> primaryMembership(Long userId) {
        List<TeamMembership> rows = memberRepo.findPrimaryMembership(userId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }
}
