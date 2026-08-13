package stirling.software.saas.accountlink;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

/**
 * Pairing-code surface for linking a self-hosted instance (RFC 8628 device grant).
 *
 * <p>Two unauthenticated endpoints for the instance ({@code /start}, {@code /poll}) and three for
 * the admin on our own site ({@code /lookup}, {@code /approve}, {@code /deny}). The instance side
 * is unauthenticated by design: the instance has no account, and the device code it receives from
 * {@code /start} is the bearer secret that authorises its own polling.
 *
 * <p>Gated behind {@code stirling.billing.account-link.enabled}: off means the beans are absent and
 * every path here 404s, so the {@code permitAll} entries in the security chain lead nowhere.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/pair")
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class PairingController {

    /** Path of the approval page, appended to whichever base URL we resolve. */
    static final String LINK_PATH = "/link";

    private final PairingService service;
    private final LeaderTeamResolver leaderTeamResolver;
    private final String configuredBaseUrl;

    public PairingController(
            PairingService service,
            LeaderTeamResolver leaderTeamResolver,
            @Value("${stirling.billing.account-link.pairing.base-url:}") String configuredBaseUrl) {
        this.service = service;
        this.leaderTeamResolver = leaderTeamResolver;
        this.configuredBaseUrl = configuredBaseUrl;
    }

    /**
     * Where the admin goes to approve: the SaaS <b>web app's</b> base URL plus {@value #LINK_PATH}.
     *
     * <p>This must be the origin that serves the SPA, because {@code /link} is a frontend route. In
     * a deployment where one JAR serves both the API and the SPA they are the same host, so the
     * request-derived fallback below is correct. Where they are split — a separate API host, or
     * local dev with a Vite server on another port — deriving gives an API origin that renders
     * nothing, so {@code stirling.billing.account-link.pairing.base-url} has to be set. That is why
     * an unset value warns at startup rather than failing quietly: the symptom is a blank page at
     * the end of the flow, which is a long way from the cause.
     *
     * <p>The derived form trusts the forwarded host, which is client-controlled. That is fine here:
     * the value is only ever echoed back to the caller that supplied it, so a spoofed host misleads
     * nobody but the spoofer.
     */
    private String verificationUri(HttpServletRequest request) {
        if (configuredBaseUrl != null && !configuredBaseUrl.isBlank()) {
            return configuredBaseUrl.strip().replaceAll("/+$", "") + LINK_PATH;
        }
        String forwardedHost = firstHeaderValue(request, "X-Forwarded-Host");
        String host = forwardedHost != null ? forwardedHost : request.getHeader("Host");
        String scheme =
                firstNonBlank(firstHeaderValue(request, "X-Forwarded-Proto"), request.getScheme());
        if (host == null || host.isBlank()) {
            host = request.getServerName();
        }
        String contextPath = request.getContextPath() == null ? "" : request.getContextPath();
        return scheme + "://" + host + contextPath + LINK_PATH;
    }

    private static String firstHeaderValue(HttpServletRequest request, String name) {
        String value = request.getHeader(name);
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.split(",")[0].trim();
    }

    private static String firstNonBlank(String a, String b) {
        return a != null && !a.isBlank() ? a : b;
    }

    /**
     * Warns when the approval URL will be guessed from the request rather than configured.
     *
     * <p>Guessing is right only where the API and the SPA share an origin. Anywhere else the admin
     * is handed an API host that renders nothing, and the flow dead-ends on a blank page with no
     * hint as to why. Cheap to say so at boot; expensive to work out from the symptom.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void warnIfApprovalUrlIsGuessed() {
        if (configuredBaseUrl != null && !configuredBaseUrl.isBlank()) {
            log.info("Pairing: approval URL base is {}", configuredBaseUrl.strip());
            return;
        }
        log.warn(
                """
                Pairing: stirling.billing.account-link.pairing.base-url is not set, so the approval \
                URL will be derived from each incoming request.
                  - Correct only if this app also serves the web UI on the same origin.
                  - If the API and the SPA are on different hosts (a split deployment, or local dev \
                with a separate Vite server), the admin will be sent to an origin with no /link \
                page and the pairing will dead-end on a blank screen.\
                """);
    }

    /** Instance-supplied hints shown on the approval screen. Both optional and both untrusted. */
    public record StartRequest(String name, String version) {}

    public record StartResponse(
            String userCode,
            String deviceCode,
            String verificationUri,
            long expiresInSeconds,
            int intervalSeconds) {}

    public record PollRequest(String deviceCode) {}

    /**
     * {@code status} is one of pending, approved, denied, expired, slow_down, unknown. Credential
     * fields are populated only on approved, and only on the first such poll.
     */
    public record PollResponse(
            String status,
            String deviceId,
            String deviceSecret,
            Long teamId,
            int intervalSeconds) {}

    public record PendingResponse(
            String userCode,
            String name,
            String version,
            String address,
            String requestedAt,
            String expiresAt) {}

    public record ApproveRequest(String code, String name) {}

    public record CodeRequest(String code) {}

    // -------------------------------------------------------------------------------------------
    // Instance side, unauthenticated
    // -------------------------------------------------------------------------------------------

    @PostMapping("/start")
    public ResponseEntity<StartResponse> start(
            @RequestBody(required = false) StartRequest req, HttpServletRequest http) {
        String name = req != null ? req.name() : null;
        String version = req != null ? req.version() : null;
        PairingService.StartResult result;
        try {
            result = service.start(name, version, clientIp(http));
        } catch (PairingService.TooManyRequestsException e) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).build();
        }
        long expiresIn =
                Math.max(0, ChronoUnit.SECONDS.between(LocalDateTime.now(), result.expiresAt()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(
                        new StartResponse(
                                PairingService.forDisplay(result.userCode()),
                                result.deviceCode(),
                                verificationUri(http),
                                expiresIn,
                                result.intervalSeconds()));
    }

    /**
     * Always 200 with a status, rather than the RFC's error-coded 400s. The instance treats this as
     * a state read and has no use for the distinction, and a 200 keeps a routine "still waiting"
     * out of upstream error logs.
     */
    @PostMapping("/poll")
    public ResponseEntity<PollResponse> poll(@RequestBody(required = false) PollRequest req) {
        PairingService.PollResult result = service.poll(req != null ? req.deviceCode() : null);
        String status = result.outcome().name().toLowerCase(java.util.Locale.ROOT);
        if (result.outcome() != PairingService.PollOutcome.APPROVED) {
            return ResponseEntity.ok(
                    new PollResponse(status, null, null, null, PairingService.INTERVAL_SECONDS));
        }
        return ResponseEntity.ok(
                new PollResponse(
                        status,
                        result.credential().deviceId(),
                        result.credential().deviceSecret(),
                        result.teamId(),
                        PairingService.INTERVAL_SECONDS));
    }

    // -------------------------------------------------------------------------------------------
    // Admin side, on our own origin, team leaders only
    // -------------------------------------------------------------------------------------------

    @GetMapping("/lookup")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<PendingResponse> lookup(
            @RequestParam("code") String code, Authentication auth) {
        LeaderTeamResolver.LeaderTeam lt = leaderTeamResolver.resolve(auth);
        if (lt.error() != null) {
            return ResponseEntity.status(lt.error()).build();
        }
        Optional<PairingService.PendingView> pending = service.lookup(code);
        return pending.map(
                        p ->
                                ResponseEntity.ok(
                                        new PendingResponse(
                                                PairingService.forDisplay(p.userCode()),
                                                p.instanceLabel(),
                                                p.instanceVersion(),
                                                p.requesterIp(),
                                                p.createdAt() != null
                                                        ? p.createdAt().toString()
                                                        : null,
                                                p.expiresAt() != null
                                                        ? p.expiresAt().toString()
                                                        : null)))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/approve")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> approve(@RequestBody ApproveRequest req, Authentication auth) {
        LeaderTeamResolver.LeaderTeam lt = leaderTeamResolver.resolve(auth);
        if (lt.error() != null) {
            return ResponseEntity.status(lt.error()).build();
        }
        boolean ok = service.approve(req.code(), lt.teamId(), lt.userId(), req.name());
        return ok ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @PostMapping("/deny")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> deny(@RequestBody CodeRequest req, Authentication auth) {
        LeaderTeamResolver.LeaderTeam lt = leaderTeamResolver.resolve(auth);
        if (lt.error() != null) {
            return ResponseEntity.status(lt.error()).build();
        }
        boolean ok = service.deny(req.code());
        return ok ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    /**
     * Best guess at the caller's address, shown on the approval screen and used as rate-limit
     * input.
     *
     * <p>Hint only. The first {@code X-Forwarded-For} hop is client-set, so it is both spoofable
     * and a weak rate-limit key. It earns its place by helping a leader recognise their own server;
     * the controls that actually matter are the short code lifetime, leader-only approval, and the
     * approval screen itself.
     */
    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
