package stirling.software.proprietary.policy.webhook;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WebhookDeliveryRepository extends JpaRepository<WebhookDeliveryEntity, String> {

    List<WebhookDeliveryEntity> findByWebhookIdOrderByReceivedAtAsc(String webhookId);

    @Query(
            "select d from WebhookDeliveryEntity d"
                    + " where coalesce(d.failedAt, d.receivedAt) < :idleBefore")
    List<WebhookDeliveryEntity> findIdleBefore(@Param("idleBefore") long idleBeforeMillis);
}
