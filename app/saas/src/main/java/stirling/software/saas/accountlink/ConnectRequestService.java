package stirling.software.saas.accountlink;

import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Locale;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

/** The "connect this server" handshake, SaaS side. */
@Slf4j
@Service
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class ConnectRequestService {

    /** Long enough for the approver to sign in, pick the right account and read the origin. */
    static final int LIFETIME_MINUTES = 15;

    /** Creating a request needs no authentication, so the only brake is per-source volume. */
    static final int MAX_REQUESTS_PER_IP = 10;

    private static final int REQUEST_ID_BYTES = 32;
    private static final int MAX_NONCE_LENGTH = 128;
    private static final int MAX_CALLBACK_LENGTH = 2048;
    private static final int MAX_NAME_LENGTH = 255;

    private final ConnectRequestRepository repo;
    private final AccountLinkService accountLinkService;
    private final SecureRandom random = new SecureRandom();

    public ConnectRequestService(
            ConnectRequestRepository repo, AccountLinkService accountLinkService) {
        this.repo = repo;
        this.accountLinkService = accountLinkService;
    }

    /** Rejected creation attempts, so the controller can pick a status without parsing messages. */
    public enum CreateRejection {
        BAD_CALLBACK,
        BAD_NONCE,
        RATE_LIMITED,
        /**
         * A re-authentication was asked for by something that could not prove it is a linked
         * instance.
         */
        NOT_LINKED
    }

    /** Either a created request id, or the reason we would not create one. */
    public record CreateResult(String requestId, int expiresInSeconds, CreateRejection rejection) {
        static CreateResult ok(String requestId, int expiresInSeconds) {
            return new CreateResult(requestId, expiresInSeconds, null);
        }

        static CreateResult rejected(CreateRejection rejection) {
            return new CreateResult(null, 0, rejection);
        }

        public boolean isRejected() {
            return rejection != null;
        }
    }

    /** What the approval page shows. */
    public record ConnectView(
            String requestId,
            String name,
            String callbackOrigin,
            boolean insecureTransport,
            ConnectRequest.Mode mode,
            ConnectRequest.Status status) {}

    /** Where to send the browser once approved, plus the correlator the instance is expecting. */
    public record ApprovalTarget(String callbackUrl, String nonce) {}

    public enum ClaimOutcome {
        /** Approved and collected; {@code credential} is populated. */
        GRANTED,
        /** A re-authentication was approved. */
        CONFIRMED,
        /** Still waiting on a human. */
        PENDING,
        /** Declined, expired, unknown, already collected, or a bad claim secret. */
        REJECTED
    }

    public record ClaimResult(
            ClaimOutcome outcome, String deviceId, String deviceSecret, Long teamId) {
        static ClaimResult of(ClaimOutcome outcome) {
            return new ClaimResult(outcome, null, null, null);
        }
    }

    /** Records a handshake on behalf of an instance that has no credential yet. */
    @Transactional
    public CreateResult create(
            String name, String callbackUrl, String nonce, String claimSecret, String requesterIp) {
        return create(name, callbackUrl, nonce, claimSecret, requesterIp, null);
    }

    /**
     * As {@link #create}, but for an instance that is already linked and only needs its admin's
     * browser signed in again.
     */
    @Transactional
    public CreateResult createReauth(
            String name,
            String callbackUrl,
            String nonce,
            String claimSecret,
            String requesterIp,
            Long pinnedTeamId) {
        if (pinnedTeamId == null) {
            return CreateResult.rejected(CreateRejection.NOT_LINKED);
        }
        return create(name, callbackUrl, nonce, claimSecret, requesterIp, pinnedTeamId);
    }

    private CreateResult create(
            String name,
            String callbackUrl,
            String nonce,
            String claimSecret,
            String requesterIp,
            Long pinnedTeamId) {
        if (nonce == null || nonce.isBlank() || nonce.length() > MAX_NONCE_LENGTH) {
            return CreateResult.rejected(CreateRejection.BAD_NONCE);
        }
        if (claimSecret == null || claimSecret.isBlank()) {
            return CreateResult.rejected(CreateRejection.BAD_NONCE);
        }
        Optional<URI> parsed = validateCallback(callbackUrl);
        if (parsed.isEmpty()) {
            return CreateResult.rejected(CreateRejection.BAD_CALLBACK);
        }
        LocalDateTime now = LocalDateTime.now();
        if (requesterIp != null
                && repo.countByRequesterIpAndCreatedAtAfter(requesterIp, now.minusHours(1))
                        >= MAX_REQUESTS_PER_IP) {
            return CreateResult.rejected(CreateRejection.RATE_LIMITED);
        }

        URI uri = parsed.get();
        ConnectRequest request = new ConnectRequest();
        request.setRequestId(randomToken());
        request.setName(trim(name, MAX_NAME_LENGTH));
        request.setCallbackUrl(uri.toString());
        request.setCallbackOrigin(originOf(uri));
        request.setNonce(nonce);
        request.setClaimSecretHash(sha256Hex(claimSecret));
        request.setStatus(ConnectRequest.Status.PENDING);
        request.setMode(
                pinnedTeamId == null ? ConnectRequest.Mode.LINK : ConnectRequest.Mode.REAUTH);
        request.setTeamId(pinnedTeamId);
        request.setRequesterIp(requesterIp);
        request.setExpiresAt(now.plusMinutes(LIFETIME_MINUTES));
        repo.save(request);

        // Never log the nonce or the claim secret; both are live. The request id is the safe
        // handle for correlating a support request against this row.
        log.info(
                "Account-link connect: request {} created for origin {}",
                request.getRequestId(),
                request.getCallbackOrigin());
        return CreateResult.ok(request.getRequestId(), LIFETIME_MINUTES * 60);
    }

    /** The approver's view of a handshake. */
    @Transactional(readOnly = true)
    public Optional<ConnectView> lookup(String requestId) {
        return repo.findByRequestId(requestId)
                .filter(r -> !r.isExpired(LocalDateTime.now()))
                .map(
                        r ->
                                new ConnectView(
                                        r.getRequestId(),
                                        r.getName(),
                                        r.getCallbackOrigin(),
                                        !"https".equals(schemeOf(r.getCallbackOrigin())),
                                        r.getMode(),
                                        r.getStatus()));
    }

    /** Why an approval was refused, so the page can say something useful. */
    public enum ApproveRejection {
        /** Unknown, expired, or already settled. */
        UNAVAILABLE,
        /** The approver's team is not the team this server already belongs to. */
        WRONG_TEAM
    }

    public record ApproveResult(ApprovalTarget target, ApproveRejection rejection) {
        public boolean isRejected() {
            return target == null;
        }
    }

    /** Binds a pending handshake to the approver's team and returns where to send them next. */
    @Transactional
    public ApproveResult approve(String requestId, Long teamId, Long userId) {
        Optional<ConnectRequest> found = repo.findByRequestIdForUpdate(requestId);
        if (found.isEmpty()) {
            return new ApproveResult(null, ApproveRejection.UNAVAILABLE);
        }
        ConnectRequest request = found.get();
        LocalDateTime now = LocalDateTime.now();
        if (request.isExpired(now) || request.getStatus() != ConnectRequest.Status.PENDING) {
            return new ApproveResult(null, ApproveRejection.UNAVAILABLE);
        }
        Long pinned = request.getTeamId();
        if (pinned != null && !pinned.equals(teamId)) {
            log.warn(
                    "Account-link connect: request {} approved by team {} but is pinned to team {};"
                            + " refusing",
                    requestId,
                    teamId,
                    pinned);
            return new ApproveResult(null, ApproveRejection.WRONG_TEAM);
        }
        request.setStatus(ConnectRequest.Status.APPROVED);
        request.setTeamId(teamId);
        request.setApprovedByUserId(userId);
        request.setApprovedAt(now);
        repo.save(request);
        log.info(
                "Account-link connect: request {} approved for team {} ({})",
                requestId,
                teamId,
                request.getMode());
        return new ApproveResult(
                new ApprovalTarget(request.getCallbackUrl(), request.getNonce()), null);
    }

    /** Declines a pending handshake. */
    @Transactional
    public boolean deny(String requestId) {
        Optional<ConnectRequest> found = repo.findByRequestIdForUpdate(requestId);
        if (found.isEmpty()) {
            return false;
        }
        ConnectRequest request = found.get();
        if (request.getStatus() != ConnectRequest.Status.PENDING) {
            return false;
        }
        request.setStatus(ConnectRequest.Status.DENIED);
        repo.save(request);
        log.info("Account-link connect: request {} denied", requestId);
        return true;
    }

    /** Collects the device credential for an approved handshake. */
    @Transactional
    public ClaimResult claim(String requestId, String claimSecret) {
        if (requestId == null || claimSecret == null) {
            return ClaimResult.of(ClaimOutcome.REJECTED);
        }
        Optional<ConnectRequest> found = repo.findByRequestIdForUpdate(requestId);
        if (found.isEmpty()) {
            return ClaimResult.of(ClaimOutcome.REJECTED);
        }
        ConnectRequest request = found.get();
        if (!secretMatches(claimSecret, request.getClaimSecretHash())) {
            // Same answer as an unknown id: a caller probing ids learns nothing from the
            // difference.
            log.warn("Account-link connect: claim for request {} had a bad secret", requestId);
            return ClaimResult.of(ClaimOutcome.REJECTED);
        }
        if (request.isExpired(LocalDateTime.now())) {
            return ClaimResult.of(ClaimOutcome.REJECTED);
        }
        return switch (request.getStatus()) {
            case PENDING -> ClaimResult.of(ClaimOutcome.PENDING);
            case APPROVED -> mint(request);
            case DENIED, CONSUMED -> ClaimResult.of(ClaimOutcome.REJECTED);
        };
    }

    /** Settles an approved handshake. */
    private ClaimResult mint(ConnectRequest request) {
        if (request.getMode() == ConnectRequest.Mode.REAUTH) {
            request.setStatus(ConnectRequest.Status.CONSUMED);
            request.setConsumedAt(LocalDateTime.now());
            repo.save(request);
            log.info(
                    "Account-link connect: request {} re-authenticated for team {}",
                    request.getRequestId(),
                    request.getTeamId());
            return new ClaimResult(ClaimOutcome.CONFIRMED, null, null, request.getTeamId());
        }
        AccountLinkService.RegisteredInstance registered =
                accountLinkService.register(
                        request.getTeamId(), request.getApprovedByUserId(), request.getName());
        request.setStatus(ConnectRequest.Status.CONSUMED);
        request.setConsumedAt(LocalDateTime.now());
        repo.save(request);
        log.info(
                "Account-link connect: request {} claimed, instance {} bound to team {}",
                request.getRequestId(),
                registered.instanceId(),
                request.getTeamId());
        return new ClaimResult(
                ClaimOutcome.GRANTED,
                registered.deviceId(),
                registered.deviceSecret(),
                request.getTeamId());
    }

    /** Absolute http(s) URL, with a host, no credentials and no fragment of its own. */
    static Optional<URI> validateCallback(String candidate) {
        if (candidate == null || candidate.isBlank() || candidate.length() > MAX_CALLBACK_LENGTH) {
            return Optional.empty();
        }
        URI uri;
        try {
            uri = new URI(candidate.strip());
        } catch (URISyntaxException e) {
            return Optional.empty();
        }
        if (!uri.isAbsolute() || uri.getScheme() == null) {
            return Optional.empty();
        }
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            return Optional.empty();
        }
        if (uri.getHost() == null || uri.getHost().isBlank()) {
            return Optional.empty();
        }
        if (uri.getUserInfo() != null || uri.getFragment() != null) {
            return Optional.empty();
        }
        return Optional.of(uri);
    }

    /** Scheme, host and port, with the default port omitted so origins compare cleanly. */
    static String originOf(URI uri) {
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        int port = uri.getPort();
        boolean defaultPort =
                port == -1
                        || ("http".equals(scheme) && port == 80)
                        || ("https".equals(scheme) && port == 443);
        return defaultPort
                ? scheme + "://" + uri.getHost()
                : scheme + "://" + uri.getHost() + ":" + port;
    }

    private static String schemeOf(String origin) {
        int sep = origin.indexOf("://");
        return sep < 0 ? "" : origin.substring(0, sep);
    }

    private static String trim(String value, int max) {
        if (value == null) {
            return null;
        }
        String stripped = value.strip();
        if (stripped.isEmpty()) {
            return null;
        }
        return stripped.length() <= max ? stripped : stripped.substring(0, max);
    }

    private String randomToken() {
        byte[] buf = new byte[REQUEST_ID_BYTES];
        random.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    /** Constant-time comparison so a claim cannot be brute-forced a byte at a time. */
    private static boolean secretMatches(String candidate, String expectedHash) {
        if (expectedHash == null) {
            return false;
        }
        return MessageDigest.isEqual(
                sha256Hex(candidate).getBytes(StandardCharsets.UTF_8),
                expectedHash.getBytes(StandardCharsets.UTF_8));
    }

    private static String sha256Hex(String value) {
        return AccountLinkService.sha256Hex(value);
    }
}
