package stirling.software.saas.payg.api;

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
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.stripe.StripeCustomerDetailsDao;
import stirling.software.saas.security.UserTeamResolver;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Read-only billing-details surface for the Usage &amp; Billing page's Payment section.
 *
 * <p>{@code GET /api/v1/payg/billing-details} returns who the team is billed to and where its
 * invoices go, sourced from {@code stripe.customers}. The caller's team is resolved from the
 * authenticated principal — never trusted from the request — exactly as {@link
 * PaygPaymentMethodController} and {@link PaygInvoicesController} do.
 *
 * <p>There is no write path, and that is deliberate rather than unfinished: the Stripe schema is a
 * one-way mirror, so updating these would mean calling Stripe and waiting for the change to sync
 * back. Stripe's hosted customer portal already edits them, and the page's Update doors open it,
 * which keeps one writer for data Stripe owns.
 *
 * <p>Next-invoice timing is not served here. The wallet already carries the billing period end, and
 * a second source for the same date could only disagree with the first.
 *
 * <p>Defensive throughout: no team, no {@code stripe_customer_id} (free / pre-checkout), or the
 * customer simply not in the mirror all degrade to {@code 200 present=false} rather than an error,
 * so the section renders without these rows instead of failing the page.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/payg")
@Profile("saas")
public class PaygBillingDetailsController {

    /** {@code present=false} carries no detail fields; either field may be null when present. */
    public record BillingDetailsResponse(boolean present, String companyName, String invoiceEmail) {
        static BillingDetailsResponse absent() {
            return new BillingDetailsResponse(false, null, null);
        }
    }

    private final StripeCustomerDetailsDao customerDetailsDao;
    private final PaygTeamExtensionsRepository extRepo;
    private final UserTeamResolver userTeamResolver;
    private final UserRepository userRepository;

    public PaygBillingDetailsController(
            StripeCustomerDetailsDao customerDetailsDao,
            PaygTeamExtensionsRepository extRepo,
            UserTeamResolver userTeamResolver,
            UserRepository userRepository) {
        this.customerDetailsDao = Objects.requireNonNull(customerDetailsDao, "customerDetailsDao");
        this.extRepo = Objects.requireNonNull(extRepo, "extRepo");
        this.userTeamResolver = Objects.requireNonNull(userTeamResolver, "userTeamResolver");
        this.userRepository = Objects.requireNonNull(userRepository, "userRepository");
    }

    @GetMapping("/billing-details")
    @PreAuthorize("isAuthenticated()")
    @Transactional(readOnly = true)
    public ResponseEntity<BillingDetailsResponse> get(Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Optional<Long> resolvedTeam = userTeamResolver.teamId(user);
        if (resolvedTeam.isEmpty()) {
            return ResponseEntity.ok(BillingDetailsResponse.absent());
        }

        Optional<PaygTeamExtensions> ext = extRepo.findById(resolvedTeam.get());
        if (ext.isEmpty() || ext.get().getStripeCustomerId() == null) {
            return ResponseEntity.ok(BillingDetailsResponse.absent());
        }

        return ResponseEntity.ok(
                customerDetailsDao
                        .findDetails(ext.get().getStripeCustomerId())
                        .map(
                                d ->
                                        new BillingDetailsResponse(
                                                true, d.companyName(), d.invoiceEmail()))
                        .orElseGet(BillingDetailsResponse::absent));
    }
}
