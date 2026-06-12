package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.List;

import io.quarkus.runtime.StartupEvent;
import io.quarkus.scheduler.Scheduled;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.JwtVerificationKey;

@Slf4j
@ApplicationScoped
// TODO: Migration required - Spring @ConditionalOnBooleanProperty("v2") dropped; the "v2"
// runtime toggle has no direct CDI equivalent. Guard activation via a runtime check or
// @io.quarkus.arc.lookup.LookupIfProperty / quarkus.scheduler config if this bean should be
// conditionally enabled.
public class KeyPairCleanupService {

    private final KeyPersistenceService keyPersistenceService;
    private final ApplicationProperties.Security.Jwt jwtProperties;

    @Inject
    public KeyPairCleanupService(
            KeyPersistenceService keyPersistenceService,
            ApplicationProperties applicationProperties) {
        this.keyPersistenceService = keyPersistenceService;
        this.jwtProperties = applicationProperties.getSecurity().getJwt();
    }

    // Run cleanup once at application startup (replaces Spring @PostConstruct on the scheduled
    // method).
    void onStart(@Observes StartupEvent event) {
        cleanup();
    }

    @Transactional
    @Scheduled(every = "24h")
    public void cleanup() {
        if (!jwtProperties.isEnableKeyCleanup() || !keyPersistenceService.isKeystoreEnabled()) {
            return;
        }

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

        Path privateKeyDirectory = Paths.get(InstallationPathConfig.getPrivateKeyPath());
        Path keyFile = privateKeyDirectory.resolve(keyId + KeyPersistenceService.KEY_SUFFIX);

        if (Files.exists(keyFile)) {
            Files.delete(keyFile);
            log.debug("Deleted private key: {}", keyFile);
        }
    }
}
