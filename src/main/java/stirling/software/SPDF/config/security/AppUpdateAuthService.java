package stirling.software.SPDF.config.security;

import java.util.Optional;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.interfaces.ShowAdminInterface;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.repository.UserRepository;

@Service
@RequiredArgsConstructor
class AppUpdateAuthService implements ShowAdminInterface {

    private final UserRepository userRepository;

    private final ApplicationProperties applicationProperties;

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
        if ("anonymousUser".equalsIgnoreCase(authentication.getName())) {
            return !showUpdateOnlyAdmin;
        }
        Optional<User> user = userRepository.findByUsername(authentication.getName());
        if (user.isPresent() && showUpdateOnlyAdmin) {
            return "ROLE_ADMIN".equals(user.get().getRolesAsString());
        }
        return showUpdate;
    }
}
