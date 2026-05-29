package stirling.software.saas.config;

import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * Registers the {@code :saas} module's entities and repositories with Spring Data JPA.
 *
 * <p>Every package holding a {@code @Repository} interface MUST appear in {@code basePackages}
 * (otherwise the repo never becomes a Spring bean and {@code @Autowired} fails at startup); every
 * package holding an {@code @Entity} class MUST appear in {@code @EntityScan} (otherwise Hibernate
 * doesn't see the entity and repo queries fail with "Not a managed type"). PAYG entities are spread
 * across {@code payg.policy} / {@code payg.job} / {@code payg.wallet} / {@code payg.entitlement} /
 * {@code payg.shadow} — {@code stirling.software.saas.payg} alone covers all of them recursively.
 */
@Configuration
@Profile("saas")
@EnableJpaRepositories(
        basePackages = {
            "stirling.software.saas.repository",
            "stirling.software.saas.billing.repository",
            "stirling.software.saas.ai.repository",
            "stirling.software.saas.payg.repository"
        })
@EntityScan({
    "stirling.software.saas.model",
    "stirling.software.saas.billing.model",
    "stirling.software.saas.ai.model",
    "stirling.software.saas.payg"
})
public class SaasJpaConfig {}
