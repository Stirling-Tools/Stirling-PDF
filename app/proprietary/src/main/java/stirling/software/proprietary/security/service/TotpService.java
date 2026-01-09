package stirling.software.proprietary.security.service;

import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.util.Base32Codec;

@Service
@RequiredArgsConstructor
public class TotpService {

    private static final int SECRET_LENGTH_BYTES = 20;
    private static final int CODE_DIGITS = 6;
    private static final int PERIOD_SECONDS = 30;
    private static final String HMAC_ALGORITHM = "HmacSHA1";
    private static final String DEFAULT_ISSUER = "Stirling PDF";

    private final ApplicationProperties applicationProperties;
    private final SecureRandom secureRandom = new SecureRandom();

    public String generateSecret() {
        byte[] secret = new byte[SECRET_LENGTH_BYTES];
        secureRandom.nextBytes(secret);
        return Base32Codec.encode(secret);
    }

    public boolean isValidCode(String secret, String code) {
        return getValidTimeStep(secret, code) != null;
    }

    public Long getValidTimeStep(String secret, String code) {
        if (secret == null || secret.isBlank() || code == null) {
            return null;
        }

        String normalizedCode = code.replace(" ", "");
        if (!normalizedCode.matches("\\d{6}")) {
            return null;
        }

        byte[] secretKey = Base32Codec.decode(secret);
        long timeStep = Instant.now().getEpochSecond() / PERIOD_SECONDS;

        for (int offset = -1; offset <= 1; offset++) {
            long candidate = timeStep + offset;
            if (generateCode(secretKey, candidate).equals(normalizedCode)) {
                return candidate;
            }
        }

        return null;
    }

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
