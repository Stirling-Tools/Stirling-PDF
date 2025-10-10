package stirling.software.proprietary.security.service;

import java.util.concurrent.TimeUnit;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(name = "v2", havingValue = "true", matchIfMissing = true)
public class KeyRotationService {

    private final KeyPersistenceServiceInterface keyPersistenceService;
    private final ApplicationProperties.Security.Jwt jwt;

    @Scheduled(fixedDelay = 1, timeUnit = TimeUnit.DAYS)
    public void rotateIfEnabled() {
        if (!jwt.isEnabled() || !jwt.isKeyRotationEnabled()) {
            return;
        }

        try {
            log.info("Rotating JWT signing keys)");
            keyPersistenceService.refreshActiveKeyPair();
        } catch (Exception e) {
            log.warn("JWT key rotation failed: {}", e.getMessage(), e);
        }
    }
}
