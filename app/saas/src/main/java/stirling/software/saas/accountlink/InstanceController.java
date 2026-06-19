package stirling.software.saas.accountlink;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.extern.slf4j.Slf4j;

/**
 * Instance-facing surface (combined-billing "Mode A"), authenticated by the <b>device
 * credential</b> — not a user JWT. Separate path prefix ({@code /api/v1/instance/**}) so the device
 * credential is scoped here and nowhere else.
 *
 * <p>{@code GET /whoami} is the MVP round-trip proof: a registered instance presenting a valid
 * device credential gets back its resolved {@code instanceId} + {@code teamId}. The team-scoped
 * entitlement read (which the local gate consumes) builds on this same auth.
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

    public record WhoAmIResponse(Long instanceId, Long teamId) {}

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
}
