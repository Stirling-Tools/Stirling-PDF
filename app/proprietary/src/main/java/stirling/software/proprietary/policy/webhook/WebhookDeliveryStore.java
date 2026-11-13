package stirling.software.proprietary.policy.webhook;

import java.util.List;

/** The index of deliveries awaiting or parked after processing; the bytes live in app storage. */
public interface WebhookDeliveryStore {

    WebhookDelivery save(WebhookDelivery delivery);

    /** Oldest first, so a sweep works through a backlog in arrival order. */
    List<WebhookDelivery> forWebhook(String webhookId);

    /**
     * Deliveries last active before the given instant: the latest failure, or arrival for one that
     * has never failed.
     */
    List<WebhookDelivery> idleBefore(long idleBeforeMillis);

    /** No-op when the row is already gone: a delivery may be discarded from two places at once. */
    void delete(String id);
}
