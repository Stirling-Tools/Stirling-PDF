package stirling.software.proprietary.policy.webhook;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** HMAC-SHA256 signing of a webhook delivery's raw body (header sha256=<hex>). */
public final class WebhookSignatures {

    private static final String ALGORITHM = "HmacSHA256";
    private static final String PREFIX = "sha256=";

    private WebhookSignatures() {}

    /** The header a sender presents for {@code body}: {@code sha256=<lowercase hex>}. */
    public static String sign(String signingSecret, byte[] body) {
        return PREFIX + HexFormat.of().formatHex(hmac(signingSecret, body));
    }

    /** Whether the presented signature is valid for {@code body}; false on bad input. */
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
            // HmacSHA256 is a required JCE algorithm and the key is always non-empty here.
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }
}
