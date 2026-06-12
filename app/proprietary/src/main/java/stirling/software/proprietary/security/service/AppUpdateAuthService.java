package stirling.software.proprietary.security.service;

import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;

import io.quarkus.security.identity.SecurityIdentity;

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

    // TODO: Migration required - SecurityIdentity is request-scoped; injecting it into an
    // @ApplicationScoped bean relies on Quarkus' client proxy resolving the current request's
    // identity. Verify this resolves correctly when invoked outside an active HTTP request
    // (e.g. scheduled/background contexts), where the identity may be anonymous/null.
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
        String name = securityIdentity.getPrincipal() != null
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
