package stirling.software.saas.config;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Previously registered the {@code :saas} module's entities and repositories with Spring Data JPA.
 *
 * <p>TODO: Migration required - datasource/JPA now configured via quarkus.datasource.* /
 * quarkus.hibernate-orm.* in application.properties. Entity scanning and repository discovery are
 * automatic in Quarkus (Panache/Hibernate ORM), so the former @EnableJpaRepositories basePackages
 * (stirling.software.saas.repository, .billing.repository, .ai.repository, .payg.repository)
 * and @EntityScan packages (.model, .billing.model, .ai.model, .payg) are no longer needed.
 */
@ApplicationScoped
@IfBuildProfile("saas")
public class SaasJpaConfig {}
