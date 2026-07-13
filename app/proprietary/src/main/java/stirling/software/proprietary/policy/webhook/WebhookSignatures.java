package stirling.software.proprietary.policy.webhook;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * HMAC-SHA256 signing scheme for webhook deliveries. The sender signs the exact request body bytes
 * with the source's {@code signingSecret} and presents the result as {@code sha256=<hex>} in the
 * signature header; the receiver recomputes it and compares in constant time. Signing the raw body
 * (rather than form fields) keeps the contract unambiguous - what is signed is exactly what is
 * delivered - and matches how established webhook providers (Stripe, GitHub) sign payloads.
 */
public final class WebhookSignatures {

    private static final String ALGORITHM = "HmacSHA256";
    private static final String PREFIX = "sha256=";

    private WebhookSignatures() {}

    /**
     * The header value a sender should present for {@code body}: {@code sha256=<lowercase hex>}.
     */
    public static String sign(String signingSecret, byte[] body) {
        return PREFIX + HexFormat.of().formatHex(hmac(signingSecret, body));
    }

    /**
     * Whether {@code presented} (a {@code sha256=<hex>} header value, or a bare hex string) is a
     * valid signature of {@code body} under {@code signingSecret}. Constant-time in the compared
     * bytes; a malformed or missing header is simply false, never an exception.
     */
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
