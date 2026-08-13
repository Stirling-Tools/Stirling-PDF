package stirling.software.saas.accountlink;

import java.util.Map;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

import jakarta.servlet.http.HttpServletRequest;

import lombok.extern.slf4j.Slf4j;

import stirling.software.saas.accountlink.LeaderTeamResolver.LeaderTeam;

/**
 * Browser-mediated "connect this server" handshake.
 *
 * <p>Replaces the need for the admin's Supabase JWT to reach a self-hosted backend at all. The
 * instance starts a handshake here, sends its admin to {@code /link?request=...} on this origin,
 * and collects a device credential afterwards using a secret that never entered the browser.
 * Because the human half happens on an origin we control, SSO and sign-up work without every
 * customer hostname needing to be in the provider's redirect allow-list.
 *
 * <p>{@code /request} and {@code /claim} are unauthenticated on purpose: an instance has no
 * credential until this flow gives it one. Neither grants anything by itself. {@code /request} only
 * records an intent that a human must still approve, and {@code /claim} requires a secret only the
 * instance that created the row has held. The approve and deny steps are leader-only, resolved from
 * the session and never from the request body.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/account-link/connect")
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class ConnectController {

    private final ConnectRequestService service;
    private final LeaderTeamResolver leaderTeams;

    public ConnectController(ConnectRequestService service, LeaderTeamResolver leaderTeams) {
        this.service = service;
        this.leaderTeams = leaderTeams;
    }

    /** Sent by the instance's own backend, before it holds any credential. */
    public record CreateBody(String name, String callbackUrl, String nonce, String claimSecret) {}

    public record CreateResponse(String requestId, int expiresIn) {}

    /** What the approval page renders. Carries no secret. */
    public record ViewResponse(
            String requestId,
            String name,
            String callbackOrigin,
            boolean insecureTransport,
            String status) {}

    /** Where the approver's browser goes next, and the correlator the instance is waiting on. */
    public record ApproveResponse(String callbackUrl, String nonce) {}

    public record ClaimBody(String requestId, String claimSecret) {}

    public record ClaimResponse(String deviceId, String deviceSecret, Long teamId) {}

    @PostMapping("/request")
    public ResponseEntity<?> request(
            @RequestBody(required = false) CreateBody body, HttpServletRequest http) {
        if (body == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "BAD_REQUEST"));
        }
        ConnectRequestService.CreateResult result =
                service.create(
                        body.name(),
                        body.callbackUrl(),
                        body.nonce(),
                        body.claimSecret(),
                        clientIp(http));
        if (result.isRejected()) {
            return switch (result.rejection()) {
                case RATE_LIMITED ->
                        ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                                .body(Map.of("error", "RATE_LIMITED"));
                case BAD_CALLBACK ->
                        ResponseEntity.badRequest().body(Map.of("error", "BAD_CALLBACK"));
                case BAD_NONCE -> ResponseEntity.badRequest().body(Map.of("error", "BAD_NONCE"));
            };
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new CreateResponse(result.requestId(), result.expiresInSeconds()));
    }

    /**
     * Detail for the approval page. Authenticated but not leader-only, so a member sees what they
     * are being asked about and gets a clear refusal on approve rather than an opaque 403 on load.
     */
    @GetMapping("/{requestId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ViewResponse> view(@PathVariable String requestId) {
        return service.lookup(requestId)
                .map(
                        v ->
                                ResponseEntity.ok(
                                        new ViewResponse(
                                                v.requestId(),
                                                v.name(),
                                                v.callbackOrigin(),
                                                v.insecureTransport(),
                                                v.status().name())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{requestId}/approve")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> approve(@PathVariable String requestId, Authentication auth) {
        LeaderTeam lt = leaderTeams.resolve(auth);
        if (lt.isError()) {
            return ResponseEntity.status(lt.error()).build();
        }
        Optional<ConnectRequestService.ApprovalTarget> target =
                service.approve(requestId, lt.teamId(), lt.userId());
        return target.<ResponseEntity<?>>map(
                        t -> ResponseEntity.ok(new ApproveResponse(t.callbackUrl(), t.nonce())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{requestId}/deny")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> deny(@PathVariable String requestId, Authentication auth) {
        LeaderTeam lt = leaderTeams.resolve(auth);
        if (lt.isError()) {
            return ResponseEntity.status(lt.error()).build();
        }
        return service.deny(requestId)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    /**
     * Collects the device credential. {@code 202} means a human has not decided yet and the caller
     * should keep waiting; {@code 400} is terminal for every other reason, deliberately without
     * saying which, so the endpoint cannot be used to probe request ids.
     */
    @PostMapping("/claim")
    public ResponseEntity<?> claim(@RequestBody(required = false) ClaimBody body) {
        if (body == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "BAD_REQUEST"));
        }
        ConnectRequestService.ClaimResult result =
                service.claim(body.requestId(), body.claimSecret());
        return switch (result.outcome()) {
            case GRANTED ->
                    ResponseEntity.ok(
                            new ClaimResponse(
                                    result.deviceId(), result.deviceSecret(), result.teamId()));
            case PENDING ->
                    ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("status", "pending"));
            case REJECTED -> ResponseEntity.badRequest().body(Map.of("error", "CONNECT_REJECTED"));
        };
    }

    /**
     * Best-effort source address for the creation cap. The first {@code X-Forwarded-For} hop is
     * client-supplied and therefore spoofable; it is good enough to slow bulk creation down and is
     * not used for any authorisation decision.
     */
    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            String first = forwarded.split(",")[0].strip();
            if (!first.isEmpty()) {
                return first.length() > 45 ? first.substring(0, 45) : first;
            }
        }
        String remote = request.getRemoteAddr();
        return remote == null || remote.length() <= 45 ? remote : remote.substring(0, 45);
    }
}
