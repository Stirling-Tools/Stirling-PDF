package stirling.software.proprietary.policy.webhook;

import java.util.Map;

/**
 * Config for a webhook input source, parsed from a spec's options map. A webhook is a push source:
 * external systems POST documents to a signed URL keyed by {@code webhookId}, and each delivery is
 * verified against {@code signingSecret} before it is staged for the referencing policies. Both
 * {@code webhookId} (the public URL token) and {@code signingSecret} (the HMAC key) are generated
 * server-side on create - a client never supplies them.
 *
 * <p>Where deliveries are staged depends on {@code connectionId}: absent, they go to a node-local
 * spool directory (self-hosted); present, they go to the S3 {@code IntegrationConfig} connection it
 * references, under a reserved per-webhook prefix, so the staging is durable and reachable from any
 * node (the model hosted/SaaS needs). Either way {@code mode} is "consume" (default: a staged
 * document is removed once every policy that claimed it has settled successfully) or "snapshot"
 * (stateless, every run re-reads whatever is currently staged).
 */
public record WebhookConfig(
        String webhookId, String signingSecret, Long connectionId, boolean snapshot) {

    public static final String WEBHOOK_ID_OPTION = "webhookId";
    public static final String SIGNING_SECRET_OPTION = "signingSecret";
    public static final String CONNECTION_ID_OPTION = "connectionId";
    private static final String MODE_OPTION = "mode";
    private static final String MODE_CONSUME = "consume";
    private static final String MODE_SNAPSHOT = "snapshot";

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
        String mode = trimmed(options.get(MODE_OPTION));
        if (mode != null && !MODE_CONSUME.equals(mode) && !MODE_SNAPSHOT.equals(mode)) {
            throw new IllegalArgumentException(
                    "webhook config 'mode' must be 'consume' or 'snapshot'");
        }
        return new WebhookConfig(
                webhookId, signingSecret, connectionId(options), MODE_SNAPSHOT.equals(mode));
    }

    /** Whether deliveries are staged to a durable S3 connection rather than the local spool. */
    public boolean usesConnection() {
        return connectionId != null;
    }

    /**
     * The reserved key prefix this webhook's deliveries are staged under inside its connection's
     * bucket. Server-derived from the (unguessable) id, so two webhooks sharing a connection never
     * collide and an S3 source pointed at the same bucket won't see another webhook's inbox.
     */
    public String stagingPrefix() {
        return STAGING_ROOT + "/" + webhookId;
    }

    /** The mode string as the S3 source expects it. */
    public String mode() {
        return snapshot ? MODE_SNAPSHOT : MODE_CONSUME;
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
        return "WebhookConfig[webhookId="
                + webhookId
                + ", connectionId="
                + connectionId
                + ", snapshot="
                + snapshot
                + "]";
    }
}
