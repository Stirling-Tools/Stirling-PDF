package stirling.software.proprietary.access.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.proprietary.access.service.ResourceAccessService;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

@ExtendWith(MockitoExtension.class)
class ResourceAccessSecurityTest {

    @Mock private ResourceAccessService accessService;
    @Mock private UserService userService;

    @InjectMocks private ResourceAccessSecurity security;

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void userPrincipalDelegatesToPortalCheck() {
        User user = new User();
        user.setId(5L);
        authenticate(user);
        when(accessService.canAccessPortal(user)).thenReturn(true);

        assertThat(security.canUsePortal()).isTrue();
    }

    @Test
    void deniedWithoutAuthentication() {
        assertThat(security.canUsePortal()).isFalse();
    }

    @Test
    void nonUserPrincipalWithoutBackingRowIsDenied() {
        // Mirrors an anonymous SaaS session: principal is not a User and resolves to nothing.
        authenticate("anonymousUser");

        assertThat(security.canUsePortal()).isFalse();
    }

    private void authenticate(Object principal) {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                principal, null, java.util.List.of()));
    }
}
