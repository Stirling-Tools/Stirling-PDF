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

/**
 * Browser-mediated account linking, instance side.
 *
 * <p>Modelled on the desktop app's deep-link SSO. There, the app mints a nonce, opens the system
 * browser, and only accepts a callback carrying that nonce back; the OS routes the reply to the
 * waiting process. Here the same handshake runs over an ordinary redirect, because a self-hosted
 * instance cannot be the target of a provider redirect (its hostname can never be in the
 * allow-list), but it can be the target of a redirect issued by our own approval page.
 *
 * <p>The admin's SaaS token never passes through this backend. It goes to the admin's own browser
 * in the callback fragment, which is what lets the portal make attended SaaS reads. This backend
 * collects only the device credential, and does so on a separate server-to-server call
 * authenticated by a secret that never entered a browser.
 */
@Slf4j
@Service
@Profile("!saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class ConnectService {

    /** Frontend route that consumes the callback fragment. Must exist in the SPA router. */
    static final String CALLBACK_PATH = "/account-link/callback";

    /** Approval page on the SaaS web app. */
    static final String AUTHORIZE_PATH = "/link";

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
        /** Linked. Terminal and happy. */
        LINKED,
        /** The handshake outlived its window; start a new one. */
        EXPIRED,
        /** Declined or already used; start a new one. */
        REJECTED,
        /** SaaS could not be reached; the handshake is still valid and can be retried. */
        UNAVAILABLE
    }

    /**
     * What the portal renders. {@code authorizeUrl} is only populated while a handshake is open, so
     * the UI never offers a stale link.
     */
    public record ConnectStatus(
            Phase phase, String authorizeUrl, Long secondsRemaining, Long teamId) {
        static ConnectStatus of(Phase phase) {
            return new ConnectStatus(phase, null, null, null);
        }
    }

    /**
     * Everything we know about where the admin's browser actually is, in decreasing authority.
     *
     * @param requestedCallbackUrl the callback the portal built from its own router. The frontend
     *     is the only party that knows where its route really lives, so this is knowledge rather
     *     than a guess. Honoured only when its origin matches {@code browserOrigin}.
     * @param browserOrigin the {@code Origin} header. Set by the browser and not writable from page
     *     script, which is what makes the check above worth doing.
     * @param derivedBaseUrl last resort, reconstructed from the request. Right for a direct hit,
     *     wrong whenever the frontend is served from a different port than the API.
     */
    public record CallbackHint(
            String requestedCallbackUrl, String browserOrigin, String derivedBaseUrl) {}

    /**
     * Opens a handshake and returns where to send the admin.
     *
     * @throws IOException if SaaS cannot be reached or refuses the handshake.
     */
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
     *
     * <p>Presents this instance's device credential, which is what lets the SaaS side pin the
     * handshake to the team we already belong to. Approval can then only confirm that team, so this
     * cannot end with the browser signed into an account that does not own this server, and no
     * second device credential is minted.
     *
     * @throws IOException if this instance is not linked, or SaaS refuses the handshake.
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
        state.setAuthorizeUrl(authorizeUrl(created.requestId()));
        state.setCreatedAt(now);
        state.setExpiresAt(
                now.plusSeconds(created.expiresInSeconds() > 0 ? created.expiresInSeconds() : 900));
        stateRepo.save(state);

        log.info("Account-link connect: handshake {} opened", created.requestId());
        return pendingStatus(state, now);
    }

    /**
     * Finishes a handshake from the callback the approval page redirected to.
     *
     * <p>The nonce is the whole authorisation here. Anyone can hit this endpoint, so a caller that
     * cannot produce the nonce we minted must change nothing — in particular it must not be able to
     * cancel a legitimate handshake, which is why a mismatch leaves the row alone.
     */
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
                // Re-authentication: the credential we already hold is untouched, so there is
                // nothing to store and nothing to invalidate. The session the browser just
                // received is the entire point.
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

    /** Drops any open handshake. The SaaS row is left to expire on its own. */
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

    private String authorizeUrl(String requestId) {
        String appBase =
                properties.getAppBaseUrl() != null && !properties.getAppBaseUrl().isBlank()
                        ? properties.getAppBaseUrl()
                        : properties.getSaasBaseUrl();
        return trimTrailingSlash(appBase) + AUTHORIZE_PATH + "?request=" + requestId;
    }

    /**
     * Decides the callback, preferring knowledge over inference.
     *
     * <ol>
     *   <li>An explicit {@code public-url} always wins: an operator who has set it knows something
     *       we cannot observe.
     *   <li>Otherwise the portal's own callback, but only if it is on the same origin the browser
     *       reported. The frontend knows its router's base path and its own port; the {@code
     *       Origin} header proves the claim came from that origin rather than from a script or a
     *       stray client.
     *   <li>Otherwise the browser's origin plus our route, which is still better than the request's
     *       own host and port.
     *   <li>Only then the reconstructed request URL, which is wrong whenever the frontend and the
     *       API are on different ports (every local dev setup).
     * </ol>
     */
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
