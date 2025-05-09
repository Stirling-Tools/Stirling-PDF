<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/service/AppUpdateAuthService.java
package stirling.software.proprietary.security.service;
========
package stirling.software.enterprise.security.service;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/service/AppUpdateAuthService.java

import java.util.Optional;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.configuration.interfaces.ShowAdminInterface;
import stirling.software.common.model.ApplicationProperties;
<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/service/AppUpdateAuthService.java
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
========
import stirling.software.enterprise.security.database.repository.UserRepository;
import stirling.software.enterprise.security.model.User;
>>>>>>>> f833293d (renaming module):enterprise/src/main/java/stirling/software/enterprise/security/service/AppUpdateAuthService.java

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
