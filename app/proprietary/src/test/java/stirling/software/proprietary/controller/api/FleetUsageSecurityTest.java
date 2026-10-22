package stirling.software.proprietary.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;
import stirling.software.proprietary.security.config.EnterpriseEndpointAspect;
import stirling.software.proprietary.security.database.repository.UserRepository;

class FleetUsageSecurityTest {

    private AnnotationConfigApplicationContext context;
    private UserRepository users;
    private PersistentAuditEventRepository events;
    private FleetUsageController controller;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        events = mock(PersistentAuditEventRepository.class);
        context = new AnnotationConfigApplicationContext();
        context.register(SecurityConfig.class);
        context.registerBean(UserRepository.class, () -> users);
        context.registerBean(PersistentAuditEventRepository.class, () -> events);
        context.registerBean(
                AuditConfigurationProperties.class, () -> mock(AuditConfigurationProperties.class));
        context.registerBean(
                EnterpriseEndpointAspect.class, () -> new EnterpriseEndpointAspect(false));
        context.registerBean(FleetUsageController.class);
        context.refresh();
        controller = context.getBean(FleetUsageController.class);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        context.close();
    }

    @Test
    void adminCanReadWithoutEnterpriseLicense() {
        authenticate("ROLE_ADMIN");
        when(users.countByUsernameNot(Role.INTERNAL_API_USER.getRoleId())).thenReturn(3L);

        assertThat(controller.fleetStats().editorsDeployed()).isEqualTo(3L);
    }

    @Test
    void nonAdminCannotReadInstanceStatistics() {
        authenticate("ROLE_USER");

        assertThatThrownBy(() -> controller.fleetStats()).isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(users, events);
    }

    @Test
    void signedOutCannotReadInstanceStatistics() {
        assertThatThrownBy(() -> controller.fleetStats())
                .isInstanceOf(AuthenticationCredentialsNotFoundException.class);
        verifyNoInteractions(users, events);
    }

    private void authenticate(String role) {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                "user", null, AuthorityUtils.createAuthorityList(role)));
    }

    @Configuration
    @EnableAspectJAutoProxy
    @EnableMethodSecurity
    static class SecurityConfig {}
}
