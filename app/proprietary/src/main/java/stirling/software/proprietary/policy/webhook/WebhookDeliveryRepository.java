package stirling.software.proprietary.policy.webhook;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface WebhookDeliveryRepository extends JpaRepository<WebhookDeliveryEntity, String> {

    List<WebhookDeliveryEntity> findByWebhookIdOrderByReceivedAtAsc(String webhookId);

    List<WebhookDeliveryEntity> findByFailedAtBefore(long failedBeforeMillis);
}
