package stirling.software.proprietary.policy.webhook;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.regex.Pattern;

/**
 * Generates and validates the two server-side tokens a webhook source carries: the public {@code
 * webhookId} that routes a delivery URL to a source, and the {@code signingSecret} that
 * authenticates each delivery. Both are URL-safe base64 of {@link SecureRandom} bytes, so both are
 * unguessable; the id is the routing capability and the secret is the HMAC key. The id's character
 * set is constrained so it can be used verbatim as a single path segment and as a spool directory
 * name without traversal risk.
 */
public final class WebhookIds {

    /** URL-safe base64 without padding: exactly the characters a single path segment allows. */
    private static final Pattern VALID_ID = Pattern.compile("^[A-Za-z0-9_-]{16,128}$");

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();

    private WebhookIds() {}

    /**
     * A fresh routing token (~24 chars). Not secret, but unguessable so it cannot be enumerated.
     */
    public static String newWebhookId() {
        return randomToken(18);
    }

    /** A fresh HMAC signing key (~43 chars) revealed to the operator once at creation. */
    public static String newSigningSecret() {
        return randomToken(32);
    }

    /**
     * Whether {@code id} is a well-formed webhook id, safe as a path segment and directory name.
     */
    public static boolean isValidId(String id) {
        return id != null && VALID_ID.matcher(id).matches();
    }

    private static String randomToken(int bytes) {
        byte[] buffer = new byte[bytes];
        RANDOM.nextBytes(buffer);
        return ENCODER.encodeToString(buffer);
    }
}
