package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.MapPropertySource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.service.OrgOwnerService;

/** Invokes the Spring security proxy, so role checks cannot be bypassed by a direct unit call. */
class AccountLinkAuthorizationTest {
    private AnnotationConfigApplicationContext context;
    private AccountLinkController controller;
    private AccountLinkService service;
    private ConnectService connectService;
    private OrgOwnerService ownerService;

    @Configuration(proxyBeanMethods = false)
    @EnableMethodSecurity
    static class SecurityConfig {}

    @BeforeEach
    void setUp() {
        service = mock(AccountLinkService.class);
        connectService = mock(ConnectService.class);
        context = new AnnotationConfigApplicationContext();
        context.getEnvironment().setActiveProfiles("test");
        context.getEnvironment()
                .getPropertySources()
                .addFirst(
                        new MapPropertySource(
                                "accountLinkTest",
                                Map.of("stirling.billing.account-link.enabled", "true")));
        context.register(SecurityConfig.class);
        ownerService = mock(OrgOwnerService.class);
        context.registerBean("orgOwnerService", OrgOwnerService.class, () -> ownerService);
        context.registerBean(
                AccountLinkController.class,
                () ->
                        new AccountLinkController(
                                service,
                                connectService,
                                mock(LocalUsageService.class),
                                mock(FreeTierUsageService.class),
                                context.getBeanProvider(UsageSyncService.class)));
        context.refresh();
        controller = context.getBean(AccountLinkController.class);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        context.close();
    }

    @Test
    void ownerCanStartRenewalCompleteAndUnlink() throws Exception {
        authenticate(Role.ADMIN);
        when(ownerService.isCurrentUser(any())).thenReturn(true);
        controller.connectStart(null, new MockHttpServletRequest());
        controller.connectReauth(null, new MockHttpServletRequest());
        when(connectService.complete("nonce"))
                .thenReturn(ConnectService.ConnectStatus.of(ConnectService.Phase.LINKED));
        controller.connectComplete(new AccountLinkController.ConnectCompleteRequest("nonce"));
        controller.unlink();
        controller.recheck();
        verify(service).recheck();
        verify(connectService).start(any(), any());
        verify(connectService).startReauth(any());
        verify(connectService).complete("nonce");
        verify(service).unlink();
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, mode = EnumSource.Mode.EXCLUDE, names = "ADMIN")
    void nonAdminRolesAreDeniedEvenIfMarkedAsOwner(Role role) {
        authenticate(role);
        when(ownerService.isCurrentUser(any())).thenReturn(true);
        assertDenied();
    }

    @Test
    void adminWhoDoesNotOwnTheOrganizationIsDenied() {
        authenticate(Role.ADMIN);
        assertDenied();
    }

    @Test
    void formerOwnerIsDeniedImmediatelyAfterOwnershipChanges() throws Exception {
        authenticate(Role.ADMIN);
        when(ownerService.isCurrentUser(any())).thenReturn(true);
        controller.connectReauth(null, new MockHttpServletRequest());
        verify(connectService).startReauth(any());
        clearInvocations(connectService);
        when(ownerService.isCurrentUser(any())).thenReturn(false);
        assertDenied();
    }

    @Test
    void anonymousRequestsAreDenied() {
        SecurityContextHolder.clearContext();
        assertDenied();
    }

    private void assertDenied() {
        assertThatThrownBy(() -> controller.connectStart(null, new MockHttpServletRequest()))
                .isInstanceOfAny(
                        AccessDeniedException.class,
                        AuthenticationCredentialsNotFoundException.class);
        assertThatThrownBy(() -> controller.connectReauth(null, new MockHttpServletRequest()))
                .isInstanceOfAny(
                        AccessDeniedException.class,
                        AuthenticationCredentialsNotFoundException.class);
        assertThatThrownBy(
                        () ->
                                controller.connectComplete(
                                        new AccountLinkController.ConnectCompleteRequest("nonce")))
                .isInstanceOfAny(
                        AccessDeniedException.class,
                        AuthenticationCredentialsNotFoundException.class);
        assertThatThrownBy(() -> controller.unlink())
                .isInstanceOfAny(
                        AccessDeniedException.class,
                        AuthenticationCredentialsNotFoundException.class);
        assertThatThrownBy(() -> controller.recheck())
                .isInstanceOfAny(
                        AccessDeniedException.class,
                        AuthenticationCredentialsNotFoundException.class);
        assertThatThrownBy(() -> controller.status())
                .isInstanceOfAny(
                        AccessDeniedException.class,
                        AuthenticationCredentialsNotFoundException.class);
        assertThatThrownBy(() -> controller.usage())
                .isInstanceOfAny(
                        AccessDeniedException.class,
                        AuthenticationCredentialsNotFoundException.class);
        assertThatThrownBy(() -> controller.freeTier())
                .isInstanceOfAny(
                        AccessDeniedException.class,
                        AuthenticationCredentialsNotFoundException.class);
        assertThatThrownBy(() -> controller.syncNow())
                .isInstanceOfAny(
                        AccessDeniedException.class,
                        AuthenticationCredentialsNotFoundException.class);
        verifyNoInteractions(service, connectService);
    }

    private void authenticate(Role role) {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                "local-user",
                                "unused",
                                List.of(new SimpleGrantedAuthority(role.getRoleId()))));
    }
}
