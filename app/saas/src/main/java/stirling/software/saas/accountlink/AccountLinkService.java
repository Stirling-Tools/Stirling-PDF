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

/** Account-link instance registration + lifecycle (combined-billing "Mode A"). */
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

    /** Revokes an instance iff it belongs to {@code teamId}. */
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

    /**
     * Resolves an active instance from a device credential, or empty if it does not authenticate.
     */
    @Transactional(readOnly = true)
    public Optional<LinkedInstance> resolveActiveInstance(String deviceId, String deviceSecret) {
        if (deviceId == null || deviceSecret == null) {
            return Optional.empty();
        }
        return repo.findByDeviceIdAndRevokedAtIsNull(deviceId)
                .filter(
                        instance ->
                                MessageDigest.isEqual(
                                        sha256Hex(deviceSecret).getBytes(StandardCharsets.UTF_8),
                                        instance.getDeviceSecretHash()
                                                .getBytes(StandardCharsets.UTF_8)));
    }

    private String randomSecret() {
        byte[] buf = new byte[SECRET_BYTES];
        random.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    /** SHA-256 hex of a value. */
    static String sha256Hex(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
