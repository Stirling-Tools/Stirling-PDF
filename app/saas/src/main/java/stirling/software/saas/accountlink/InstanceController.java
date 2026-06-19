package stirling.software.saas.accountlink;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
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

import stirling.software.saas.payg.billing.TeamBillingContext;
import stirling.software.saas.payg.billing.TeamBillingService;
import stirling.software.saas.payg.entitlement.EntitlementService;
import stirling.software.saas.payg.entitlement.EntitlementSnapshot;
import stirling.software.saas.payg.model.EntitlementState;

/**
 * Instance-facing surface (combined-billing "Mode A"), authenticated by the <b>device
 * credential</b> — not a user JWT. Separate path prefix ({@code /api/v1/instance/**}) so the device
 * credential is scoped here and nowhere else.
 *
 * <p>{@code GET /whoami} is the MVP round-trip proof: a registered instance presenting a valid
 * device credential gets back its resolved {@code instanceId} + {@code teamId}. {@code GET
 * /entitlement} is the read the local gate consumes — the same team-scoped snapshot the FE wallet
 * sees, trimmed to the fields the gate needs (subscription, free pool, period spend/cap, state),
 * and built on the same device-credential auth.
 *
 * <p>Gated behind {@code stirling.billing.account-link.enabled}: off → beans absent → 404.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/instance")
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class InstanceController {

    private final EntitlementService entitlementService;
    private final TeamBillingService billingService;

    public InstanceController(
            EntitlementService entitlementService, TeamBillingService billingService) {
        this.entitlementService = entitlementService;
        this.billingService = billingService;
    }

    public record WhoAmIResponse(Long instanceId, Long teamId) {}

    /**
     * Minimal entitlement view the local gate enforces against. {@code periodCapUnits} null =
     * uncapped.
     */
    public record EntitlementResponse(
            boolean subscribed,
            long freeRemainingUnits,
            long periodSpendUnits,
            Long periodCapUnits,
            EntitlementState state) {}

    @GetMapping("/whoami")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public ResponseEntity<WhoAmIResponse> whoami(Authentication auth) {
        if (!(auth instanceof LinkedInstanceAuthenticationToken token)) {
            // Belt-and-braces: hasRole already guarantees this, but never leak a non-instance
            // principal.
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(new WhoAmIResponse(token.getInstanceId(), token.getTeamId()));
    }

    @GetMapping("/entitlement")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    @Transactional(readOnly = true)
    public ResponseEntity<EntitlementResponse> entitlement(Authentication auth) {
        if (!(auth instanceof LinkedInstanceAuthenticationToken token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        Long teamId = token.getTeamId();

        // Same composition the FE wallet uses: billing facts (subscription, free pool) from
        // TeamBillingService, period spend/cap + state from the entitlement snapshot.
        TeamBillingContext billing = billingService.forTeam(teamId);
        EntitlementSnapshot snap = entitlementService.getSnapshot(teamId);

        return ResponseEntity.ok(
                new EntitlementResponse(
                        billing.subscribed(),
                        billing.freeRemainingUnits(),
                        snap.periodSpendUnits(),
                        snap.periodCapUnits(),
                        snap.state()));
    }
}
