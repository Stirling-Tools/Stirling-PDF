package stirling.software.SPDF.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Scope;
import org.springframework.stereotype.Service;

import stirling.software.SPDF.model.ApplicationProperties;

@Service
class AppUpdateService {

    @Autowired private ApplicationProperties applicationProperties;

    @Autowired(required = false)
    ShowAdminInterface showAdmin;

    @Bean(name = "shouldShow")
    @Scope("request")
    public boolean shouldShow() {
        boolean showUpdate = applicationProperties.getSystem().isShowUpdate();
        boolean showAdminResult = (showAdmin != null) ? showAdmin.getShowUpdateOnlyAdmins() : true;
        return showUpdate && showAdminResult;
    }
}
