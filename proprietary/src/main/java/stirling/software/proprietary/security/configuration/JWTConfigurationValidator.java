package stirling.software.proprietary.security.configuration;

import java.security.SecureRandom;
import java.util.Base64;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Slf4j
@Component
public class JWTConfigurationValidator {

    @Autowired private ApplicationProperties applicationProperties;

    @EventListener(ApplicationReadyEvent.class)
    public void validateJWTConfiguration() {
        if (!isJwtEnabled()) {
            log.debug("JWT authentication is disabled");
            return;
        }

        log.info("Validating JWT configuration...");

        ApplicationProperties.Security.JWT jwtConfig = applicationProperties.getSecurity().getJwt();

        // Validate basic configuration
        if (!jwtConfig.isSettingsValid()) {
            log.error("JWT configuration is invalid. Please check your settings.yml file.");
            log.error("Required fields: enabled=true, secretKey (Base64 encoded), expiration > 0");
            throw new IllegalStateException("Invalid JWT configuration");
        }

        // Validate secret key length and format
        validateSecretKey(jwtConfig.getSecretKey());

        // Validate expiration time
        validateExpiration(jwtConfig.getExpiration());

        // Validate algorithm
        validateAlgorithm(jwtConfig.getAlgorithm());

        log.info("JWT configuration validated successfully");
        log.info("JWT algorithm: {}", jwtConfig.getAlgorithm());
        log.info(
                "JWT expiration: {} ms ({} minutes)",
                jwtConfig.getExpiration(),
                jwtConfig.getExpiration() / 60000);
        log.info("JWT issuer: {}", jwtConfig.getIssuer());
    }

    private void validateSecretKey(String secretKey) {
        if (secretKey == null || secretKey.trim().isEmpty()) {
            log.error("JWT secret key is not configured");
            throw new IllegalStateException("JWT secret key is required when JWT is enabled");
        }

        try {
            byte[] decodedKey = Base64.getDecoder().decode(secretKey);

            // For HMAC-SHA256, minimum key length should be 32 bytes (256 bits)
            if (decodedKey.length < 32) {
                log.warn(
                        "JWT secret key is shorter than recommended 256 bits. Current length: {} bits",
                        decodedKey.length * 8);
                log.warn("Consider using a longer key for better security");
            } else {
                log.debug("JWT secret key length: {} bits", decodedKey.length * 8);
            }
        } catch (IllegalArgumentException e) {
            log.error("JWT secret key is not a valid Base64 encoded string");
            log.error("Generate a valid key using: openssl rand -base64 32");
            throw new IllegalStateException("Invalid JWT secret key format", e);
        }
    }

    private void validateExpiration(Long expiration) {
        if (expiration == null || expiration <= 0) {
            log.error("JWT expiration time must be positive. Current value: {}", expiration);
            throw new IllegalStateException("Invalid JWT expiration time");
        }

        // Warn if expiration is too short (less than 5 minutes)
        if (expiration < 300000) { // 5 minutes in milliseconds
            log.warn(
                    "JWT expiration time is very short: {} ms. Consider using a longer expiration time for better user experience.",
                    expiration);
        }

        // Warn if expiration is too long (more than 24 hours)
        if (expiration > 86400000) { // 24 hours in milliseconds
            log.warn(
                    "JWT expiration time is very long: {} ms. Consider using a shorter expiration time for better security.",
                    expiration);
        }
    }

    private void validateAlgorithm(String algorithm) {
        if (algorithm == null || algorithm.trim().isEmpty()) {
            log.warn("JWT algorithm is not specified, defaulting to HS256");
            return;
        }

        switch (algorithm.toUpperCase()) {
            case "HS256", "HS384", "HS512" -> {
                log.debug("Using HMAC algorithm: {}", algorithm);
            }
            case "RS256", "RS384", "RS512" -> {
                log.debug("Using RSA algorithm: {}", algorithm);
                log.warn(
                        "RSA algorithms are configured but current implementation uses HMAC. Consider implementing RSA support for production use.");
            }
            default -> {
                log.warn("Unsupported JWT algorithm: {}. Falling back to HS256", algorithm);
            }
        }
    }

    /**
     * Generate a secure random Base64 encoded secret key for JWT This method is useful for
     * generating initial secret keys
     */
    public static String generateSecretKey() {
        SecureRandom secureRandom = new SecureRandom();
        byte[] key = new byte[32]; // 256 bits
        secureRandom.nextBytes(key);
        return Base64.getEncoder().encodeToString(key);
    }

    private boolean isJwtEnabled() {
        return applicationProperties != null
                && applicationProperties.getSecurity() != null
                && applicationProperties.getSecurity().isJwtActive();
    }

    /** Provides helpful information for JWT configuration troubleshooting */
    public void logConfigurationHelp() {
        log.info("JWT Configuration Help:");
        log.info("1. Enable JWT: Set jwt.enabled=true in settings.yml");
        log.info("2. Generate secret key: openssl rand -base64 32");
        log.info("3. Set expiration: jwt.expiration=3600000 (1 hour in milliseconds)");
        log.info("4. Example generated secret key: {}", generateSecretKey());
        log.info("5. Recommended expiration times:");
        log.info("   - Short sessions: 900000 (15 minutes)");
        log.info("   - Medium sessions: 3600000 (1 hour)");
        log.info("   - Long sessions: 14400000 (4 hours)");
    }
}
