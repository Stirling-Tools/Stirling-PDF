package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.expression.method.DefaultMethodSecurityExpressionHandler;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authorization.method.AuthorizationManagerBeforeMethodInterceptor;
import org.springframework.security.authorization.method.PreAuthorizeAuthorizationManager;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.proprietary.service.OrgOwnerService;

/**
 * Runs the real {@code @PreAuthorize} expressions: {@code /linked} is open to every admin, while
 * the rest of the controller stays with the organisation owner.
 */
class AccountLinkControllerAuthorizationTest {

    private OrgOwnerService orgOwnerService;
    private AccountLinkController secured;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        AccountLinkService service = mock(AccountLinkService.class);
        when(service.isLinked()).thenReturn(true);
        when(service.status()).thenReturn(new AccountLinkService.LinkStatus(true, "d", 1L, null));
        orgOwnerService = mock(OrgOwnerService.class);

        StaticApplicationContext context = new StaticApplicationContext();
        context.getBeanFactory().registerSingleton("orgOwnerService", orgOwnerService);
        context.refresh();
        DefaultMethodSecurityExpressionHandler expressions =
                new DefaultMethodSecurityExpressionHandler();
        expressions.setApplicationContext(context);
        PreAuthorizeAuthorizationManager manager = new PreAuthorizeAuthorizationManager();
        manager.setExpressionHandler(expressions);

        ProxyFactory factory =
                new ProxyFactory(
                        new AccountLinkController(
                                service,
                                mock(ConnectService.class),
                                mock(LocalUsageService.class),
                                mock(FreeTierUsageService.class),
                                mock(ObjectProvider.class)));
        factory.setProxyTargetClass(true);
        factory.addAdvisor(AuthorizationManagerBeforeMethodInterceptor.preAuthorize(manager));
        secured = (AccountLinkController) factory.getProxy();
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    private void signInAs(String role, boolean owner) {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                "someone", "n/a", List.of(new SimpleGrantedAuthority(role))));
        when(orgOwnerService.isCurrentUser(any())).thenReturn(owner);
    }

    @Test
    void anAdminWhoIsNotTheOwnerCanSeeWhetherTheServerIsLinked() {
        signInAs("ROLE_ADMIN", false);

        assertThat(secured.linked().getBody()).isEqualTo(Map.of("linked", true));
    }

    @Test
    void anAdminWhoIsNotTheOwnerStillCannotReadTheFullStatus() {
        signInAs("ROLE_ADMIN", false);

        assertThrows(AccessDeniedException.class, () -> secured.status());
    }

    @Test
    void theOwnerCanReadBoth() {
        signInAs("ROLE_ADMIN", true);

        assertThat(secured.linked().getBody()).isEqualTo(Map.of("linked", true));
        assertThat(secured.status().getBody().linked()).isTrue();
    }

    @Test
    void aUserWhoIsNotAnAdminCannotAskEither() {
        signInAs("ROLE_USER", false);

        assertThrows(AccessDeniedException.class, () -> secured.linked());
        assertThrows(AccessDeniedException.class, () -> secured.status());
    }
}
