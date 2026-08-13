package stirling.software.proprietary.accountlink;

import java.io.IOException;

import org.springframework.beans.factory.ObjectProvider;
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

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

/**
 * Same-origin account-link surface on the self-hosted instance (combined-billing "Mode A").
 *
 * <p>The portal (served from this same origin, admin authenticated by the existing self-hosted
 * security chain) calls these. {@code POST /link} relays the admin's Supabase JWT to the SaaS
 * backend, which mints + returns a device credential we store locally. {@code GET /status} backs
 * the portal's link card; {@code GET /usage} exposes locally-accrued unsynced usage the portal adds
 * to SaaS-synced spend; {@code POST /sync-now} forces an immediate usage sync (ops "reconcile now"
 * / test aid).
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
    private final ConnectService connectService;
    private final LocalUsageService localUsageService;
    // Present only when metering is on (its own flag); absent → /sync-now reports 409.
    private final ObjectProvider<UsageSyncService> syncServiceProvider;

    public AccountLinkController(
            AccountLinkService service,
            ConnectService connectService,
            LocalUsageService localUsageService,
            ObjectProvider<UsageSyncService> syncServiceProvider) {
        this.service = service;
        this.connectService = connectService;
        this.localUsageService = localUsageService;
        this.syncServiceProvider = syncServiceProvider;
    }

    /**
     * {@code callbackUrl} is the portal telling us where its own callback route lives. Honoured
     * only when it matches the browser's {@code Origin}, so it is a way of knowing the frontend's
     * real origin and base path rather than a redirect the caller gets to choose.
     */
    public record ConnectStartRequest(String name, String callbackUrl) {}

    /** {@code nonce} comes from the callback fragment the approval page redirected to. */
    public record ConnectCompleteRequest(String nonce) {}

    /**
     * Opens a browser-mediated link handshake and returns the approval URL to send the admin to.
     *
     * <p>Supersedes {@code POST /link}, which needed the admin's SaaS JWT to reach this backend.
     * Here the token never comes near the server: it is delivered to the admin's own browser by the
     * approval page, and this backend collects only its device credential.
     */
    @PostMapping("/connect/start")
    public ResponseEntity<?> connectStart(
            @RequestBody(required = false) ConnectStartRequest req, HttpServletRequest http) {
        ConnectService.CallbackHint hint =
                new ConnectService.CallbackHint(
                        req != null ? req.callbackUrl() : null,
                        http.getHeader("Origin"),
                        baseUrlOf(http));
        try {
            return ResponseEntity.ok(connectService.start(req != null ? req.name() : null, hint));
        } catch (AccountLinkClient.UpstreamException e) {
            log.warn("Account-link connect rejected upstream: HTTP {}", e.status());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(java.util.Map.of("error", "CONNECT_FAILED"));
        } catch (IOException e) {
            // Same reasoning as /link: a transport message can carry the configured SaaS host.
            log.warn("Account-link connect failed (transport): {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(java.util.Map.of("error", "CONNECT_FAILED"));
        }
    }

    /** Called by the callback page with the nonce it found in the fragment. */
    @PostMapping("/connect/complete")
    public ResponseEntity<ConnectService.ConnectStatus> connectComplete(
            @RequestBody(required = false) ConnectCompleteRequest req) {
        return ResponseEntity.ok(connectService.complete(req != null ? req.nonce() : null));
    }

    @GetMapping("/connect/status")
    public ResponseEntity<ConnectService.ConnectStatus> connectStatus() {
        return ResponseEntity.ok(connectService.status());
    }

    @PostMapping("/connect/cancel")
    public ResponseEntity<Void> connectCancel() {
        connectService.cancel();
        return ResponseEntity.noContent().build();
    }

    /**
     * This instance's base URL as the browser reached it, including any context path so a subpath
     * deployment builds a callback that actually resolves. Honours {@code X-Forwarded-*} for the
     * common reverse-proxy case; an operator behind something that does not set them configures
     * {@code stirling.billing.account-link.public-url} instead.
     */
    private static String baseUrlOf(HttpServletRequest request) {
        String forwardedProto = firstHop(request.getHeader("X-Forwarded-Proto"));
        String forwardedHost = firstHop(request.getHeader("X-Forwarded-Host"));
        String scheme = forwardedProto != null ? forwardedProto : request.getScheme();
        String hostPort;
        if (forwardedHost != null) {
            hostPort = forwardedHost;
        } else {
            int port = request.getServerPort();
            boolean defaultPort =
                    ("http".equals(scheme) && port == 80)
                            || ("https".equals(scheme) && port == 443);
            hostPort = defaultPort ? request.getServerName() : request.getServerName() + ":" + port;
        }
        String context = request.getContextPath() == null ? "" : request.getContextPath();
        return scheme + "://" + hostPort + context;
    }

    private static String firstHop(String headerValue) {
        if (headerValue == null || headerValue.isBlank()) {
            return null;
        }
        String first = headerValue.split(",")[0].strip();
        return first.isEmpty() ? null : first;
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

    /**
     * Locally accrued usage not yet reported to SaaS — the portal adds it to the SaaS-synced spend
     * so "current usage" includes work done since the last daily sync.
     */
    @GetMapping("/usage")
    public ResponseEntity<LocalUsageService.LocalUsage> usage() {
        return ResponseEntity.ok(localUsageService.currentPeriodUnsynced());
    }

    /**
     * Forces an immediate usage sync to SaaS — the same work the daily scheduler does. An admin
     * "reconcile now" action (and a test aid so you don't wait on the scheduler). Idempotent:
     * re-reports the current cumulative, so a repeat trigger bills nothing. {@code 204} once run;
     * {@code 409} when metering is off (the sync bean is absent).
     */
    @PostMapping("/sync-now")
    public ResponseEntity<Void> syncNow() {
        UsageSyncService sync = syncServiceProvider.getIfAvailable();
        if (sync == null) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
        sync.syncNow();
        return ResponseEntity.noContent().build();
    }
}
