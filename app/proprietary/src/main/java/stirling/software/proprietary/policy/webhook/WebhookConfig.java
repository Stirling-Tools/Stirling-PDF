package stirling.software.proprietary.policy.webhook;

import java.util.Map;

/** Webhook source config: server-minted ids, staging via an S3 connection or the local spool. */
public record WebhookConfig(String webhookId, String signingSecret, Long connectionId) {

    public static final String WEBHOOK_ID_OPTION = "webhookId";
    public static final String SIGNING_SECRET_OPTION = "signingSecret";
    public static final String CONNECTION_ID_OPTION = "connectionId";

    /** Reserved key namespace webhook deliveries are staged under in a connection's bucket. */
    private static final String STAGING_ROOT = "stirling-webhook";

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
        return new WebhookConfig(webhookId, signingSecret, connectionId(options));
    }

    /** Whether deliveries are staged to a durable S3 connection rather than the local spool. */
    public boolean usesConnection() {
        return connectionId != null;
    }

    /** Reserved per-webhook staging prefix inside the connection's bucket. */
    public String stagingPrefix() {
        return STAGING_ROOT + "/" + webhookId;
    }

    private static Long connectionId(Map<String, Object> options) {
        Object reference = options.get(CONNECTION_ID_OPTION);
        if (reference == null || (reference instanceof String s && s.isBlank())) {
            return null;
        }
        if (reference instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.valueOf(reference.toString().trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(
                    "webhook 'connectionId' is not a valid connection reference: " + reference);
        }
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
        return "WebhookConfig[webhookId=" + webhookId + ", connectionId=" + connectionId + "]";
    }
}
