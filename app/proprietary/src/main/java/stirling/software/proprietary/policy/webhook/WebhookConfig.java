package stirling.software.proprietary.policy.webhook;

import java.util.Map;

/**
 * Config for a webhook input source, parsed from a spec's options map. A webhook is a push source:
 * external systems POST documents to a signed URL keyed by {@code webhookId}, and each delivery is
 * verified against {@code signingSecret} before it is spooled for the referencing policies. Both
 * {@code webhookId} (the public URL token) and {@code signingSecret} (the HMAC key) are generated
 * server-side on create - a client never supplies them - so the receiver's identity and the
 * sender's proof of authenticity are always Stirling's own. {@code mode} is "consume" (default: a
 * spooled document is deleted once every policy that claimed it has settled successfully) or
 * "snapshot" (stateless, every run re-reads whatever is currently spooled).
 */
public record WebhookConfig(String webhookId, String signingSecret, boolean snapshot) {

    public static final String WEBHOOK_ID_OPTION = "webhookId";
    public static final String SIGNING_SECRET_OPTION = "signingSecret";
    private static final String MODE_OPTION = "mode";
    private static final String MODE_CONSUME = "consume";
    private static final String MODE_SNAPSHOT = "snapshot";

    public static WebhookConfig from(Map<String, Object> options) {
        String webhookId = trimmed(options.get(WEBHOOK_ID_OPTION));
        if (webhookId == null) {
            throw new IllegalArgumentException("webhook config requires a 'webhookId' option");
        }
        if (!WebhookIds.isValidId(webhookId)) {
            throw new IllegalArgumentException("webhook config 'webhookId' has an invalid format");
        }
        String signingSecret = trimmed(options.get(SIGNING_SECRET_OPTION));
        if (signingSecret == null) {
            throw new IllegalArgumentException("webhook config requires a 'signingSecret' option");
        }
        String mode = trimmed(options.get(MODE_OPTION));
        if (mode != null && !MODE_CONSUME.equals(mode) && !MODE_SNAPSHOT.equals(mode)) {
            throw new IllegalArgumentException(
                    "webhook config 'mode' must be 'consume' or 'snapshot'");
        }
        return new WebhookConfig(webhookId, signingSecret, MODE_SNAPSHOT.equals(mode));
    }

    private static String trimmed(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    /** Never prints the signing secret, so an accidental log line cannot leak it. */
    @Override
    public String toString() {
        return "WebhookConfig[webhookId=" + webhookId + ", snapshot=" + snapshot + "]";
    }
}
