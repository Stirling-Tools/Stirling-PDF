package stirling.software.proprietary.policy.webhook;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.regex.Pattern;

/** Generates and validates a webhook's routing id and signing secret. */
public final class WebhookIds {

    /** URL-safe base64 without padding: the characters a single path segment allows. */
    private static final Pattern VALID_ID = Pattern.compile("^[A-Za-z0-9_-]{16,128}$");

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private WebhookIds() {}

    /** A fresh routing token (~24 chars), unguessable so it cannot be enumerated. */
    public static String newWebhookId() {
        return randomToken(18);
    }

    /** A fresh HMAC signing key (~43 chars) revealed to the operator once at creation. */
    public static String newSigningSecret() {
        return randomToken(32);
    }

    /** Whether {@code id} is well-formed and safe as a path segment / directory name. */
    public static boolean isValidId(String id) {
        return id != null && VALID_ID.matcher(id).matches();
    }

    private static String randomToken(int bytes) {
        byte[] buffer = new byte[bytes];
        RANDOM.nextBytes(buffer);
        return ENCODER.encodeToString(buffer);
    }
}
