package stirling.software.proprietary.policy.webhook;

import java.util.List;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class JpaWebhookDeliveryStore implements WebhookDeliveryStore {

    private final WebhookDeliveryRepository repository;

    @Override
    public WebhookDelivery save(WebhookDelivery delivery) {
        return repository.save(WebhookDeliveryEntity.from(delivery)).toDelivery();
    }

    @Override
    public List<WebhookDelivery> forWebhook(String webhookId) {
        return repository.findByWebhookIdOrderByReceivedAtAsc(webhookId).stream()
                .map(WebhookDeliveryEntity::toDelivery)
                .toList();
    }

    @Override
    public List<WebhookDelivery> failedBefore(long failedBeforeMillis) {
        return repository.findByFailedAtBefore(failedBeforeMillis).stream()
                .map(WebhookDeliveryEntity::toDelivery)
                .toList();
    }

    @Override
    public void delete(String id) {
        if (repository.existsById(id)) {
            repository.deleteById(id);
        }
    }
}
