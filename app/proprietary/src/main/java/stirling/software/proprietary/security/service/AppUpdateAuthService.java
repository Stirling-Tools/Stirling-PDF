package stirling.software.proprietary.security.service;

import java.util.Optional;

import io.quarkus.security.identity.SecurityIdentity;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.common.configuration.interfaces.ShowAdminInterface;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

@ApplicationScoped
@RequiredArgsConstructor
class AppUpdateAuthService implements ShowAdminInterface {

    private final UserRepository userRepository;

    private final ApplicationProperties applicationProperties;

    private final SecurityIdentity securityIdentity;

    @Override
    public boolean getShowUpdateOnlyAdmins() {
        boolean showUpdate = applicationProperties.getSystem().isShowUpdate();
        if (!showUpdate) {
            return showUpdate;
        }
        boolean showUpdateOnlyAdmin = applicationProperties.getSystem().isShowUpdateOnlyAdmin();
        if (securityIdentity == null || securityIdentity.isAnonymous()) {
            return !showUpdateOnlyAdmin;
        }
        String name =
                securityIdentity.getPrincipal() != null
                        ? securityIdentity.getPrincipal().getName()
                        : null;
        if (name == null || "anonymousUser".equalsIgnoreCase(name)) {
            return !showUpdateOnlyAdmin;
        }
        Optional<User> user = userRepository.findByUsername(name);
        if (user.isPresent() && showUpdateOnlyAdmin) {
            return "ROLE_ADMIN".equals(user.get().getRolesAsString());
        }
        return showUpdate;
    }
}
