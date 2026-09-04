package stirling.software.saas.payg.charge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.proprietary.billing.DocumentUnitCalculator.FileSize;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;
import stirling.software.saas.payg.policy.PricingPolicy;
import stirling.software.saas.payg.policy.PricingPolicyService;

class SaasAutomationRunBillerTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final PricingPolicyService pricingPolicyService = mock(PricingPolicyService.class);
    private final JobChargeService jobChargeService = mock(JobChargeService.class);
    private final SaasAutomationRunBiller biller =
            new SaasAutomationRunBiller(userRepository, pricingPolicyService, jobChargeService);

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    private static User userWithTeam(long userId, long teamId) {
        Team team = mock(Team.class);
        when(team.getId()).thenReturn(teamId);
        User user = mock(User.class);
        when(user.getId()).thenReturn(userId);
        when(user.getTeam()).thenReturn(team);
        return user;
    }

    private static PricingPolicy policy() {
        PricingPolicy policy = mock(PricingPolicy.class);
        when(policy.getDocPagesPerUnit()).thenReturn(10);
        when(policy.getDocBytesPerUnit()).thenReturn(1_000_000L);
        when(policy.getMinChargeUnits()).thenReturn(1);
        when(policy.getFileUnitCap()).thenReturn(1000);
        return policy;
    }

    private static void authenticateAs(Authentication auth, User principal) {
        when(auth.getPrincipal()).thenReturn(principal);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    void chargesComputedUnitsAsWebAutomation() {
        User user = userWithTeam(3L, 7L);
        authenticateAs(mock(Authentication.class), user);
        PricingPolicy policy = policy();
        when(pricingPolicyService.getEffectivePolicy(7L)).thenReturn(policy);

        // 25 pages -> ceil(25/10)=3 page units; 5000 bytes -> 1 byte unit; max = 3.
        biller.recordAutomationRun(List.of(new FileSize(25, 5000L)));

        ArgumentCaptor<ChargeContext> ctx = ArgumentCaptor.forClass(ChargeContext.class);
        verify(jobChargeService).chargeStandalone(ctx.capture(), eq(3));
        assertEquals(3L, ctx.getValue().ownerUserId());
        assertEquals(7L, ctx.getValue().ownerTeamId());
        assertEquals(JobSource.WEB, ctx.getValue().source());
        assertEquals(ProcessType.AUTOMATION, ctx.getValue().processType());
        assertEquals(BillingCategory.AUTOMATION, ctx.getValue().billingCategory());
    }

    @Test
    void apiKeyAuthChargesAsApiSource() {
        User user = userWithTeam(3L, 7L);
        authenticateAs(mock(ApiKeyAuthenticationToken.class), user);
        PricingPolicy policy = policy();
        when(pricingPolicyService.getEffectivePolicy(7L)).thenReturn(policy);

        biller.recordAutomationRun(List.of(new FileSize(1, 10L)));

        ArgumentCaptor<ChargeContext> ctx = ArgumentCaptor.forClass(ChargeContext.class);
        verify(jobChargeService).chargeStandalone(ctx.capture(), eq(1));
        assertEquals(JobSource.API, ctx.getValue().source());
    }

    @Test
    void noChargeWithoutTeam() {
        User user = mock(User.class);
        when(user.getTeam()).thenReturn(null);
        authenticateAs(mock(Authentication.class), user);

        biller.recordAutomationRun(List.of(new FileSize(1, 10L)));

        verify(jobChargeService, never())
                .chargeStandalone(
                        org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyInt());
    }

    @Test
    void noChargeForEmptyInputs() {
        biller.recordAutomationRun(List.of());

        verify(jobChargeService, never())
                .chargeStandalone(
                        org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyInt());
    }
}
