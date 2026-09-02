package stirling.software.saas.config;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;

/**
 * Previously registered the {@code :saas} module's entities and repositories with Spring Data JPA.
 */
@ApplicationScoped
@IfBuildProfile("saas")
public class SaasJpaConfig {}
