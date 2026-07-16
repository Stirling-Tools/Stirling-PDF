package stirling.software.proprietary.policy.webhook;

import java.util.Map;

public record WebhookConfig(String webhookId, String signingSecret) {

    public static final String WEBHOOK_ID_OPTION = "webhookId";
    public static final String SIGNING_SECRET_OPTION = "signingSecret";

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
        return new WebhookConfig(webhookId, signingSecret);
    }

    private static String trimmed(Object value) {
        if (value == null) {
            return null;
        }
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }

    @Override
    public String toString() {
        return "WebhookConfig[webhookId=" + webhookId + "]";
    }
}
