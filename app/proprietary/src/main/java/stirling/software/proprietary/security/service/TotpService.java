package stirling.software.proprietary.security.service;

import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.regex.Pattern;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.util.Base32Codec;

/**
 * Service for generating and validating TOTP secrets and codes for MFA authentication.
 *
 * <p>This service handles secret generation, code validation across time steps, and building
 * otpauth:// URIs to provision authenticator apps.
 */
@Service
@RequiredArgsConstructor
public class TotpService {

    private static final int SECRET_LENGTH_BYTES = 20;
    private static final int CODE_DIGITS = 6;
    private static final int PERIOD_SECONDS = 30;
    private static final String HMAC_ALGORITHM = "HmacSHA1";
    private static final String DEFAULT_ISSUER = "Stirling PDF";
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final Pattern TOTP_CODE_PATTERN = Pattern.compile("\\d{6}");

    private final ApplicationProperties applicationProperties;

    /**
     * Generates a new random TOTP secret encoded in Base32.
     *
     * @return Base32-encoded secret suitable for provisioning an authenticator app
     */
    public String generateSecret() {
        byte[] secret = new byte[SECRET_LENGTH_BYTES];
        SECURE_RANDOM.nextBytes(secret);
        return Base32Codec.encode(secret);
    }

    /**
     * Checks whether a submitted TOTP code is valid for the current time window.
     *
     * @param secret Base32-encoded shared secret
     * @param code six-digit code supplied by the user
     * @return {@code true} if the code is valid for the current time window
     */
    public boolean isValidCode(String secret, String code) {
        return getValidTimeStep(secret, code) != null;
    }

    /**
     * Validates a TOTP code and returns the time step it matches.
     *
     * @param secret Base32-encoded shared secret
     * @param code six-digit code supplied by the user
     * @return matching time step, or {@code null} if the code is invalid
     */
    public Long getValidTimeStep(String secret, String code) {
        if (secret == null || secret.isBlank() || code == null) {
            return null;
        }

        String normalizedCode = code.replace(" ", "");
        if (!TOTP_CODE_PATTERN.matcher(normalizedCode).matches()) {
            return null;
        }

        byte[] secretKey;
        try {
            secretKey = Base32Codec.decode(secret);
        } catch (IllegalArgumentException e) {
            return null;
        }
        long timeStep = Instant.now().getEpochSecond() / PERIOD_SECONDS;
        byte[] normalizedCodeBytes = normalizedCode.getBytes(StandardCharsets.UTF_8);

        for (int offset = -1; offset <= 1; offset++) {
            long candidate = timeStep + offset;
            String generatedCode = generateCode(secretKey, candidate);
            if (MessageDigest.isEqual(
                    generatedCode.getBytes(StandardCharsets.UTF_8), normalizedCodeBytes)) {
                return candidate;
            }
        }

        return null;
    }

    /**
     * Builds an otpauth:// URI for configuring TOTP in authenticator apps.
     *
     * @param username account identifier to embed in the label
     * @param secret Base32-encoded secret to embed in the URI
     * @return otpauth URI that can be encoded as a QR code
     */
    public String buildOtpAuthUri(String username, String secret) {
        String issuer = resolveIssuer();
        String label = encodeForOtpAuth(issuer + ":" + username);
        String encodedIssuer = encodeForOtpAuth(issuer);

        return "otpauth://totp/"
                + label
                + "?secret="
                + secret
                + "&issuer="
                + encodedIssuer
                + "&algorithm=SHA1&digits="
                + CODE_DIGITS
                + "&period="
                + PERIOD_SECONDS;
    }

    private String encodeForOtpAuth(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private String resolveIssuer() {
        if (applicationProperties.getUi() != null) {
            String appName = applicationProperties.getUi().getAppNameNavbar();
            if (appName != null && !appName.isBlank()) {
                return appName.trim();
            }
        }
        return DEFAULT_ISSUER;
    }

    private String generateCode(byte[] secret, long timeStep) {
        try {
            ByteBuffer buffer = ByteBuffer.allocate(8);
            buffer.putLong(timeStep);

            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret, HMAC_ALGORITHM));
            byte[] hash = mac.doFinal(buffer.array());

            int offset = hash[hash.length - 1] & 0x0F;
            int binary =
                    ((hash[offset] & 0x7F) << 24)
                            | ((hash[offset + 1] & 0xFF) << 16)
                            | ((hash[offset + 2] & 0xFF) << 8)
                            | (hash[offset + 3] & 0xFF);

            int otp = binary % (int) Math.pow(10, CODE_DIGITS);
            return String.format("%0" + CODE_DIGITS + "d", otp);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to generate TOTP code", e);
        }
    }
}
