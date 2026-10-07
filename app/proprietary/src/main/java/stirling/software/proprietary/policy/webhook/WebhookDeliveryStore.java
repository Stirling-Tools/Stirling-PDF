package stirling.software.proprietary.policy.webhook;

import java.util.List;

/** The index of deliveries awaiting or parked after processing; the bytes live in app storage. */
public interface WebhookDeliveryStore {

    WebhookDelivery save(WebhookDelivery delivery);

    /** Oldest first, so a sweep works through a backlog in arrival order. */
    List<WebhookDelivery> forWebhook(String webhookId);

    /** Deliveries whose last failure is older than the given instant. */
    List<WebhookDelivery> failedBefore(long failedBeforeMillis);

    /** No-op when the row is already gone: a delivery may be discarded from two places at once. */
    void delete(String id);
}
