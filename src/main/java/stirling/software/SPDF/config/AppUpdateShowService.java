package stirling.software.SPDF.config;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.repository.UserRepository;

@Configuration
public class AppUpdateShowService {

    @Autowired private UserRepository userRepository;
    @Autowired private ApplicationProperties applicationProperties;

    @Bean
    public AppUpdateService showUpdate() {
        return new AppUpdateService(userRepository, applicationProperties);
    }
}

class AppUpdateService {

    private UserRepository userRepository;
    private ApplicationProperties applicationProperties;

    private static final Logger logger = LoggerFactory.getLogger(AppUpdateShowService.class);

    public AppUpdateService(
            UserRepository userRepository, ApplicationProperties applicationProperties) {
        this.userRepository = userRepository;
        this.applicationProperties = applicationProperties;
    }

    public boolean isShow() {
        boolean showUpdate = applicationProperties.getSystem().getShowUpdate();
        boolean showUpdateOnlyAdmin = applicationProperties.getSystem().getShowUpdateOnlyAdmin();
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated()) {
            return showUpdate && !showUpdateOnlyAdmin;
        }

        if (authentication.getName().equalsIgnoreCase("anonymousUser")) {
            return showUpdate && !showUpdateOnlyAdmin;
        }

        Optional<User> user = userRepository.findByUsername(authentication.getName());
        if (user.isPresent() && showUpdateOnlyAdmin) {
            return "ROLE_ADMIN".equals(user.get().getRolesAsString()) && showUpdate;
        }

        return showUpdate;
    }
}
