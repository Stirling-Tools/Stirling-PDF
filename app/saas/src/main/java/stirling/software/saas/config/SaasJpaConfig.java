package stirling.software.saas.config;

import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * Registers the {@code :saas} module's entities and repositories with Spring Data JPA. Any new
 * package holding {@code @Repository} or {@code @Entity} classes must be added here, or the beans
 * won't wire at startup.
 */
@Configuration
@Profile("saas")
@EnableJpaRepositories(
        basePackages = {
            "stirling.software.saas.accountlink",
            "stirling.software.saas.repository",
            "stirling.software.saas.billing.repository",
            "stirling.software.saas.ai.repository",
            "stirling.software.saas.payg.repository"
        })
@EntityScan({
    "stirling.software.saas.accountlink",
    "stirling.software.saas.model",
    "stirling.software.saas.billing.model",
    "stirling.software.saas.ai.model",
    "stirling.software.saas.payg"
})
public class SaasJpaConfig {}
