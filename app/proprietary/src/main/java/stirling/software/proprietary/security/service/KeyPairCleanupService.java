package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.DistributedLock;
import stirling.software.common.cluster.DistributedLock.LockHandle;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.JwtVerificationKey;

@Slf4j
@Service
@ConditionalOnBooleanProperty("v2")
public class KeyPairCleanupService {

    // Cluster-wide single-writer: keys live in the shared DB, so only one node may prune + rotate
    // per cycle. Otherwise every node runs this and they race to delete each other's keys.
    private static final String CLEANUP_LOCK = "jwt-key-cleanup";
    private static final Duration LOCK_LEASE = Duration.ofMinutes(5);

    private final KeyPersistenceService keyPersistenceService;
    private final ApplicationProperties.Security.Jwt jwtProperties;
    private final DistributedLock distributedLock;

    @Autowired
    public KeyPairCleanupService(
            KeyPersistenceService keyPersistenceService,
            ApplicationProperties applicationProperties,
            DistributedLock distributedLock) {
        this.keyPersistenceService = keyPersistenceService;
        this.jwtProperties = applicationProperties.getSecurity().getJwt();
        this.distributedLock = distributedLock;
    }

    @Transactional
    @PostConstruct
    @Scheduled(fixedDelay = 1, timeUnit = TimeUnit.DAYS)
    public void cleanup() {
        if (!jwtProperties.isEnableKeyCleanup() || !keyPersistenceService.isKeystoreEnabled()) {
            return;
        }
        // A lock-backend error must never fail this @PostConstruct/scheduled run: degrade to
        // "skip this cycle" so a transient Valkey blip can't stop a node from booting.
        Optional<LockHandle> lock;
        try {
            lock = distributedLock.tryAcquire(CLEANUP_LOCK, LOCK_LEASE);
        } catch (RuntimeException e) {
            log.warn(
                    "Could not acquire the JWT key-cleanup lock ({}); skipping this cycle",
                    e.getMessage());
            return;
        }
        // No lock means another node is already pruning; skip until the next tick.
        if (lock.isEmpty()) {
            log.debug("Another node holds the JWT key-cleanup lock; skipping this cycle");
            return;
        }
        try (LockHandle held = lock.get()) {
            runCleanup();
        }
    }

    private void runCleanup() {
        LocalDateTime cutoffDate =
                LocalDateTime.now().minusDays(jwtProperties.getKeyRetentionDays());

        List<JwtVerificationKey> eligibleKeys =
                keyPersistenceService.getKeysEligibleForCleanup(cutoffDate);
        if (eligibleKeys.isEmpty()) {
            return;
        }

        removeKeys(eligibleKeys);
        keyPersistenceService.refreshActiveKeyPair();
    }

    private void removeKeys(List<JwtVerificationKey> keys) {
        keys.forEach(
                key -> {
                    try {
                        keyPersistenceService.removeKey(key.getKeyId());
                        removePrivateKey(key.getKeyId());
                    } catch (IOException e) {
                        log.warn("Failed to remove key: {}", key.getKeyId(), e);
                    }
                });
    }

    private void removePrivateKey(String keyId) throws IOException {
        if (!keyPersistenceService.isKeystoreEnabled()) {
            return;
        }

        Path privateKeyDirectory = Path.of(InstallationPathConfig.getPrivateKeyPath());
        Path keyFile = privateKeyDirectory.resolve(keyId + KeyPersistenceService.KEY_SUFFIX);

        if (Files.exists(keyFile)) {
            Files.delete(keyFile);
            log.debug("Deleted private key: {}", keyFile);
        }
    }
}
