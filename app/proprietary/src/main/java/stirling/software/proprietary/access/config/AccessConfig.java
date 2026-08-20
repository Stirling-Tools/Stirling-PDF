package stirling.software.proprietary.access.config;

import io.quarkus.arc.DefaultBean;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;

import stirling.software.proprietary.access.service.DefaultPrincipalResolver;
import stirling.software.proprietary.access.service.DefaultTeamLeadLookup;
import stirling.software.proprietary.access.service.PrincipalResolver;
import stirling.software.proprietary.access.service.TeamLeadLookup;

/** Access-layer bean wiring. */
@ApplicationScoped
public class AccessConfig {

    /** No-op {@link TeamLeadLookup} unless another bean is defined. */
    @Produces
    @DefaultBean
    @ApplicationScoped
    public TeamLeadLookup defaultTeamLeadLookup() {
        return new DefaultTeamLeadLookup();
    }

    /** USER/TEAM projection unless another bean is defined (e.g. the saas resolver). */
    @Produces
    @DefaultBean
    @ApplicationScoped
    public PrincipalResolver defaultPrincipalResolver() {
        return new DefaultPrincipalResolver();
    }
}
