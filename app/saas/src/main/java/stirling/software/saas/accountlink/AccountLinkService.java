package stirling.software.saas.accountlink;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

/**
 * Account-link instance registration + lifecycle (combined-billing "Mode A").
 *
 * <p>Mints a {@code device_id} (public) + {@code device_secret} (high-entropy, returned once) bound
 * to a team, persisting only the SHA-256 hash of the secret. The instance authenticates its
 * unattended entitlement reads with that credential.
 *
 * <p>Gated behind {@code stirling.billing.account-link.enabled}: when off the bean is absent, so
 * {@link AccountLinkController} (which depends on it) drops out too and its endpoints 404.
 */
@Slf4j
@Service
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class AccountLinkService {

    /** 32 bytes of entropy → URL-safe secret; high enough that an unsalted SHA-256 hash is fine. */
    private static final int SECRET_BYTES = 32;

    private final LinkedInstanceRepository repo;
    private final SecureRandom random = new SecureRandom();

    public AccountLinkService(LinkedInstanceRepository repo) {
        this.repo = repo;
    }

    /** Result of {@link #register}; {@code deviceSecret} is plaintext and returned exactly once. */
    public record RegisteredInstance(
            Long instanceId, String deviceId, String deviceSecret, String name) {}

    /**
     * Creates a new linked instance for {@code teamId}, returning the one-time plaintext secret.
     */
    @Transactional
    public RegisteredInstance register(Long teamId, Long createdByUserId, String name) {
        String deviceId = UUID.randomUUID().toString();
        String deviceSecret = randomSecret();

        LinkedInstance instance = new LinkedInstance();
        instance.setTeamId(teamId);
        instance.setCreatedByUserId(createdByUserId);
        instance.setDeviceId(deviceId);
        instance.setDeviceSecretHash(sha256Hex(deviceSecret));
        instance.setName(name);
        repo.save(instance);

        log.info(
                "Account-link: registered instance {} (device {}) for team {}",
                instance.getInstanceId(),
                deviceId,
                teamId);
        return new RegisteredInstance(instance.getInstanceId(), deviceId, deviceSecret, name);
    }

    /**
     * All instances for a team, newest first (includes revoked, for the "Linked instances" list).
     */
    @Transactional(readOnly = true)
    public List<LinkedInstance> list(Long teamId) {
        return repo.findByTeamIdOrderByCreatedAtDesc(teamId);
    }

    /**
     * Revokes an instance iff it belongs to {@code teamId}. Returns false if not found or owned by
     * a different team (so a caller can never revoke another team's instance). Idempotent.
     */
    @Transactional
    public boolean revoke(Long teamId, Long instanceId) {
        Optional<LinkedInstance> found = repo.findById(instanceId);
        if (found.isEmpty() || !found.get().getTeamId().equals(teamId)) {
            return false;
        }
        LinkedInstance instance = found.get();
        if (instance.getRevokedAt() == null) {
            instance.setRevokedAt(LocalDateTime.now());
            repo.save(instance);
            log.info("Account-link: revoked instance {} for team {}", instanceId, teamId);
        }
        return true;
    }

    private String randomSecret() {
        byte[] buf = new byte[SECRET_BYTES];
        random.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    /** SHA-256 hex of a value. The device secret is high-entropy, so no salt is required. */
    static String sha256Hex(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
