package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

class AppUpdateAuthServiceTest {

    private final UserRepository userRepository = mock(UserRepository.class);

    private AppUpdateAuthService service(boolean showUpdate, boolean onlyAdmin) {
        ApplicationProperties props = new ApplicationProperties();
        ApplicationProperties.System system = new ApplicationProperties.System();
        system.setShowUpdate(showUpdate);
        system.setShowUpdateOnlyAdmin(onlyAdmin);
        props.setSystem(system);
        return new AppUpdateAuthService(userRepository, props);
    }

    private void withAuthentication(Authentication auth, Runnable assertions) {
        try (MockedStatic<SecurityContextHolder> holder = mockStatic(SecurityContextHolder.class)) {
            SecurityContext context = mock(SecurityContext.class);
            when(context.getAuthentication()).thenReturn(auth);
            holder.when(SecurityContextHolder::getContext).thenReturn(context);
            assertions.run();
        }
    }

    private Authentication authenticatedAs(String username, String roles) {
        Authentication auth = mock(Authentication.class);
        when(auth.isAuthenticated()).thenReturn(true);
        when(auth.getName()).thenReturn(username);
        User user = mock(User.class);
        when(user.getRolesAsString()).thenReturn(roles);
        when(userRepository.findByUsername(username)).thenReturn(Optional.of(user));
        return auth;
    }

    @Test
    void hidesForEveryoneWhenShowUpdateOff() {
        withAuthentication(
                authenticatedAs("admin", "ROLE_ADMIN"),
                () -> assertFalse(service(false, true).getShowUpdateOnlyAdmins()));
    }

    @Test
    void showsToAllAuthenticatedWhenNotAdminOnly() {
        withAuthentication(
                authenticatedAs("bob", "ROLE_USER"),
                () -> assertTrue(service(true, false).getShowUpdateOnlyAdmins()));
    }

    @Test
    void hidesFromAnonymousWhenAdminOnly() {
        withAuthentication(null, () -> assertFalse(service(true, true).getShowUpdateOnlyAdmins()));
    }

    @Test
    void hidesFromAnonymousUserPrincipalWhenAdminOnly() {
        Authentication auth = mock(Authentication.class);
        when(auth.isAuthenticated()).thenReturn(true);
        when(auth.getName()).thenReturn("anonymousUser");
        withAuthentication(auth, () -> assertFalse(service(true, true).getShowUpdateOnlyAdmins()));
    }

    @Test
    void showsToAdminWhenAdminOnly() {
        withAuthentication(
                authenticatedAs("admin", "ROLE_ADMIN"),
                () -> assertTrue(service(true, true).getShowUpdateOnlyAdmins()));
    }

    @Test
    void hidesFromNonAdminWhenAdminOnly() {
        withAuthentication(
                authenticatedAs("bob", "ROLE_USER"),
                () -> assertFalse(service(true, true).getShowUpdateOnlyAdmins()));
    }
}
