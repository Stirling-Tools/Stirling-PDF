package stirling.software.proprietary.security.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.RefreshToken;
import stirling.software.proprietary.security.repository.RefreshTokenRepository;

/**
 * Service for managing refresh tokens. Implements secure token generation, validation, and
 * revocation
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${security.jwt.refreshTokenDays:7}")
    private long refreshTokenValidityDays;

    private static final int TOKEN_LENGTH = 32;

    /**
     * Generates a new refresh token for a user
     *
     * @param userId User ID
     * @param request HTTP request for audit trail (IP, user agent)
     * @return The generated refresh token (plaintext - only shown once)
     */
    @Transactional
    public String generateRefreshToken(Long userId, HttpServletRequest request) {
        byte[] tokenBytes = new byte[TOKEN_LENGTH];
        secureRandom.nextBytes(tokenBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);

        // Hash the token for storage
        String tokenHash = hashToken(token);

        // Build refresh token entity
        RefreshToken refreshToken =
                RefreshToken.builder()
                        .userId(userId)
                        .tokenHash(tokenHash)
                        .expiresAt(LocalDateTime.now().plusDays(refreshTokenValidityDays))
                        .issuedIp(extractIpAddress(request))
                        .userAgent(extractUserAgent(request))
                        .revoked(false)
                        .build();

        refreshTokenRepository.save(refreshToken);

        log.debug("Generated new refresh token for user ID: {}", userId);
        return token;
    }

    /**
     * Validates a refresh token
     *
     * @param token The plaintext refresh token
     * @return Optional containing the RefreshToken entity if valid
     */
    public Optional<RefreshToken> validateRefreshToken(String token) {
        if (token == null || token.isEmpty()) {
            log.debug("Refresh token validation failed: token is null or empty");
            return Optional.empty();
        }

        try {
            String tokenHash = hashToken(token);
            Optional<RefreshToken> refreshTokenOpt =
                    refreshTokenRepository.findByTokenHash(tokenHash);

            if (refreshTokenOpt.isEmpty()) {
                log.debug("Refresh token validation failed: token not found");
                return Optional.empty();
            }

            RefreshToken refreshToken = refreshTokenOpt.get();

            if (!refreshToken.isValid()) {
                log.debug(
                        "Refresh token validation failed: token revoked or expired (userId: {})",
                        refreshToken.getUserId());
                return Optional.empty();
            }

            log.debug(
                    "Refresh token validated successfully for user ID: {}",
                    refreshToken.getUserId());
            return Optional.of(refreshToken);

        } catch (Exception e) {
            log.error("Error validating refresh token", e);
            return Optional.empty();
        }
    }

    /**
     * Revokes a specific refresh token
     *
     * @param token The plaintext refresh token
     * @return true if revoked successfully
     */
    @Transactional
    public boolean revokeRefreshToken(String token) {
        try {
            String tokenHash = hashToken(token);
            int revoked = refreshTokenRepository.revokeByTokenHash(tokenHash);
            log.debug("Revoked {} refresh token(s)", revoked);
            return revoked > 0;
        } catch (Exception e) {
            log.error("Error revoking refresh token", e);
            return false;
        }
    }

    /**
     * Revokes all refresh tokens for a user (used on logout or security events)
     *
     * @param userId User ID
     * @return Number of tokens revoked
     */
    @Transactional
    public int revokeAllTokensForUser(Long userId) {
        int revoked = refreshTokenRepository.revokeAllByUserId(userId);
        log.info("Revoked {} refresh token(s) for user ID: {}", revoked, userId);
        return revoked;
    }

    /**
     * Rotates a refresh token (revokes old, generates new) Best practice for security: rotate
     * tokens on each refresh
     *
     * @param oldToken The old refresh token to revoke
     * @param userId User ID
     * @param request HTTP request for audit trail
     * @return New refresh token
     */
    @Transactional
    public String rotateRefreshToken(String oldToken, Long userId, HttpServletRequest request) {
        // Revoke the old token
        revokeRefreshToken(oldToken);

        // Generate and return a new token
        return generateRefreshToken(userId, request);
    }

    /**
     * Cleans up expired refresh tokens (should be called periodically)
     *
     * @return Number of tokens deleted
     */
    @Transactional
    public int cleanupExpiredTokens() {
        int deleted = refreshTokenRepository.deleteExpiredTokens(LocalDateTime.now());
        if (deleted > 0) {
            log.info("Cleaned up {} expired refresh tokens", deleted);
        }
        return deleted;
    }

    /**
     * Hashes a token using SHA-256
     *
     * @param token Plaintext token
     * @return Hex-encoded hash
     */
    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));

            return bytesToHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 algorithm not available", e);
        }
    }

    /** Converts byte array to hex string */
    private String bytesToHex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte b : bytes) {
            result.append(String.format("%02x", b));
        }
        return result.toString();
    }

    /** Extracts IP address from request */
    private String extractIpAddress(HttpServletRequest request) {
        if (request == null) {
            return null;
        }

        // Check for forwarded IP (behind proxy)
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty()) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty()) {
            ip = request.getRemoteAddr();
        }

        // Handle multiple IPs (take first one)
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }

        // Truncate to fit column size (45 chars for IPv6)
        if (ip != null && ip.length() > 45) {
            ip = ip.substring(0, 45);
        }

        return ip;
    }

    /** Extracts user agent from request */
    private String extractUserAgent(HttpServletRequest request) {
        if (request == null) {
            return null;
        }

        String userAgent = request.getHeader("User-Agent");

        // Truncate to fit column size (255 chars)
        if (userAgent != null && userAgent.length() > 255) {
            userAgent = userAgent.substring(0, 255);
        }

        return userAgent;
    }
}
