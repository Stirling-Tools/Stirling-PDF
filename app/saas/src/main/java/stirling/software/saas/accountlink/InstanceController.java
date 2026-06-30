package stirling.software.saas.accountlink;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
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
    private final AccountLinkService accountLinkService;

    public InstanceController(
            EntitlementService entitlementService,
            TeamBillingService billingService,
            AccountLinkService accountLinkService) {
        this.entitlementService = entitlementService;
        this.billingService = billingService;
        this.accountLinkService = accountLinkService;
    }

    public record WhoAmIResponse(Long instanceId, Long teamId) {}

    /**
     * Minimal entitlement view the local gate enforces against. {@code periodCapUnits} null =
     * uncapped. {@code state} is the coarse OK / OVER_LIMIT vocabulary the instance gate parses
     * (see {@link #coarseState}), not the SaaS feature-state enum.
     */
    public record EntitlementResponse(
            boolean subscribed,
            long freeRemainingUnits,
            long periodSpendUnits,
            Long periodCapUnits,
            String state) {}

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

    /**
     * Revokes this instance's own credential — a credential can mark itself revoked the same way a
     * session logs itself out. Called by the proprietary backend on local unlink so the SaaS row
     * gets {@code revoked_at} set; idempotent (already-revoked → still 204).
     */
    @PostMapping("/revoke-self")
    @PreAuthorize("hasRole('LINKED_INSTANCE')")
    public ResponseEntity<Void> revokeSelf(Authentication auth) {
        if (!(auth instanceof LinkedInstanceAuthenticationToken token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        accountLinkService.revoke(token.getTeamId(), token.getInstanceId());
        return ResponseEntity.noContent().build();
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
                        coarseState(snap.state())));
    }

    /**
     * Collapses the SaaS feature-state machine into the OK / OVER_LIMIT vocabulary the instance
     * gate parses. DEGRADED means automation + AI are gated off — which, for a gate that governs
     * only billable work (manual tools are free-pathed before it), is exactly OVER_LIMIT; FULL and
     * WARNED are OK.
     */
    private static String coarseState(EntitlementState state) {
        return state == EntitlementState.DEGRADED ? "OVER_LIMIT" : "OK";
    }
}
