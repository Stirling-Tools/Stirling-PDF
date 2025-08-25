package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.model.JwtVerificationKey;

@Slf4j
@Service
@ConditionalOnBooleanProperty("v2")
public class KeyPairCleanupService {

    private final KeyPersistenceService keyPersistenceService;
    private final ApplicationProperties.Security.Jwt jwtProperties;

    public KeyPairCleanupService(
            KeyPersistenceService keyPersistenceService,
            ApplicationProperties applicationProperties) {
        this.keyPersistenceService = keyPersistenceService;
        this.jwtProperties = applicationProperties.getSecurity().getJwt();
    }

    @Transactional
    @PostConstruct
    @Scheduled(fixedDelay = 1, timeUnit = TimeUnit.DAYS)
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

        log.info("Removing keys older than retention period");
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
