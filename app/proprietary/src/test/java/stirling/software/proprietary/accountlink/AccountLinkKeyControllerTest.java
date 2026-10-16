package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.expression.method.DefaultMethodSecurityExpressionHandler;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authorization.method.AuthorizationManagerBeforeMethodInterceptor;
import org.springframework.security.authorization.method.PreAuthorizeAuthorizationManager;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.proprietary.accountlink.LinkKeyRedeemService.Outcome;
import stirling.software.proprietary.accountlink.LinkKeyRedeemService.Result;
import stirling.software.proprietary.billing.UnitCalcPolicy;
import stirling.software.proprietary.service.OrgOwnerService;

class AccountLinkKeyControllerTest {

    private LinkKeyRedeemService redeemer;
    private AccountLinkService accountLinkService;
    private EntitlementCache cache;
    private LocalUsageService localUsage;
    private UsageSyncService sync;
    private AccountLinkKeyController controller;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redeemer = mock(LinkKeyRedeemService.class);
        accountLinkService = mock(AccountLinkService.class);
        cache = mock(EntitlementCache.class);
        localUsage = mock(LocalUsageService.class);
        sync = mock(UsageSyncService.class);
        ObjectProvider<UsageSyncService> syncProvider = mock(ObjectProvider.class);
        when(syncProvider.getIfAvailable()).thenReturn(sync);
        controller =
                new AccountLinkKeyController(
                        redeemer, accountLinkService, cache, localUsage, syncProvider);
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void aLinkedKeyRunsTheFirstSyncAndReturnsTheNewStatus() {
        var status = new AccountLinkService.LinkStatus(true, "dev", 7L, null);
        when(redeemer.redeemAsOwner(eq("stlk_k.s"), eq(null), any()))
                .thenReturn(new Result(Outcome.LINKED, 7L));
        when(accountLinkService.status()).thenReturn(status);

        ResponseEntity<?> resp =
                controller.redeemKey(
                        new AccountLinkKeyController.RedeemKeyRequest("stlk_k.s", null));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).isEqualTo(status);
        verify(sync).syncNow();
    }

    @Test
    void eachRefusalHasItsOwnCodeSoThePageCanSayWhatToDo() {
        assertThat(outcome(Outcome.BAD_FORMAT)).isEqualTo(errorOf(400, "KEY_FORMAT"));
        assertThat(outcome(Outcome.REJECTED)).isEqualTo(errorOf(400, "KEY_REJECTED"));
        assertThat(outcome(Outcome.ALREADY_LINKED)).isEqualTo(errorOf(409, "ALREADY_LINKED"));
        assertThat(outcome(Outcome.BUSY)).isEqualTo(errorOf(409, "LINK_IN_PROGRESS"));
        assertThat(outcome(Outcome.UNAVAILABLE)).isEqualTo(errorOf(502, "CONNECT_FAILED"));
        verify(sync, never()).syncNow();
    }

    @Test
    void thePlanComesFromTheCachedEntitlementPlusUnsyncedUsage() {
        LocalDateTime start = LocalDateTime.of(2026, 10, 1, 0, 0);
        when(accountLinkService.isLinked()).thenReturn(true);
        when(cache.current())
                .thenReturn(
                        Optional.of(
                                new InstanceEntitlement(
                                        true,
                                        0,
                                        120,
                                        500L,
                                        EntitlementState.OK,
                                        (UnitCalcPolicy) null,
                                        start,
                                        start.plusMonths(1),
                                        25,
                                        0,
                                        40,
                                        null)));
        when(localUsage.currentPeriodUnsynced())
                .thenReturn(new LocalUsageService.LocalUsage(start, 3, 1, 1, 5));

        AccountLinkKeyController.CloudPlan plan = controller.plan().getBody();

        assertThat(plan.known()).isTrue();
        assertThat(plan.subscribed()).isTrue();
        assertThat(plan.periodSpendUnits()).isEqualTo(120);
        assertThat(plan.periodCapUnits()).isEqualTo(500L);
        assertThat(plan.prepaidRemainingUnits()).isEqualTo(40);
        assertThat(plan.licensedUsers()).isEqualTo(25);
        assertThat(plan.state()).isEqualTo("OK");
        assertThat(plan.unsyncedUnits()).isEqualTo(5);
    }

    @Test
    void anUnlinkedServerReportsAnUnknownPlanWithoutCallingTheCloud() {
        AccountLinkKeyController.CloudPlan plan = controller.plan().getBody();

        assertThat(plan.known()).isFalse();
        verify(cache, never()).current();
        verifyNoInteractions(localUsage);
    }

    @Test
    void anAdminWhoIsNotTheOwnerCannotLinkWithAKey() {
        OrgOwnerService owners = mock(OrgOwnerService.class);
        when(owners.isCurrentUser(any())).thenReturn(false);
        AccountLinkKeyController secured = secured(owners);
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                "admin", "n/a", List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

        assertThatThrownBy(
                        () ->
                                secured.redeemKey(
                                        new AccountLinkKeyController.RedeemKeyRequest(
                                                "stlk_k.s", null)))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(secured::plan).isInstanceOf(AccessDeniedException.class);
        verifyNoInteractions(redeemer);
    }

    private ResponseEntity<?> outcome(Outcome outcome) {
        when(redeemer.redeemAsOwner(any(), any(), any())).thenReturn(Result.of(outcome));
        return controller.redeemKey(new AccountLinkKeyController.RedeemKeyRequest("x", null));
    }

    private static ResponseEntity<Map<String, String>> errorOf(int status, String code) {
        return ResponseEntity.status(status).body(Map.of("error", code));
    }

    private AccountLinkKeyController secured(OrgOwnerService owners) {
        StaticApplicationContext context = new StaticApplicationContext();
        context.getBeanFactory().registerSingleton("orgOwnerService", owners);
        context.refresh();
        DefaultMethodSecurityExpressionHandler expressions =
                new DefaultMethodSecurityExpressionHandler();
        expressions.setApplicationContext(context);
        PreAuthorizeAuthorizationManager manager = new PreAuthorizeAuthorizationManager();
        manager.setExpressionHandler(expressions);
        ProxyFactory factory = new ProxyFactory(controller);
        factory.setProxyTargetClass(true);
        factory.addAdvisor(AuthorizationManagerBeforeMethodInterceptor.preAuthorize(manager));
        return (AccountLinkKeyController) factory.getProxy();
    }
}
