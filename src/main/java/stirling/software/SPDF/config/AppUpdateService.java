package stirling.software.SPDF.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Scope;
import org.springframework.stereotype.Service;

@Service
class AppUpdateService {

    @Autowired(required = false)
    ShowAdminInterface showAdmin;

    @Bean(name = "shouldShow")
    @Scope("request")
    public boolean shouldShow() {
        return (showAdmin != null) ? showAdmin.getShowUpdateOnlyAdmins() : true;
    }
}
