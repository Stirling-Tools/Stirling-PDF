package stirling.software.proprietary.policy.webhook;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.regex.Pattern;

public final class WebhookIds {

    private static final Pattern VALID_ID = Pattern.compile("^[A-Za-z0-9_-]{16,128}$");

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private WebhookIds() {}

    public static String newWebhookId() {
        return randomToken(18);
    }

    public static String newSigningSecret() {
        return randomToken(32);
    }

    public static boolean isValidId(String id) {
        return id != null && VALID_ID.matcher(id).matches();
    }

    private static String randomToken(int bytes) {
        byte[] buffer = new byte[bytes];
        RANDOM.nextBytes(buffer);
        return ENCODER.encodeToString(buffer);
    }
}
