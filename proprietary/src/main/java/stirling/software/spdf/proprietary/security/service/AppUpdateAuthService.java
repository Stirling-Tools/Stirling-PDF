package stirling.software.spdf.proprietary.security.service;

import java.util.Optional;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import stirling.software.spdf.proprietary.security.configuration.ApplicationPropertiesConfiguration;
import stirling.software.spdf.proprietary.security.model.AdminInterface;
import stirling.software.spdf.proprietary.security.persistence.User;
import stirling.software.spdf.proprietary.security.persistence.repository.UserRepository;

@Service
class AppUpdateAuthService implements AdminInterface {

    private final UserRepository userRepository;

    private final ApplicationPropertiesConfiguration applicationProperties;

    public AppUpdateAuthService(
            UserRepository userRepository,
            ApplicationPropertiesConfiguration applicationProperties) {
        this.userRepository = userRepository;
        this.applicationProperties = applicationProperties;
    }

    @Override
    public boolean getShowUpdateOnlyAdmins() {
        boolean showUpdate = applicationProperties.getSystem().isShowUpdate();
        if (!showUpdate) {
            return showUpdate;
        }
        boolean showUpdateOnlyAdmin = applicationProperties.getSystem().getShowUpdateOnlyAdmin();
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return !showUpdateOnlyAdmin;
        }
        if (authentication.getName().equalsIgnoreCase("anonymousUser")) {
            return !showUpdateOnlyAdmin;
        }
        Optional<User> user = userRepository.findByUsername(authentication.getName());
        if (user.isPresent() && showUpdateOnlyAdmin) {
            return "ROLE_ADMIN".equals(user.get().getRolesAsString());
        }
        return showUpdate;
    }
}
