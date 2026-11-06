package stirling.software.proprietary.policy.webhook;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/** Runs the idle-delivery query against H2. */
@DataJpaTest
class JpaWebhookDeliveryStoreTest {

    @Autowired private WebhookDeliveryRepository repository;

    private static WebhookDelivery delivery(String id, long receivedAt, Long failedAt) {
        return new WebhookDelivery(
                id, "hook", "key-" + id, id + ".pdf", null, 3, receivedAt, failedAt);
    }

    @Test
    void idleBeforeMeasuresFromTheLatestFailureElseArrival() {
        JpaWebhookDeliveryStore store = new JpaWebhookDeliveryStore(repository);
        store.save(delivery("oldpending", 100, null));
        store.save(delivery("newpending", 900, null));
        store.save(delivery("oldfailure", 100, 200L));
        store.save(delivery("newfailure", 100, 800L));

        assertThat(store.idleBefore(500))
                .extracting(WebhookDelivery::id)
                .containsExactlyInAnyOrder("oldpending", "oldfailure");
    }

    @SpringBootConfiguration
    @EntityScan(basePackageClasses = WebhookDeliveryEntity.class)
    @EnableJpaRepositories(basePackageClasses = WebhookDeliveryRepository.class)
    static class TestApp {}
}
