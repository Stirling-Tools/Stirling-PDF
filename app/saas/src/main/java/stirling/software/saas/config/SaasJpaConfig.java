package stirling.software.saas.config;

import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/** Registers the {@code :saas} module's entities and repositories with Spring Data JPA. */
@Configuration
@Profile("saas")
@EnableJpaRepositories(
        basePackages = {
            "stirling.software.saas.repository",
            "stirling.software.saas.billing.repository",
            "stirling.software.saas.ai.repository"
        })
@EntityScan({
    "stirling.software.saas.model",
    "stirling.software.saas.billing.model",
    "stirling.software.saas.ai.model"
})
public class SaasJpaConfig {}
