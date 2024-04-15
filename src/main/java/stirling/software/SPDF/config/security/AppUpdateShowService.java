package stirling.software.SPDF.config.security;

import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.repository.UserRepository;

@Service
public class AppUpdateShowService {

    @Autowired private ApplicationProperties applicationProperties;
    @Autowired private UserRepository userRepository;

    public boolean showUpdate() {
        boolean showUpdate = applicationProperties.getSystem().getShowUpdate();
        boolean showUpdateOnlyAdmin = showUpdateOnlyAdmin();

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            if (showUpdate && !showUpdateOnlyAdmin) {
                return showUpdate;
            }
            return false;
        }

        String currentUsername = authentication.getName();
        Optional<User> user = userRepository.findByUsername(currentUsername);
        if (showUpdateOnlyAdmin) {
            if (user.get().getRolesAsString().equals("ROLE_ADMIN")) {
                return showUpdate;
            }
            return false;
        }
        return showUpdate;
    }

    private boolean showUpdateOnlyAdmin() {
        return applicationProperties.getSystem().getShowUpdateOnlyAdmin();
    }
}
