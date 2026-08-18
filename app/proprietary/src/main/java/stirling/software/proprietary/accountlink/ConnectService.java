package stirling.software.proprietary.accountlink;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Locale;
import java.util.Optional;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

/** Browser-mediated account linking, instance side. */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class ConnectService {

    /** Frontend route that consumes the callback fragment. */
    static final String CALLBACK_PATH = "/account-link/callback";

    private static final int SECRET_BYTES = 32;

    private final AccountLinkClient client;
    private final ConnectStateRepository stateRepo;
    private final DeviceCredentialStore credentialStore;
    private final EntitlementCache entitlementCache;
    private final AccountLinkProperties properties;
    private final SecureRandom random = new SecureRandom();

    public ConnectService(
            AccountLinkClient client,
            ConnectStateRepository stateRepo,
            DeviceCredentialStore credentialStore,
            EntitlementCache entitlementCache,
            AccountLinkProperties properties) {
        this.client = client;
        this.stateRepo = stateRepo;
        this.credentialStore = credentialStore;
        this.entitlementCache = entitlementCache;
        this.properties = properties;
    }

    public enum Phase {
        /** Nothing in flight and not linked. */
        NONE,
        /** A handshake is open, waiting for a leader to approve it on the SaaS site. */
        PENDING,
        /** Linked. */
        LINKED,
        /** The handshake outlived its window; start a new one. */
        EXPIRED,
        /** Declined or already used; start a new one. */
        REJECTED,
        /** SaaS could not be reached; the handshake is still valid and can be retried. */
        UNAVAILABLE
    }

    /** What the portal renders. */
    public record ConnectStatus(
            Phase phase, String authorizeUrl, Long secondsRemaining, Long teamId) {
        static ConnectStatus of(Phase phase) {
            return new ConnectStatus(phase, null, null, null);
        }
    }

    /** Everything we know about where the admin's browser actually is, in decreasing authority. */
    public record CallbackHint(
            String requestedCallbackUrl, String browserOrigin, String derivedBaseUrl) {}

    /** Opens a handshake and returns where to send the admin. */
    @Transactional
    public ConnectStatus start(String name, CallbackHint hint) throws IOException {
        if (credentialStore.isLinked()) {
            return status();
        }
        return open(name, hint, null);
    }

    /**
     * Opens a handshake that only re-establishes the admin's browser session, for an instance that
     * is already linked.
     */
    @Transactional
    public ConnectStatus startReauth(CallbackHint hint) throws IOException {
        DeviceCredential credential =
                credentialStore
                        .get()
                        .orElseThrow(
                                () ->
                                        new IOException(
                                                "This server is not linked, so there is no session"
                                                        + " to re-establish"));
        return open(credential.getDeviceId(), hint, credential);
    }

    private ConnectStatus open(String name, CallbackHint hint, DeviceCredential credential)
            throws IOException {
        String callbackUrl = resolveCallbackUrl(hint);
        if (callbackUrl == null) {
            throw new IOException(
                    "Cannot determine where to send the admin back to; set"
                            + " stirling.billing.account-link.public-url");
        }
        String nonce = randomSecret();
        String claimSecret = randomSecret();

        AccountLinkClient.ConnectRequestResult created =
                client.connectRequest(name, callbackUrl, nonce, claimSecret, credential);

        LocalDateTime now = LocalDateTime.now();
        ConnectState state = new ConnectState();
        state.setId(ConnectState.SINGLETON_ID);
        state.setRequestId(created.requestId());
        state.setNonce(nonce);
        state.setClaimSecret(claimSecret);
        state.setCallbackUrl(callbackUrl);
        state.setAuthorizeUrl(created.authorizeUrl());
        state.setCreatedAt(now);
        state.setExpiresAt(
                now.plusSeconds(created.expiresInSeconds() > 0 ? created.expiresInSeconds() : 900));
        stateRepo.save(state);

        log.info("Account-link connect: handshake {} opened", created.requestId());
        return pendingStatus(state, now);
    }

    /** Finishes a handshake from the callback the approval page redirected to. */
    @Transactional
    public ConnectStatus complete(String nonce) {
        Optional<ConnectState> found = stateRepo.findById(ConnectState.SINGLETON_ID);
        if (found.isEmpty()) {
            // Already finished (a double-submitted callback) or never started.
            return status();
        }
        ConnectState state = found.get();
        if (state.isExpired(LocalDateTime.now())) {
            stateRepo.delete(state);
            return ConnectStatus.of(Phase.EXPIRED);
        }
        if (nonce == null || !nonceMatches(nonce, state.getNonce())) {
            log.warn(
                    "Account-link connect: callback for handshake {} had a bad nonce",
                    state.getRequestId());
            return ConnectStatus.of(Phase.REJECTED);
        }

        AccountLinkClient.ConnectClaimResult claim =
                client.connectClaim(state.getRequestId(), state.getClaimSecret());
        return switch (claim.outcome()) {
            case GRANTED -> {
                credentialStore.save(claim.deviceId(), claim.deviceSecret(), claim.teamId());
                entitlementCache.invalidate();
                stateRepo.delete(state);
                log.info("Account-link connect: linked to team {}", claim.teamId());
                yield new ConnectStatus(Phase.LINKED, null, null, claim.teamId());
            }
            case CONFIRMED -> {
                stateRepo.delete(state);
                log.info(
                        "Account-link connect: session re-established for team {}", claim.teamId());
                yield new ConnectStatus(Phase.LINKED, null, null, claim.teamId());
            }
            case PENDING ->
                    // The admin reached the callback before the approval committed. The row stays,
                    // so a retry finishes it.
                    ConnectStatus.of(Phase.PENDING);
            case REJECTED -> {
                stateRepo.delete(state);
                yield ConnectStatus.of(Phase.REJECTED);
            }
            case UNAVAILABLE -> ConnectStatus.of(Phase.UNAVAILABLE);
        };
    }

    /** Drops any open handshake. */
    @Transactional
    public void cancel() {
        stateRepo.findById(ConnectState.SINGLETON_ID).ifPresent(stateRepo::delete);
    }

    @Transactional(readOnly = true)
    public ConnectStatus status() {
        Optional<DeviceCredential> credential = credentialStore.get();
        if (credential.isPresent()) {
            return new ConnectStatus(Phase.LINKED, null, null, credential.get().getTeamId());
        }
        Optional<ConnectState> state = stateRepo.findById(ConnectState.SINGLETON_ID);
        if (state.isEmpty()) {
            return ConnectStatus.of(Phase.NONE);
        }
        LocalDateTime now = LocalDateTime.now();
        if (state.get().isExpired(now)) {
            return ConnectStatus.of(Phase.EXPIRED);
        }
        return pendingStatus(state.get(), now);
    }

    private static ConnectStatus pendingStatus(ConnectState state, LocalDateTime now) {
        long remaining = Duration.between(now, state.getExpiresAt()).toSeconds();
        return new ConnectStatus(
                Phase.PENDING, state.getAuthorizeUrl(), Math.max(remaining, 0), null);
    }

    /** Decides the callback, preferring knowledge over inference. */
    String resolveCallbackUrl(CallbackHint hint) {
        String configured = properties.getPublicUrl();
        if (configured != null && !configured.isBlank()) {
            return trimTrailingSlash(configured.strip()) + CALLBACK_PATH;
        }
        String browserOrigin = originOf(hint.browserOrigin());
        if (browserOrigin != null) {
            String requested = hint.requestedCallbackUrl();
            if (requested != null && browserOrigin.equals(originOf(requested))) {
                return requested.strip();
            }
            return browserOrigin + CALLBACK_PATH;
        }
        return hint.derivedBaseUrl() == null || hint.derivedBaseUrl().isBlank()
                ? null
                : trimTrailingSlash(hint.derivedBaseUrl().strip()) + CALLBACK_PATH;
    }

    /** Scheme, host and port of an absolute http(s) URL; null if it is not one. */
    private static String originOf(String candidate) {
        if (candidate == null || candidate.isBlank()) {
            return null;
        }
        URI uri;
        try {
            uri = new URI(candidate.strip());
        } catch (URISyntaxException e) {
            return null;
        }
        if (uri.getScheme() == null || uri.getHost() == null) {
            return null;
        }
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            return null;
        }
        int port = uri.getPort();
        boolean defaultPort =
                port == -1
                        || ("http".equals(scheme) && port == 80)
                        || ("https".equals(scheme) && port == 443);
        return defaultPort
                ? scheme + "://" + uri.getHost()
                : scheme + "://" + uri.getHost() + ":" + port;
    }

    private static String trimTrailingSlash(String value) {
        return value.replaceAll("/+$", "");
    }

    private String randomSecret() {
        byte[] buf = new byte[SECRET_BYTES];
        random.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    /** Constant-time so a caller cannot probe the nonce a character at a time. */
    private static boolean nonceMatches(String candidate, String expected) {
        if (expected == null) {
            return false;
        }
        return MessageDigest.isEqual(
                candidate.getBytes(StandardCharsets.UTF_8),
                expected.getBytes(StandardCharsets.UTF_8));
    }
}
