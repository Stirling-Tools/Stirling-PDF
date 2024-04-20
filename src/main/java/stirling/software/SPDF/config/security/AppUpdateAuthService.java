package stirling.software.SPDF.config.security;

import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import stirling.software.SPDF.config.ShowAdminInterface;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.repository.UserRepository;

@Service
class AppUpdateAuthService implements ShowAdminInterface {

    @Autowired private UserRepository userRepository;
    @Autowired private ApplicationProperties applicationProperties;

    public boolean getShowUpdateOnlyAdmins() {
        boolean showUpdate = applicationProperties.getSystem().getShowUpdate();
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
