package stirling.software.saas.payg.api;

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
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.model.TeamMembership;
import stirling.software.saas.payg.policy.PaygTeamExtensions;
import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.stripe.StripePaymentMethodDao;
import stirling.software.saas.repository.TeamMembershipRepository;
import stirling.software.saas.util.AuthenticationUtils;

/**
 * Read-only default-payment-method surface for the subscribed billing page.
 *
 * <p>{@code GET /api/v1/payg/payment-method} returns the team's default card (brand / last4 /
 * expiry), sourced from {@code stripe.payment_methods} (Sync Engine mirror). The caller's team is
 * resolved from the authenticated principal — never trusted from the request — exactly as {@link
 * PaygInvoicesController} does.
 *
 * <p>Defensive: no team, no {@code stripe_customer_id} (free / pre-checkout), or the card simply
 * not in the mirror all degrade to {@code 200 present=false} rather than an error. Card edits never
 * happen here; the portal deep-links to Stripe's hosted customer portal for that.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/payg")
@Profile("saas")
public class PaygPaymentMethodController {

    /** Trimmed default-card shape. {@code present=false} carries no card fields. */
    public record PaymentMethodResponse(
            boolean present, String brand, String last4, Integer expMonth, Integer expYear) {
        static PaymentMethodResponse absent() {
            return new PaymentMethodResponse(false, null, null, null, null);
        }
    }

    private final StripePaymentMethodDao paymentMethodDao;
    private final PaygTeamExtensionsRepository extRepo;
    private final TeamMembershipRepository memberRepo;
    private final UserRepository userRepository;

    public PaygPaymentMethodController(
            StripePaymentMethodDao paymentMethodDao,
            PaygTeamExtensionsRepository extRepo,
            TeamMembershipRepository memberRepo,
            UserRepository userRepository) {
        this.paymentMethodDao = Objects.requireNonNull(paymentMethodDao, "paymentMethodDao");
        this.extRepo = Objects.requireNonNull(extRepo, "extRepo");
        this.memberRepo = Objects.requireNonNull(memberRepo, "memberRepo");
        this.userRepository = Objects.requireNonNull(userRepository, "userRepository");
    }

    @GetMapping("/payment-method")
    @PreAuthorize("isAuthenticated()")
    @Transactional(readOnly = true)
    public ResponseEntity<PaymentMethodResponse> get(Authentication auth) {
        User user;
        try {
            user = AuthenticationUtils.getCurrentUser(auth, userRepository);
        } catch (SecurityException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<TeamMembership> rows = memberRepo.findPrimaryMembership(user.getId());
        if (rows.isEmpty()) {
            return ResponseEntity.ok(PaymentMethodResponse.absent());
        }
        Long teamId = rows.get(0).getTeam().getId();

        Optional<PaygTeamExtensions> ext = extRepo.findById(teamId);
        if (ext.isEmpty() || ext.get().getStripeCustomerId() == null) {
            return ResponseEntity.ok(PaymentMethodResponse.absent());
        }

        return ResponseEntity.ok(
                paymentMethodDao
                        .findDefaultCard(ext.get().getStripeCustomerId())
                        .map(
                                c ->
                                        new PaymentMethodResponse(
                                                true,
                                                c.brand(),
                                                c.last4(),
                                                c.expMonth(),
                                                c.expYear()))
                        .orElseGet(PaymentMethodResponse::absent));
    }
}
