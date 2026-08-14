package stirling.software.saas.accountlink;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
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

    /** Same headers the device-credential filter uses on the {@code /api/v1/instance} paths. */
    static final String HEADER_DEVICE_ID = "X-Device-Id";

    static final String HEADER_DEVICE_SECRET = "X-Device-Secret";

    /** Frontend route serving the approval page. */
    static final String LINK_PATH = "/link";

    /**
     * Origin of our own web app, when it is not the origin serving this API. Empty means "derive it
     * from the request", which is correct for a single-host deployment.
     */
    @Value("${stirling.billing.account-link.app-base-url:}")
    private String appBaseUrl;

    private final ConnectRequestService service;
    private final LeaderTeamResolver leaderTeams;
    private final AccountLinkService accountLinkService;

    public ConnectController(
            ConnectRequestService service,
            LeaderTeamResolver leaderTeams,
            AccountLinkService accountLinkService) {
        this.service = service;
        this.leaderTeams = leaderTeams;
        this.accountLinkService = accountLinkService;
    }

    /** Sent by the instance's own backend, before it holds any credential. */
    public record CreateBody(String name, String callbackUrl, String nonce, String claimSecret) {}

    /**
     * {@code authorizeUrl} is where the instance should send its admin.
     *
     * <p>Returned rather than composed by the instance, because we are the only party that knows
     * where our own approval page lives. An instance that had to configure it could only ever get
     * it wrong, and would need reconfiguring whenever we moved the page.
     */
    public record CreateResponse(String requestId, int expiresIn, String authorizeUrl) {}

    /** What the approval page renders. Carries no secret. */
    public record ViewResponse(
            String requestId,
            String name,
            String callbackOrigin,
            boolean insecureTransport,
            String mode,
            String status) {}

    /** Where the approver's browser goes next, and the correlator the instance is waiting on. */
    public record ApproveResponse(String callbackUrl, String nonce) {}

    public record ClaimBody(String requestId, String claimSecret) {}

    public record ClaimResponse(String deviceId, String deviceSecret, Long teamId) {}

    /**
     * Opens a handshake.
     *
     * <p>An instance that already holds a device credential may present it here. Doing so makes
     * this a re-authentication: the team is pinned from the credential, so approval can only
     * confirm the team the server already belongs to, and no second credential is minted. Without a
     * credential this is a first link, where approval decides the team.
     */
    @PostMapping("/request")
    public ResponseEntity<?> request(
            @RequestBody(required = false) CreateBody body, HttpServletRequest http) {
        if (body == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "BAD_REQUEST"));
        }
        String deviceId = http.getHeader(HEADER_DEVICE_ID);
        String deviceSecret = http.getHeader(HEADER_DEVICE_SECRET);
        boolean reauthRequested = deviceId != null || deviceSecret != null;

        ConnectRequestService.CreateResult result;
        if (reauthRequested) {
            Long pinnedTeamId =
                    accountLinkService
                            .resolveActiveInstance(deviceId, deviceSecret)
                            .map(LinkedInstance::getTeamId)
                            .orElse(null);
            result =
                    service.createReauth(
                            body.name(),
                            body.callbackUrl(),
                            body.nonce(),
                            body.claimSecret(),
                            clientIp(http),
                            pinnedTeamId);
        } else {
            result =
                    service.create(
                            body.name(),
                            body.callbackUrl(),
                            body.nonce(),
                            body.claimSecret(),
                            clientIp(http));
        }
        if (result.isRejected()) {
            return switch (result.rejection()) {
                case RATE_LIMITED ->
                        ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                                .body(Map.of("error", "RATE_LIMITED"));
                case BAD_CALLBACK ->
                        ResponseEntity.badRequest().body(Map.of("error", "BAD_CALLBACK"));
                case BAD_NONCE -> ResponseEntity.badRequest().body(Map.of("error", "BAD_NONCE"));
                // A credential was offered and did not authenticate. Same answer as any other bad
                // credential, and deliberately not distinguishable from "revoked".
                case NOT_LINKED ->
                        ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                                .body(Map.of("error", "NOT_LINKED"));
            };
        }
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(
                        new CreateResponse(
                                result.requestId(),
                                result.expiresInSeconds(),
                                authorizeUrl(result.requestId(), http)));
    }

    /**
     * Where to send the admin to approve a handshake.
     *
     * <p>Derived from the incoming request by default, which is right whenever the API and the web
     * app share a host — the normal deployment, so this usually needs no configuration at all. Set
     * {@code stirling.billing.account-link.app-base-url} where they are split, which locally they
     * are (API on one port, web app on another).
     */
    private String authorizeUrl(String requestId, HttpServletRequest http) {
        String base =
                appBaseUrl != null && !appBaseUrl.isBlank()
                        ? appBaseUrl.strip().replaceAll("/+$", "")
                        : requestOrigin(http);
        return base
                + LINK_PATH
                + "?request="
                + URLEncoder.encode(requestId, StandardCharsets.UTF_8);
    }

    /** Scheme, host and context path as the browser reached us, honouring a reverse proxy. */
    private static String requestOrigin(HttpServletRequest request) {
        String proto = firstHop(request.getHeader("X-Forwarded-Proto"));
        String host = firstHop(request.getHeader("X-Forwarded-Host"));
        String scheme = proto != null ? proto : request.getScheme();
        String hostPort;
        if (host != null) {
            hostPort = host;
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
                                                v.mode().name(),
                                                v.status().name())))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Approves a handshake.
     *
     * <p>A first link is leader-only: it decides which team pays for the server. A
     * re-authentication only needs a member of the team the server is already pinned to, because it
     * changes nothing about billing, and requiring a leader would leave a member admin unable to
     * fix their own expired session. Either way the team comes from the session, never the request.
     */
    @PostMapping("/{requestId}/approve")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> approve(@PathVariable String requestId, Authentication auth) {
        Optional<ConnectRequestService.ConnectView> view = service.lookup(requestId);
        if (view.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        boolean reauth = view.get().mode() == ConnectRequest.Mode.REAUTH;
        LeaderTeam lt = reauth ? leaderTeams.resolveMember(auth) : leaderTeams.resolve(auth);
        if (lt.isError()) {
            return ResponseEntity.status(lt.error()).build();
        }
        ConnectRequestService.ApproveResult result =
                service.approve(requestId, lt.teamId(), lt.userId());
        if (result.isRejected()) {
            return switch (result.rejection()) {
                // Named separately so the page can say "you are signed in to a different account"
                // rather than implying the request itself was bad.
                case WRONG_TEAM ->
                        ResponseEntity.status(HttpStatus.CONFLICT)
                                .body(Map.of("error", "WRONG_TEAM"));
                case UNAVAILABLE -> ResponseEntity.notFound().build();
            };
        }
        return ResponseEntity.ok(
                new ApproveResponse(result.target().callbackUrl(), result.target().nonce()));
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
            // A re-authentication carries no credential: the instance already has one. It only
            // needs to know the browser leg succeeded, and which team it was confirmed against.
            case CONFIRMED ->
                    ResponseEntity.ok(Map.of("status", "confirmed", "teamId", result.teamId()));
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
