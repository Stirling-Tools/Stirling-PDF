package stirling.software.SPDF.config;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.RequestScoped;
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
            ApplicationProperties applicationProperties,
            Instance<ShowAdminInterface> showAdmin) {
        this.applicationProperties = applicationProperties;
        this.showAdmin = showAdmin;
    }

    @Produces
    @Named("shouldShow")
    @RequestScoped
    public boolean shouldShow() {
        boolean showUpdate = applicationProperties.getSystem().isShowUpdate();
        boolean showAdminResult =
                showAdmin.isUnsatisfied() || showAdmin.get().getShowUpdateOnlyAdmins();
        return showUpdate && showAdminResult;
    }
}
