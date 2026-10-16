package stirling.software.saas.accountlink;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.accountlink.LinkKeyFormat;

/**
 * Keys a team leader creates in Stirling Cloud and a self-hosted server redeems for its own device
 * credential, so the person paying need not be the person running the server.
 *
 * <p>A key is single use and short lived because it travels by email and chat. Redeeming one mints
 * a fresh {@link LinkedInstance} through {@link AccountLinkService#register}, so every server ends
 * up with its own credential and nothing downstream knows how it was linked.
 */
@Slf4j
@Service
@Profile("saas")
@ConditionalOnProperty(name = "stirling.billing.account-link.enabled", havingValue = "true")
public class LinkKeyService {

    static final Duration LIFETIME = Duration.ofDays(7);

    private static final int MAX_NAME_LENGTH = 255;

    private final LinkKeyRepository repo;
    private final AccountLinkService accountLinkService;
    private final SecureRandom random = new SecureRandom();

    public LinkKeyService(LinkKeyRepository repo, AccountLinkService accountLinkService) {
        this.repo = repo;
        this.accountLinkService = accountLinkService;
    }

    /** {@code key} is the plaintext, returned exactly once. */
    public record CreatedKey(String keyId, String key, String name, LocalDateTime expiresAt) {}

    /** Either the minted credential, or empty when the key was refused for any reason. */
    public record Redeemed(String deviceId, String deviceSecret, Long teamId) {}

    @Transactional
    public CreatedKey create(Long teamId, Long createdByUserId, String name) {
        LinkKeyFormat.Parts parts = LinkKeyFormat.generate(random);
        LinkKey key = new LinkKey();
        key.setKeyId(parts.keyId());
        key.setSecretHash(AccountLinkService.sha256Hex(parts.secret()));
        key.setTeamId(teamId);
        key.setCreatedByUserId(createdByUserId);
        key.setName(trim(name));
        key.setExpiresAt(LocalDateTime.now().plus(LIFETIME));
        repo.save(key);
        log.info("Account-link key {} created for team {}", parts.keyId(), teamId);
        return new CreatedKey(parts.keyId(), parts.compose(), key.getName(), key.getExpiresAt());
    }

    @Transactional(readOnly = true)
    public List<LinkKey> listUsable(Long teamId) {
        return repo.findUsableByTeam(teamId, LocalDateTime.now());
    }

    @Transactional(readOnly = true)
    public Set<Long> instanceIdsLinkedByKey(Long teamId) {
        return new HashSet<>(repo.findRedeemedInstanceIds(teamId));
    }

    /** Withdraws an unused key; false when there is no such key on this team or it was used. */
    @Transactional
    public boolean revoke(Long teamId, String keyId) {
        Optional<LinkKey> found = repo.findByKeyIdForUpdate(keyId);
        if (found.isEmpty()
                || !found.get().getTeamId().equals(teamId)
                || found.get().getRedeemedAt() != null) {
            return false;
        }
        LinkKey key = found.get();
        if (key.getRevokedAt() == null) {
            key.setRevokedAt(LocalDateTime.now());
            repo.save(key);
            log.info("Account-link key {} revoked for team {}", keyId, teamId);
        }
        return true;
    }

    /**
     * Exchanges a key for a new instance credential. Every refusal looks the same to the caller, so
     * probing cannot tell an unknown key from a used, expired, revoked or mistyped one.
     */
    @Transactional
    public Optional<Redeemed> redeem(String rawKey, String instanceName) {
        Optional<LinkKeyFormat.Parts> parts = LinkKeyFormat.parse(rawKey);
        if (parts.isEmpty()) {
            return Optional.empty();
        }
        String keyId = parts.get().keyId();
        Optional<LinkKey> found = repo.findByKeyIdForUpdate(keyId);
        if (found.isEmpty()) {
            return Optional.empty();
        }
        LinkKey key = found.get();
        if (!secretMatches(parts.get().secret(), key.getSecretHash())) {
            log.warn("Account-link key {}: redeem with a wrong secret", keyId);
            return Optional.empty();
        }
        if (!key.isUsable(LocalDateTime.now())) {
            log.info("Account-link key {}: redeem refused, key is used, revoked or expired", keyId);
            return Optional.empty();
        }
        String name = trim(instanceName);
        AccountLinkService.RegisteredInstance registered =
                accountLinkService.register(
                        key.getTeamId(),
                        key.getCreatedByUserId(),
                        name != null ? name : key.getName());
        key.setRedeemedAt(LocalDateTime.now());
        key.setInstanceId(registered.instanceId());
        repo.save(key);
        log.info(
                "Account-link key {} redeemed: instance {} bound to team {}",
                keyId,
                registered.instanceId(),
                key.getTeamId());
        return Optional.of(
                new Redeemed(registered.deviceId(), registered.deviceSecret(), key.getTeamId()));
    }

    /** Constant time, so a secret cannot be recovered a character at a time. */
    private static boolean secretMatches(String candidate, String expectedHash) {
        return MessageDigest.isEqual(
                AccountLinkService.sha256Hex(candidate).getBytes(StandardCharsets.UTF_8),
                expectedHash.getBytes(StandardCharsets.UTF_8));
    }

    private static String trim(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String stripped = value.strip();
        return stripped.length() <= MAX_NAME_LENGTH
                ? stripped
                : stripped.substring(0, MAX_NAME_LENGTH);
    }
}
