package stirling.software.proprietary.security.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.annotation.PostConstruct;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.JwtSigningKeyRepository;
import stirling.software.proprietary.security.model.JwtSigningKey;

@Slf4j
@Service
@ConditionalOnBooleanProperty("v2")
public class KeyPairCleanupService {

    private final JwtSigningKeyRepository signingKeyRepository;
    private final KeystoreService keystoreService;
    private final ApplicationProperties.Security.Jwt jwtProperties;

    @Autowired
    public KeyPairCleanupService(
            JwtSigningKeyRepository signingKeyRepository,
            KeystoreService keystoreService,
            ApplicationProperties applicationProperties) {
        this.signingKeyRepository = signingKeyRepository;
        this.keystoreService = keystoreService;
        this.jwtProperties = applicationProperties.getSecurity().getJwt();
    }

    @Transactional
    @PostConstruct
    @Scheduled(fixedDelay = 24, timeUnit = TimeUnit.HOURS)
    public void cleanup() {
        if (!jwtProperties.isEnableKeyCleanup() || !keystoreService.isKeystoreEnabled()) {
            log.debug("Key cleanup is disabled");
            return;
        }

        log.info("Removing keys older than {} day(s)", jwtProperties.getKeyRetentionDays());

        try {
            LocalDateTime cutoffDate =
                    LocalDateTime.now().minusDays(jwtProperties.getKeyRetentionDays());
            long totalKeysEligible = signingKeyRepository.countKeysEligibleForCleanup(cutoffDate);

            if (totalKeysEligible == 0) {
                log.info("No keys eligible for cleanup");
                return;
            }

            log.info("{} eligible keys found", totalKeysEligible);

            batchCleanup(cutoffDate);
        } catch (Exception e) {
            log.error("Error during scheduled key cleanup", e);
        }
    }

    private void batchCleanup(LocalDateTime cutoffDate) {
        int batchSize = jwtProperties.getCleanupBatchSize();

        while (true) {
            Pageable pageable = PageRequest.of(0, batchSize);
            List<JwtSigningKey> keysToCleanup =
                    signingKeyRepository.findKeysOlderThan(cutoffDate, pageable);

            if (keysToCleanup.isEmpty()) {
                break;
            }

            cleanupKeyBatch(keysToCleanup);

            if (keysToCleanup.size() < batchSize) {
                break;
            }
        }
    }

    private void cleanupKeyBatch(List<JwtSigningKey> keys) {
        keys.forEach(
                key -> {
                    try {
                        removePrivateKey(key.getKeyId());
                    } catch (IOException e) {
                        log.warn("Failed to cleanup private key for keyId: {}", key.getKeyId(), e);
                    }
                });

        List<Long> keyIds = keys.stream().map(JwtSigningKey::getId).collect(Collectors.toList());

        signingKeyRepository.deleteAllByIdInBatch(keyIds);
        log.debug("Deleted {} signing keys from database", keyIds.size());
    }

    private void removePrivateKey(String keyId) throws IOException {
        if (!keystoreService.isKeystoreEnabled()) {
            return;
        }

        Path privateKeyDirectory = Paths.get(InstallationPathConfig.getPrivateKeyPath());
        Path keyFile = privateKeyDirectory.resolve(keyId + KeystoreService.KEY_SUFFIX);

        if (Files.exists(keyFile)) {
            Files.delete(keyFile);
            log.debug("Deleted private key file: {}", keyFile);
        } else {
            log.debug("Private key file not found: {}", keyFile);
        }
    }

    public long getKeysEligibleForCleanup() {
        if (!jwtProperties.isEnableKeyCleanup() || !keystoreService.isKeystoreEnabled()) {
            return 0;
        }

        LocalDateTime cutoffDate =
                LocalDateTime.now().minusDays(jwtProperties.getKeyRetentionDays());
        return signingKeyRepository.countKeysEligibleForCleanup(cutoffDate);
    }
}
