package stirling.software.proprietary.accountlink;

import java.io.IOException;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.extern.slf4j.Slf4j;

/**
 * Same-origin account-link surface on the self-hosted instance (combined-billing "Mode A").
 *
 * <p>The portal (served from this same origin, admin authenticated by the existing self-hosted
 * security chain) calls these. {@code POST /link} relays the admin's Supabase JWT to the SaaS
 * backend, which mints + returns a device credential we store locally. {@code GET /status} backs
 * the portal's link card.
 *
 * <p>Admin-only, {@code @Profile("!saas")}, gated behind {@code
 * stirling.billing.account-link.enabled} — off → bean absent → 404.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/account-link")
@Profile("!saas")
@PreAuthorize("hasRole('ADMIN')")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class AccountLinkController {

    private final AccountLinkService service;

    public AccountLinkController(AccountLinkService service) {
        this.service = service;
    }

    /** {@code supabaseJwt} is the admin's short-lived token the portal already holds. */
    public record LinkRequest(String supabaseJwt, String name) {}

    @PostMapping("/link")
    public ResponseEntity<?> link(@RequestBody LinkRequest req) {
        if (req == null || req.supabaseJwt() == null || req.supabaseJwt().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(java.util.Map.of("error", "supabaseJwt is required"));
        }
        try {
            return ResponseEntity.ok(service.link(req.supabaseJwt(), req.name()));
        } catch (AccountLinkClient.UpstreamException e) {
            // Auth failures are the admin's token, not a gateway fault: surface 401/403 as-is so
            // the portal can prompt a re-sign-in. Anything else upstream → 502. Don't echo the
            // raw upstream body back to the browser.
            HttpStatus status =
                    e.status() == HttpStatus.UNAUTHORIZED.value()
                                    || e.status() == HttpStatus.FORBIDDEN.value()
                            ? HttpStatus.valueOf(e.status())
                            : HttpStatus.BAD_GATEWAY;
            log.warn("Account-link register rejected upstream: HTTP {}", e.status());
            return ResponseEntity.status(status).body(java.util.Map.of("error", "LINK_FAILED"));
        } catch (IOException e) {
            // Don't echo e.getMessage() to the browser: a DNS/connection/TLS failure can carry the
            // configured SaaS host/IP. Log it server-side; return the same opaque body the
            // UpstreamException branch does.
            log.warn("Account-link failed (transport): {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(java.util.Map.of("error", "LINK_FAILED"));
        }
    }

    @GetMapping("/status")
    public ResponseEntity<AccountLinkService.LinkStatus> status() {
        return ResponseEntity.ok(service.status());
    }

    @PostMapping("/unlink")
    public ResponseEntity<Void> unlink() {
        service.unlink();
        return ResponseEntity.noContent().build();
    }
}
