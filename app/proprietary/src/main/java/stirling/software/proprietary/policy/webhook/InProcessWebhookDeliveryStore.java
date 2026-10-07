package stirling.software.proprietary.policy.webhook;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** In-memory {@link WebhookDeliveryStore} for tests and DB-less wiring. */
public class InProcessWebhookDeliveryStore implements WebhookDeliveryStore {

    private final Map<String, WebhookDelivery> rows = new ConcurrentHashMap<>();

    @Override
    public WebhookDelivery save(WebhookDelivery delivery) {
        rows.put(delivery.id(), delivery);
        return delivery;
    }

    @Override
    public List<WebhookDelivery> forWebhook(String webhookId) {
        return rows.values().stream()
                .filter(row -> row.webhookId().equals(webhookId))
                .sorted(Comparator.comparingLong(WebhookDelivery::receivedAt))
                .toList();
    }

    @Override
    public List<WebhookDelivery> failedBefore(long failedBeforeMillis) {
        return rows.values().stream()
                .filter(row -> row.failedAt() != null && row.failedAt() < failedBeforeMillis)
                .toList();
    }

    @Override
    public void delete(String id) {
        rows.remove(id);
    }

    public int size() {
        return rows.size();
    }
}
