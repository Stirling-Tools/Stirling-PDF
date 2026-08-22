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

/** Same-origin account-link surface on the self-hosted instance (combined-billing "Mode A"). */
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

    /** {@code callbackUrl} is the portal telling us where its own callback route lives. */
    public record ConnectStartRequest(String name, String callbackUrl) {}

    /** {@code nonce} comes from the callback fragment the approval page redirected to. */
    public record ConnectCompleteRequest(String nonce) {}

    /**
     * Opens a browser-mediated link handshake and returns the approval URL to send the admin to.
     */
    @PostMapping("/connect/start")
    public ResponseEntity<?> connectStart(
            @RequestBody(required = false) ConnectStartRequest req, HttpServletRequest http) {
        try {
            return ResponseEntity.ok(
                    connectService.start(req != null ? req.name() : null, callbackHint(req, http)));
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

    /** Re-establishes the admin's SaaS session for a server that is already linked. */
    @PostMapping("/connect/reauth")
    public ResponseEntity<?> connectReauth(
            @RequestBody(required = false) ConnectStartRequest req, HttpServletRequest http) {
        try {
            return ResponseEntity.ok(connectService.startReauth(callbackHint(req, http)));
        } catch (AccountLinkClient.UpstreamException e) {
            log.warn("Account-link reauth rejected upstream: HTTP {}", e.status());
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(java.util.Map.of("error", "CONNECT_FAILED"));
        } catch (IOException e) {
            log.warn("Account-link reauth failed: {}", e.getMessage());
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

    /** Everything we know about where the admin's browser is, for the callback. */
    private static ConnectService.CallbackHint callbackHint(
            ConnectStartRequest req, HttpServletRequest http) {
        return new ConnectService.CallbackHint(
                req != null ? req.callbackUrl() : null, http.getHeader("Origin"), baseUrlOf(http));
    }

    /**
     * This instance's base URL as the browser reached it, including any context path so a subpath
     * deployment builds a callback that actually resolves.
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

    /** Forces an immediate usage sync to SaaS — the same work the daily scheduler does. */
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
