package stirling.software.saas.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * Guards against the {@link SaasJpaConfig} scan path drifting out of sync with where entities and
 * repositories actually live. Catches the failure mode where a new {@code payg.*} (or future {@code
 * billing.*}, etc.) package is added but never wired into the JPA scan — symptom is
 * {@code @Autowired Foo} failing at startup with "No qualifying bean of type Foo" or a
 * {@code @Query} failing with "Not a managed type" — neither of which a Mockito unit test would
 * catch.
 *
 * <p>Reflection-based rather than a {@code @DataJpaTest} smoke boot because the production schema
 * relies on PostgreSQL-specific features (partial unique indexes, JSONB casts) that H2 doesn't
 * fully support, and standing up Testcontainers PostgreSQL for a single guard test is
 * disproportionate. Real-DB smoke coverage lands when {@code @SpringBootTest} integration tests
 * arrive for the PAYG services.
 */
class SaasJpaConfigScanTest {

    private static final List<String> EXPECTED_REPO_PACKAGES =
            List.of(
                    "stirling.software.saas.repository",
                    "stirling.software.saas.billing.repository",
                    "stirling.software.saas.ai.repository",
                    "stirling.software.saas.payg.repository");

    private static final List<String> EXPECTED_ENTITY_PACKAGES =
            List.of(
                    "stirling.software.saas.model",
                    "stirling.software.saas.billing.model",
                    "stirling.software.saas.ai.model",
                    // Single root package covering payg.policy / payg.job / payg.wallet /
                    // payg.entitlement / payg.shadow — Spring scans recursively.
                    "stirling.software.saas.payg");

    @Test
    void enableJpaRepositoriesIncludesAllExpectedPackages() {
        EnableJpaRepositories annotation =
                SaasJpaConfig.class.getAnnotation(EnableJpaRepositories.class);
        assertThat(annotation).as("SaasJpaConfig must carry @EnableJpaRepositories").isNotNull();

        Set<String> actual = Set.copyOf(Arrays.asList(annotation.basePackages()));
        assertThat(actual)
                .as("Every package holding @Repository interfaces must be listed")
                .containsAll(EXPECTED_REPO_PACKAGES);
    }

    @Test
    void entityScanIncludesAllExpectedPackages() {
        EntityScan annotation = SaasJpaConfig.class.getAnnotation(EntityScan.class);
        assertThat(annotation).as("SaasJpaConfig must carry @EntityScan").isNotNull();

        Set<String> actual = Set.copyOf(Arrays.asList(annotation.value()));
        assertThat(actual)
                .as("Every package holding @Entity classes must be listed")
                .containsAll(EXPECTED_ENTITY_PACKAGES);
    }
}
