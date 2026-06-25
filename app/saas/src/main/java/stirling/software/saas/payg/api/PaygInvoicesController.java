package stirling.software.saas.payg.api;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.stripe.StripeInvoiceDao;
import stirling.software.saas.repository.TeamMembershipRepository;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Read-only Stripe-invoices surface for the linked org's billing page.
 *
 * <p>{@code GET /api/v1/payg/invoices?limit=N} returns the team's most recent Stripe invoices,
 * sourced from the {@code stripe.invoices} table the Sync Engine maintains. The caller's team is
 * resolved from the authenticated principal (same pattern as {@link PaygWalletController}); we
 * never trust a team id from the request.
 *
 * <p>Defensive: when the team has no {@code stripe_customer_id} (not subscribed, or pre-checkout)
 * or the {@code stripe} schema isn't synced (H2 tests, sync engine off), we return {@code 200} with
 * an empty list rather than 500 — the UI renders "no invoices yet". This keeps the page working
 * through every link/subscription state.
 *
 * <p>{@code hostedInvoiceUrl} + {@code invoicePdf} are Stripe-hosted links the portal can deep-link
 * from. We don't proxy the PDF ourselves; Stripe handles auth + caching.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/payg")
@Profile("saas")
public class PaygInvoicesController {

    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_LIMIT = 100;

    private final StripeInvoiceDao invoiceDao;
    private final PaygTeamExtensionsRepository extRepo;
    private final TeamMembershipRepository memberRepo;
    private final UserRepository userRepository;

    public PaygInvoicesController(
            StripeInvoiceDao invoiceDao,
            PaygTeamExtensionsRepository extRepo,
            TeamMembershipRepository memberRepo,
            UserRepository userRepository) {
        this.invoiceDao = Objects.requireNonNull(invoiceDao, "invoiceDao");
        this.extRepo = Objects.requireNonNull(extRepo, "extRepo");
        this.memberRepo = Objects.requireNonNull(memberRepo, "memberRepo");
        this.userRepository = Objects.requireNonNull(userRepository, "userRepository");
    }

    /** The shape the portal renders. Trimmed; never echoes raw Stripe object fields verbatim. */
    public record InvoiceResponse(
            String id,
            String number,
            String status,
            Long totalMinor,
            String currency,
            String createdAt,
            String periodStart,
            String periodEnd,
            String hostedInvoiceUrl,
            String invoicePdf,
            String description,
            Long pdfsProcessed) {}

    @GetMapping("/invoices")
    @PreAuthorize("isAuthenticated()")
    @Transactional(readOnly = true)
    public ResponseEntity<List<InvoiceResponse>> list(
            @RequestParam(name = "limit", required = false) Integer limit, Authentication auth) {

        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Resolve the caller's team from their primary membership — same pattern as
        // PaygWalletController. The team id NEVER comes from the request.
        List<TeamMembership> rows = memberRepo.findPrimaryMembership(user.getId());
        if (rows.isEmpty()) {
            return ResponseEntity.ok(List.of());
        }
        Long teamId = rows.get(0).getTeam().getId();

        // No PAYG extension row OR no Stripe customer id → team has never subscribed → no
        // invoices. Empty list, not 404 — the UI distinguishes "no invoices yet" from a
        // genuine error and we don't want to error a happy free team.
        Optional<PaygTeamExtensions> ext = extRepo.findById(teamId);
        if (ext.isEmpty() || ext.get().getStripeCustomerId() == null) {
            return ResponseEntity.ok(List.of());
        }

        int safeLimit = clampLimit(limit);
        List<InvoiceResponse> body =
                invoiceDao.findRecentByCustomer(ext.get().getStripeCustomerId(), safeLimit).stream()
                        .map(PaygInvoicesController::toResponse)
                        .toList();
        return ResponseEntity.ok(body);
    }

    private static int clampLimit(Integer requested) {
        if (requested == null) return DEFAULT_LIMIT;
        return Math.max(1, Math.min(requested, MAX_LIMIT));
    }

    private static InvoiceResponse toResponse(StripeInvoiceDao.InvoiceRow r) {
        return new InvoiceResponse(
                r.id(),
                r.number(),
                r.status(),
                r.totalMinor(),
                r.currency(),
                iso(r.createdAt()),
                iso(r.periodStart()),
                iso(r.periodEnd()),
                r.hostedInvoiceUrl(),
                r.invoicePdf(),
                r.description(),
                r.pdfsProcessed());
    }

    private static String iso(LocalDateTime ldt) {
        return ldt == null ? null : ldt.toString();
    }
}
