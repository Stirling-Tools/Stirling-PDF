package stirling.software.saas.billing.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;

import stirling.software.saas.billing.repository.BillingSubscriptionRepository;

@DataJpaTest(
        properties = {
            "spring.jpa.properties.hibernate.default_schema=stirling_pdf",
            "spring.jpa.properties.hibernate.hbm2ddl.schema_filter_provider=org.hibernate.tool.schema.internal.DefaultSchemaFilterProvider",
            "spring.jpa.show-sql=false"
        })
class BillingSubscriptionSchemaTest {
    @Autowired BillingSubscriptionRepository subscriptions;
    @Autowired JdbcTemplate jdbc;

    @Test
    void readsStripeMirrorFromPublicDespiteApplicationDefaultSchema() {
        UUID userId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO public.billing_subscriptions (id, user_id, status, created_at, updated_at) VALUES (?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                "sub_preview",
                userId);

        assertThat(subscriptions.existsActivePaidSubscriptionForUser(userId)).isTrue();
        assertThat(subscriptions.findLatestActiveSubscription(userId))
                .get()
                .extracting(BillingSubscription::getId)
                .isEqualTo("sub_preview");
    }

    @SpringBootConfiguration
    @EntityScan(basePackageClasses = BillingSubscription.class)
    @EnableJpaRepositories(basePackageClasses = BillingSubscriptionRepository.class)
    static class Config {}
}
