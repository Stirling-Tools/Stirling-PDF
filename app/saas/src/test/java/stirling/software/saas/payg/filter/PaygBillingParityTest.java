package stirling.software.saas.payg.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.mock.web.MockMultipartHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.method.HandlerMethod;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.proprietary.accountlink.EntitlementCache;
import stirling.software.proprietary.accountlink.EntitlementState;
import stirling.software.proprietary.accountlink.GateDecision;
import stirling.software.proprietary.accountlink.InstanceEntitlement;
import stirling.software.proprietary.accountlink.InstanceEntitlementGate;
import stirling.software.proprietary.accountlink.InstanceEntitlementInterceptor;
import stirling.software.proprietary.accountlink.UsageMeterService;
import stirling.software.proprietary.billing.UnitCalcPolicy;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.payg.charge.ChargeContext;
import stirling.software.saas.payg.charge.ChargeOutcome;
import stirling.software.saas.payg.charge.JobChargeService;
import stirling.software.saas.payg.job.JobService;

/**
 * Cross-deployment billing parity. One matrix of operations is asserted against BOTH charge paths -
 * the SaaS {@link PaygChargeInterceptor} and the self-hosted {@link InstanceEntitlementInterceptor}
 * (this module can see both) - so a change that makes one over- or under-charge relative to the
 * other fails here.
 *
 * <p>The {@code expected} column is the intended charge category ({@code BYPASSED} = not charged).
 * It is deliberately one shared value today; if a deployment is ever meant to diverge, give that
 * row a per-deployment expectation here - an explicit, reviewed edit, not a silent drift.
 */
class PaygBillingParityTest {

    private enum Handler {
        TOOL,
        PLAIN
    }

    private record Op(
            String name,
            String uri,
            boolean apiKey,
            boolean automationHeader,
            Handler handler,
            String expected) {
        @Override
        public String toString() {
            return name;
        }
    }

    private static Stream<Op> operations() {
        return Stream.of(
                new Op(
                        "manual tool (jwt)",
                        "/api/v1/security/add-password",
                        false,
                        false,
                        Handler.TOOL,
                        "BYPASSED"),
                new Op(
                        "automation sub-step (tool)",
                        "/api/v1/security/add-password",
                        false,
                        true,
                        Handler.TOOL,
                        "AUTOMATION"),
                new Op(
                        "automation sub-step (plain integration step)",
                        "/api/v1/integration/external-call",
                        false,
                        true,
                        Handler.PLAIN,
                        "AUTOMATION"),
                new Op(
                        "AI tool direct call",
                        "/api/v1/ai/tools/pdf-comment-agent",
                        false,
                        false,
                        Handler.PLAIN,
                        "AI"),
                new Op(
                        "AI tool via automation",
                        "/api/v1/ai/tools/pdf-comment-agent",
                        false,
                        true,
                        Handler.PLAIN,
                        "AUTOMATION"),
                new Op(
                        "AI non-tool (orchestrate)",
                        "/api/v1/ai/orchestrate",
                        false,
                        false,
                        Handler.PLAIN,
                        "BYPASSED"),
                new Op(
                        "api-key tool call",
                        "/api/v1/security/add-password",
                        true,
                        false,
                        Handler.TOOL,
                        "API"),
                new Op(
                        "api-key non-tool call",
                        "/api/v1/general/files/some-id",
                        true,
                        false,
                        Handler.PLAIN,
                        "BYPASSED"),
                new Op(
                        "api-key AI tool call",
                        "/api/v1/ai/tools/pdf-comment-agent",
                        true,
                        false,
                        Handler.PLAIN,
                        "AI"));
    }

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("operations")
    void saasAndSelfHostedChargeIdentically(Op op) throws Exception {
        assertSaas(op);
        SecurityContextHolder.clearContext();
        assertSelfHosted(op);
    }

    @Test
    void aPolicyRunCarriesOneRunIdIntoBothDeploymentsGrouping() throws Exception {
        // A policy's sub-steps share X-Stirling-Run-Id; both deployments key their charge grouping
        // on it so the whole run is one charge, not one-per-step. The collapse itself lives in each
        // grouping engine - SaaS JobService.joinOrOpen (JobServiceTest), self-hosted
        // UsageMeterService dedup (UsageMeterServiceTest.skipsRepeatWithinWorkflowWindow); here we
        // assert the shared key reaches both.
        String runId = "run-parity";

        // SaaS: the run id flows onto the ChargeContext that JobService groups by.
        JobChargeService chargeService = mock(JobChargeService.class);
        UserRepository userRepo = mock(UserRepository.class);
        PaygChargeInterceptor saas =
                new PaygChargeInterceptor(
                        chargeService,
                        mock(JobService.class),
                        userRepo,
                        new TempFileManager(new TempFileRegistry(), new ApplicationProperties()),
                        mock(PaygOutputExtractor.class),
                        new PaygFilterProperties(),
                        new SimpleMeterRegistry());
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(
                        new ChargeOutcome(UUID.randomUUID(), 1, ChargeOutcome.Disposition.OPENED));
        User user = makeUser();
        String supabaseId = UUID.randomUUID().toString();
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(
                                supabaseId,
                                null,
                                List.of(new SimpleGrantedAuthority("ROLE_USER"))));
        when(userRepo.findBySupabaseId(UUID.fromString(supabaseId))).thenReturn(Optional.of(user));
        MockMultipartHttpServletRequest saasReq = new MockMultipartHttpServletRequest();
        saasReq.setRequestURI("/api/v1/security/add-password");
        saasReq.addFile(
                new MockMultipartFile("fileInput", "x.pdf", "application/pdf", "abc".getBytes()));
        saasReq.addHeader("X-Stirling-Automation", "true");
        saasReq.addHeader("X-Stirling-Run-Id", runId);
        saas.preHandle(saasReq, new MockHttpServletResponse(), handler(Handler.TOOL));
        SecurityContextHolder.clearContext();
        ArgumentCaptor<ChargeContext> ctx = ArgumentCaptor.forClass(ChargeContext.class);
        verify(chargeService).openProcess(ctx.capture(), anyList());
        assertThat(ctx.getValue().runId()).isEqualTo(runId);

        // Self-hosted: the run id is the meter's dedup key, so the sub-steps collapse.
        InstanceEntitlementGate gate = mock(InstanceEntitlementGate.class);
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        EntitlementCache cache = mock(EntitlementCache.class);
        UsageMeterService meter = mock(UsageMeterService.class);
        UnitCalcPolicy policy = new UnitCalcPolicy(1, 1_048_576L, 1, 1000);
        LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);
        when(cache.current()).thenReturn(Optional.of(entitled(policy, period)));
        InstanceEntitlementInterceptor selfHosted =
                new InstanceEntitlementInterceptor(
                        gate, cache, meterProviderOf(meter), mock(TempFileManager.class));
        MockMultipartHttpServletRequest shReq = new MockMultipartHttpServletRequest();
        shReq.setRequestURI("/api/v1/security/add-password");
        shReq.addFile(
                new MockMultipartFile(
                        "fileInput", "doc.bin", "application/octet-stream", "x".getBytes()));
        shReq.addHeader("X-Stirling-Automation", "true");
        shReq.addHeader("X-Stirling-Run-Id", runId);
        MockHttpServletResponse shResp = new MockHttpServletResponse();
        selfHosted.preHandle(shReq, shResp, handler(Handler.TOOL));
        selfHosted.afterCompletion(shReq, shResp, handler(Handler.TOOL), null);
        verify(meter)
                .accrue(
                        eq(period),
                        eq(stirling.software.proprietary.billing.BillingCategory.AUTOMATION),
                        anyLong(),
                        eq(runId));
    }

    private void assertSaas(Op op) throws Exception {
        JobChargeService chargeService = mock(JobChargeService.class);
        JobService jobService = mock(JobService.class);
        UserRepository userRepo = mock(UserRepository.class);
        PaygOutputExtractor outputExtractor = mock(PaygOutputExtractor.class);
        PaygFilterProperties properties = new PaygFilterProperties();
        TempFileManager tempFileManager =
                new TempFileManager(new TempFileRegistry(), new ApplicationProperties());
        PaygChargeInterceptor interceptor =
                new PaygChargeInterceptor(
                        chargeService,
                        jobService,
                        userRepo,
                        tempFileManager,
                        outputExtractor,
                        properties,
                        new SimpleMeterRegistry());

        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));

        User user = makeUser();
        if (op.apiKey()) {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new ApiKeyAuthenticationToken(
                                    user, "k", List.of(new SimpleGrantedAuthority("ROLE_API"))));
        } else {
            String supabaseId = UUID.randomUUID().toString();
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    supabaseId,
                                    null,
                                    List.of(new SimpleGrantedAuthority("ROLE_USER"))));
            when(userRepo.findBySupabaseId(UUID.fromString(supabaseId)))
                    .thenReturn(Optional.of(user));
        }

        MockMultipartHttpServletRequest req = new MockMultipartHttpServletRequest();
        req.setRequestURI(op.uri());
        req.addFile(
                new MockMultipartFile("fileInput", "x.pdf", "application/pdf", "abc".getBytes()));
        if (op.automationHeader()) {
            req.addHeader("X-Stirling-Automation", "true");
        }

        interceptor.preHandle(req, new MockHttpServletResponse(), handler(op.handler()));

        if ("BYPASSED".equals(op.expected())) {
            verify(chargeService, never()).openProcess(any(), anyList());
        } else {
            ArgumentCaptor<ChargeContext> ctx = ArgumentCaptor.forClass(ChargeContext.class);
            verify(chargeService).openProcess(ctx.capture(), anyList());
            assertThat(ctx.getValue().billingCategory().name())
                    .as("SaaS category for %s", op.name())
                    .isEqualTo(op.expected());
        }
    }

    private void assertSelfHosted(Op op) throws Exception {
        InstanceEntitlementGate gate = mock(InstanceEntitlementGate.class);
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        EntitlementCache cache = mock(EntitlementCache.class);
        UsageMeterService meter = mock(UsageMeterService.class);
        UnitCalcPolicy policy = new UnitCalcPolicy(1, 1_048_576L, 1, 1000);
        LocalDateTime period = LocalDateTime.of(2026, 6, 1, 0, 0);
        when(cache.current()).thenReturn(Optional.of(entitled(policy, period)));
        InstanceEntitlementInterceptor interceptor =
                new InstanceEntitlementInterceptor(
                        gate, cache, meterProviderOf(meter), mock(TempFileManager.class));

        if (op.apiKey()) {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new ApiKeyAuthenticationToken(
                                    new User(),
                                    "k",
                                    List.of(new SimpleGrantedAuthority("ROLE_API"))));
        }

        MockMultipartHttpServletRequest req = new MockMultipartHttpServletRequest();
        req.setRequestURI(op.uri());
        req.addFile(
                new MockMultipartFile(
                        "fileInput", "doc.bin", "application/octet-stream", "x".getBytes()));
        if (op.automationHeader()) {
            req.addHeader("X-Stirling-Automation", "true");
        }
        MockHttpServletResponse resp = new MockHttpServletResponse();
        interceptor.preHandle(req, resp, handler(op.handler()));
        interceptor.afterCompletion(req, resp, handler(op.handler()), null);

        if ("BYPASSED".equals(op.expected())) {
            verify(meter, never()).accrue(any(), any(), anyLong(), any());
        } else {
            verify(meter)
                    .accrue(
                            eq(period),
                            eq(
                                    stirling.software.proprietary.billing.BillingCategory.valueOf(
                                            op.expected())),
                            anyLong(),
                            any());
        }
    }

    private static InstanceEntitlement entitled(UnitCalcPolicy policy, LocalDateTime period) {
        return new InstanceEntitlement(
                true, 0, 0, 100L, EntitlementState.OK, policy, period, period.plusMonths(1), null);
    }

    @SuppressWarnings("unchecked")
    private static ObjectProvider<UsageMeterService> meterProviderOf(UsageMeterService meter) {
        ObjectProvider<UsageMeterService> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(meter);
        return provider;
    }

    private static HandlerMethod handler(Handler kind) {
        try {
            Method m = Fixture.class.getDeclaredMethod(kind == Handler.TOOL ? "tool" : "plain");
            return new HandlerMethod(new Fixture(), m);
        } catch (NoSuchMethodException e) {
            throw new RuntimeException(e);
        }
    }

    private static User makeUser() {
        User user = new User();
        try {
            java.lang.reflect.Field idField = User.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(user, 1L);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
        return user;
    }

    static class Fixture {
        @AutoJobPostMapping(value = "/tool", resourceWeight = 1)
        public void tool() {}

        public void plain() {}
    }
}
