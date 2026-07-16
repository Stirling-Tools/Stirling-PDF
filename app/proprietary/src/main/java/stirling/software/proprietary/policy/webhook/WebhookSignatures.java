package stirling.software.proprietary.policy.webhook;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class WebhookSignatures {

    private static final String ALGORITHM = "HmacSHA256";
    private static final String PREFIX = "sha256=";

    private WebhookSignatures() {}

    public static String sign(String signingSecret, byte[] body) {
        return PREFIX + HexFormat.of().formatHex(hmac(signingSecret, body));
    }

    public static boolean verify(String signingSecret, byte[] body, String presented) {
        if (signingSecret == null || presented == null || body == null) {
            return false;
        }
        String hex = presented.trim();
        if (hex.regionMatches(true, 0, PREFIX, 0, PREFIX.length())) {
            hex = hex.substring(PREFIX.length());
        }
        byte[] presentedBytes;
        try {
            presentedBytes = HexFormat.of().parseHex(hex);
        } catch (IllegalArgumentException notHex) {
            return false;
        }
        return MessageDigest.isEqual(hmac(signingSecret, body), presentedBytes);
    }

    private static byte[] hmac(String signingSecret, byte[] body) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(signingSecret.getBytes(StandardCharsets.UTF_8), ALGORITHM));
            return mac.doFinal(body);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }
}
