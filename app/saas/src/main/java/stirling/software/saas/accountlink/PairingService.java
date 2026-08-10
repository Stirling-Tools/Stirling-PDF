package stirling.software.saas.accountlink;

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
 * Device-grant pairing between a self-hosted instance and a SaaS team (RFC 8628).
 *
 * <p>Replaces carrying an admin's Supabase JWT through the instance's browser. The instance starts
 * a pairing and polls; the admin approves on our own site, where redirects and SSO already work.
 * That is the whole point: a customer origin can never be on the Supabase redirect allow-list, so
 * the human half of the flow has to happen somewhere we control.
 *
 * <p>Credential minting is delegated to {@link AccountLinkService#register}, so a paired instance
 * is indistinguishable from one registered the old way and everything downstream (entitlement,
 * metering, revocation) is untouched.
 */
@Slf4j
@Service
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class PairingService {

    /**
     * User-code alphabet with the ambiguous characters removed (no I, L, O, U, 0, 1) so a code read
     * off one screen and typed on another cannot be mistyped into a different valid code.
     */
    private static final String ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

    private static final int USER_CODE_LENGTH = 8;
    private static final int DEVICE_CODE_BYTES = 32;

    /** Short enough that a leaked code is near-useless, long enough to walk to another device. */
    static final Duration LIFETIME = Duration.ofMinutes(10);

    /** Advertised poll interval. Polling faster than this earns a SLOW_DOWN. */
    static final int INTERVAL_SECONDS = 5;

    /** Concurrent pairings one address may start within {@link #LIFETIME}. */
    static final int MAX_STARTS_PER_IP = 5;

    /** Attempts before we give up finding an unused user code (collisions are vanishingly rare). */
    private static final int CODE_ATTEMPTS = 10;

    private final PairingRequestRepository repo;
    private final AccountLinkService accountLinkService;
    private final SecureRandom random = new SecureRandom();

    public PairingService(PairingRequestRepository repo, AccountLinkService accountLinkService) {
        this.repo = repo;
        this.accountLinkService = accountLinkService;
    }

    public record StartResult(
            String userCode, String deviceCode, LocalDateTime expiresAt, int intervalSeconds) {}

    /**
     * What a leader is shown before approving. Deliberately specific: this is the phishing guard.
     */
    public record PendingView(
            String userCode,
            String instanceLabel,
            String instanceVersion,
            String requesterIp,
            LocalDateTime createdAt,
            LocalDateTime expiresAt) {}

    public enum PollOutcome {
        PENDING,
        APPROVED,
        DENIED,
        EXPIRED,
        SLOW_DOWN,
        UNKNOWN
    }

    /** {@code credential} is populated only on {@link PollOutcome#APPROVED}, exactly once. */
    public record PollResult(
            PollOutcome outcome, AccountLinkService.RegisteredInstance credential, Long teamId) {

        static PollResult of(PollOutcome outcome) {
            return new PollResult(outcome, null, null);
        }
    }

    /** Raised when an address starts more concurrent pairings than {@link #MAX_STARTS_PER_IP}. */
    public static class TooManyRequestsException extends RuntimeException {
        public TooManyRequestsException() {
            super("Too many pairing requests from this address");
        }
    }

    @Transactional
    public StartResult start(String instanceLabel, String instanceVersion, String requesterIp) {
        LocalDateTime now = LocalDateTime.now();
        if (requesterIp != null
                && repo.countByRequesterIpAndCreatedAtAfter(requesterIp, now.minus(LIFETIME))
                        >= MAX_STARTS_PER_IP) {
            throw new TooManyRequestsException();
        }

        String userCode = allocateUserCode();
        String deviceCode = randomDeviceCode();

        PairingRequest request = new PairingRequest();
        request.setUserCode(userCode);
        request.setDeviceCodeHash(AccountLinkService.sha256Hex(deviceCode));
        request.setStatus(PairingRequest.Status.PENDING);
        request.setInstanceLabel(trim(instanceLabel, 128));
        request.setInstanceVersion(trim(instanceVersion, 32));
        request.setRequesterIp(trim(requesterIp, 64));
        request.setExpiresAt(now.plus(LIFETIME));
        repo.save(request);

        log.info("Pairing: started {} for label {}", userCode, request.getInstanceLabel());
        return new StartResult(userCode, deviceCode, request.getExpiresAt(), INTERVAL_SECONDS);
    }

    /**
     * The pending pairing behind a typed code, or empty when unknown, expired or already settled.
     */
    @Transactional(readOnly = true)
    public Optional<PendingView> lookup(String typedCode) {
        return findPending(typedCode)
                .map(
                        p ->
                                new PendingView(
                                        p.getUserCode(),
                                        p.getInstanceLabel(),
                                        p.getInstanceVersion(),
                                        p.getRequesterIp(),
                                        p.getCreatedAt(),
                                        p.getExpiresAt()));
    }

    /**
     * Binds a pending pairing to {@code teamId}. The caller must already have been checked for team
     * leadership; the team is never taken from the request body.
     */
    @Transactional
    public boolean approve(String typedCode, Long teamId, Long userId, String name) {
        Optional<PairingRequest> found = findPending(typedCode);
        if (found.isEmpty()) {
            return false;
        }
        PairingRequest request = found.get();
        request.setStatus(PairingRequest.Status.APPROVED);
        request.setTeamId(teamId);
        request.setApprovedByUserId(userId);
        request.setApprovedAt(LocalDateTime.now());
        if (name != null && !name.isBlank()) {
            request.setInstanceLabel(trim(name, 128));
        }
        repo.save(request);
        log.info("Pairing: {} approved for team {}", request.getUserCode(), teamId);
        return true;
    }

    @Transactional
    public boolean deny(String typedCode) {
        Optional<PairingRequest> found = findPending(typedCode);
        if (found.isEmpty()) {
            return false;
        }
        PairingRequest request = found.get();
        request.setStatus(PairingRequest.Status.DENIED);
        repo.save(request);
        log.info("Pairing: {} denied", request.getUserCode());
        return true;
    }

    /**
     * The instance's poll. Mints the device credential on the first poll after approval and marks
     * the pairing consumed, so a replayed device code cannot mint a second credential.
     */
    @Transactional
    public PollResult poll(String deviceCode) {
        if (deviceCode == null || deviceCode.isBlank()) {
            return PollResult.of(PollOutcome.UNKNOWN);
        }
        Optional<PairingRequest> found =
                repo.findByDeviceCodeHashForUpdate(AccountLinkService.sha256Hex(deviceCode));
        if (found.isEmpty()) {
            return PollResult.of(PollOutcome.UNKNOWN);
        }
        PairingRequest request = found.get();
        LocalDateTime now = LocalDateTime.now();

        // Consumed is terminal and must never mint again, even before the expiry passes.
        if (request.getStatus() == PairingRequest.Status.CONSUMED) {
            return PollResult.of(PollOutcome.UNKNOWN);
        }
        if (request.getStatus() == PairingRequest.Status.DENIED) {
            return PollResult.of(PollOutcome.DENIED);
        }
        if (request.isExpired(now)) {
            return PollResult.of(PollOutcome.EXPIRED);
        }

        LocalDateTime lastPolled = request.getLastPolledAt();
        boolean tooFast =
                lastPolled != null && lastPolled.plusSeconds(INTERVAL_SECONDS).isAfter(now);
        request.setLastPolledAt(now);

        if (request.getStatus() == PairingRequest.Status.PENDING) {
            repo.save(request);
            return PollResult.of(tooFast ? PollOutcome.SLOW_DOWN : PollOutcome.PENDING);
        }

        AccountLinkService.RegisteredInstance credential =
                accountLinkService.register(
                        request.getTeamId(),
                        request.getApprovedByUserId(),
                        request.getInstanceLabel());
        request.setStatus(PairingRequest.Status.CONSUMED);
        request.setConsumedAt(now);
        repo.save(request);
        log.info(
                "Pairing: {} consumed, instance {} bound to team {}",
                request.getUserCode(),
                credential.instanceId(),
                request.getTeamId());
        return new PollResult(PollOutcome.APPROVED, credential, request.getTeamId());
    }

    /** Accepts what a human typed: any case, with or without the display separator. */
    static String normalise(String typedCode) {
        if (typedCode == null) {
            return "";
        }
        return typedCode.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
    }

    /** Groups a stored code for display, e.g. {@code WXYZ4821} to {@code WXYZ-4821}. */
    static String forDisplay(String userCode) {
        if (userCode == null || userCode.length() != USER_CODE_LENGTH) {
            return userCode;
        }
        return userCode.substring(0, 4) + "-" + userCode.substring(4);
    }

    private Optional<PairingRequest> findPending(String typedCode) {
        String normalised = normalise(typedCode);
        if (normalised.isEmpty()) {
            return Optional.empty();
        }
        return repo.findByUserCode(normalised)
                .filter(p -> p.getStatus() == PairingRequest.Status.PENDING)
                .filter(p -> !p.isExpired(LocalDateTime.now()));
    }

    private String allocateUserCode() {
        for (int attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
            String candidate = randomUserCode();
            if (repo.findByUserCode(candidate).isEmpty()) {
                return candidate;
            }
        }
        throw new IllegalStateException("Could not allocate a free pairing code");
    }

    private String randomUserCode() {
        StringBuilder sb = new StringBuilder(USER_CODE_LENGTH);
        for (int i = 0; i < USER_CODE_LENGTH; i++) {
            sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return sb.toString();
    }

    private String randomDeviceCode() {
        byte[] buf = new byte[DEVICE_CODE_BYTES];
        random.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    private static String trim(String value, int max) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String stripped = value.strip();
        return stripped.length() <= max ? stripped : stripped.substring(0, max);
    }
}
