package stirling.software.SPDF.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Scope;
import org.springframework.stereotype.Service;

import stirling.software.SPDF.config.interfaces.ShowAdminInterface;
import stirling.software.SPDF.model.ApplicationProperties;

@Service
class AppUpdateService {

    private final ApplicationProperties applicationProperties;

    private final ShowAdminInterface showAdmin;

    public AppUpdateService(
            ApplicationProperties applicationProperties, ShowAdminInterface showAdmin) {
        this.applicationProperties = applicationProperties;
        this.showAdmin = showAdmin;
    }

    @Bean(name = "shouldShow")
    @Scope("request")
    public boolean shouldShow() {
        boolean showUpdate = applicationProperties.getSystem().isShowUpdate();
        boolean showAdminResult = (showAdmin != null) ? showAdmin.getShowUpdateOnlyAdmins() : true;
        return showUpdate && showAdminResult;
    }
}
