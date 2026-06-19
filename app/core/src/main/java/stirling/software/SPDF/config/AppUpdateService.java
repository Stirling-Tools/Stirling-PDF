package stirling.software.SPDF.config;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.Dependent;
import jakarta.enterprise.inject.Instance;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Named;

import stirling.software.common.configuration.interfaces.ShowAdminInterface;
import stirling.software.common.model.ApplicationProperties;

@ApplicationScoped
class AppUpdateService {

    private final ApplicationProperties applicationProperties;

    // @Autowired(required = false) -> Instance<T> for optional injection
    private final Instance<ShowAdminInterface> showAdmin;

    public AppUpdateService(
            ApplicationProperties applicationProperties, Instance<ShowAdminInterface> showAdmin) {
        this.applicationProperties = applicationProperties;
        this.showAdmin = showAdmin;
    }

    // MIGRATION: Spring's request-scoped boolean bean -> @Dependent. A CDI normal scope
    // (@RequestScoped) requires a client proxy, which is impossible for a primitive producer
    // ("Producer method for a normal scoped bean must not have a primitive type"). @Dependent
    // recomputes the value at each injection point, the closest behaviour to per-request
    // evaluation.
    // TODO: Migration required - if true per-HTTP-request semantics are needed, wrap the value in a
    // @RequestScoped holder object instead of producing a bare boolean.
    @Produces
    @Named("shouldShow")
    @Dependent
    public boolean shouldShow() {
        boolean showUpdate = applicationProperties.getSystem().isShowUpdate();
        boolean showAdminResult =
                showAdmin.isUnsatisfied() || showAdmin.get().getShowUpdateOnlyAdmins();
        return showUpdate && showAdminResult;
    }
}
