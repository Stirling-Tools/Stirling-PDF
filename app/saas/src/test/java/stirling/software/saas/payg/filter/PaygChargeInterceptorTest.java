package stirling.software.saas.payg.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.mock.web.MockMultipartHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.method.HandlerMethod;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.payg.charge.ChargeOutcome;
import stirling.software.saas.payg.charge.JobChargeService;
import stirling.software.saas.payg.job.JobService;
import stirling.software.saas.payg.model.JobStepStatus;

/**
 * Pure-Mockito tests for {@link PaygChargeInterceptor}. Real {@link TempFileManager} but mocked
 * downstream charge/job services so the test runs without a Spring context.
 */
class PaygChargeInterceptorTest {

    private JobChargeService chargeService;
    private JobService jobService;
    private UserRepository userRepository;
    private PaygOutputExtractor outputExtractor;
    private PaygFilterProperties properties;
    private MeterRegistry meterRegistry;
    private TempFileManager tempFileManager;
    private PaygChargeInterceptor interceptor;

    @BeforeEach
    void setUp() {
        chargeService = org.mockito.Mockito.mock(JobChargeService.class);
        jobService = org.mockito.Mockito.mock(JobService.class);
        userRepository = org.mockito.Mockito.mock(UserRepository.class);
        outputExtractor = org.mockito.Mockito.mock(PaygOutputExtractor.class);
        properties = new PaygFilterProperties();
        meterRegistry = new SimpleMeterRegistry();
        tempFileManager = new TempFileManager(new TempFileRegistry(), new ApplicationProperties());
        interceptor =
                new PaygChargeInterceptor(
                        chargeService,
                        jobService,
                        userRepository,
                        tempFileManager,
                        outputExtractor,
                        properties,
                        meterRegistry);
        SecurityContextHolder.clearContext();
    }

    @Test
    void preHandle_filterDisabled_isShortCircuitNoop() throws Exception {
        properties.setEnabled(false);
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean cont = interceptor.preHandle(req, res, handlerMethodForFakeController());

        assertThat(cont).isTrue();
        verifyNoInteractions(chargeService);
    }

    @Test
    void preHandle_handlerNotAnnotated_isShortCircuitNoop() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        boolean cont = interceptor.preHandle(req, res, handlerMethodForPlain());

        assertThat(cont).isTrue();
        verifyNoInteractions(chargeService);
    }

    @Test
    void preHandle_noAuth_isShortCircuitNoop() throws Exception {
        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "hi".getBytes()));

        boolean cont =
                interceptor.preHandle(
                        req, new MockHttpServletResponse(), handlerMethodForFakeController());

        assertThat(cont).isTrue();
        verifyNoInteractions(chargeService);
    }

    @Test
    void preHandle_noMultipartParts_isShortCircuitNoop() throws Exception {
        // Authenticated but no file parts.
        authenticateWithUser(makeUser(1L, null));
        MockHttpServletRequest req = new MockHttpServletRequest();

        boolean cont =
                interceptor.preHandle(
                        req, new MockHttpServletResponse(), handlerMethodForFakeController());

        assertThat(cont).isTrue();
        verifyNoInteractions(chargeService);
    }

    @Test
    void preHandle_openedDisposition_stashesJobIdAndDisposition() throws Exception {
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 4, ChargeOutcome.Disposition.OPENED));

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));

        boolean cont =
                interceptor.preHandle(
                        req, new MockHttpServletResponse(), handlerMethodForFakeController());

        assertThat(cont).isTrue();
        assertThat(req.getAttribute(PaygChargeInterceptor.ATTR_JOB_ID)).isEqualTo(jobId);
        assertThat(req.getAttribute(PaygChargeInterceptor.ATTR_DISPOSITION))
                .isEqualTo(ChargeOutcome.Disposition.OPENED);
        assertThat(req.getAttribute(PaygChargeInterceptor.ATTR_INPUT_TEMP_FILES)).isNotNull();
        assertThat(meterRegistry.counter("payg.filter.calls", "disposition", "OPENED").count())
                .isEqualTo(1.0);
    }

    @Test
    void preHandle_chargeServiceThrows_failsOpenAndIncrementsErrorCounter() throws Exception {
        authenticateWithUser(makeUser(7L, 42L));
        when(chargeService.openProcess(any(), anyList())).thenThrow(new RuntimeException("boom"));

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));

        boolean cont =
                interceptor.preHandle(
                        req, new MockHttpServletResponse(), handlerMethodForFakeController());

        assertThat(cont).isTrue(); // fail-open
        assertThat(req.getAttribute(PaygChargeInterceptor.ATTR_FAILED)).isEqualTo(Boolean.TRUE);
        assertThat(meterRegistry.counter("payg.filter.errors").count()).isEqualTo(1.0);
    }

    @Test
    void afterCompletion_2xx_appendsStepAndRecordsOutputs() throws Exception {
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));
        MockHttpServletResponse res = new MockHttpServletResponse();
        res.setStatus(200);
        res.setContentType("application/pdf");

        // Install a wrapper as the filter would. Pre-populate it with some bytes so
        // materialisedPath returns non-null.
        PaygResponseBodyWrapper wrapper = new PaygResponseBodyWrapper(res, tempFileManager, 1024);
        wrapper.getOutputStream().write("body".getBytes(StandardCharsets.UTF_8));
        req.setAttribute(PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE, wrapper);

        interceptor.preHandle(req, res, handlerMethodForFakeController());

        when(outputExtractor.extract(eq("application/pdf"), any()))
                .thenReturn(
                        List.of(
                                new PaygOutputExtractor.ExtractedPdf(
                                        wrapper.materialisedPath(), null)));

        interceptor.afterCompletion(req, res, handlerMethodForFakeController(), null);

        ArgumentCaptor<JobStepStatus> status = ArgumentCaptor.forClass(JobStepStatus.class);
        verify(jobService).appendStep(eq(jobId), any(), status.capture(), any(), any(), any());
        assertThat(status.getValue()).isEqualTo(JobStepStatus.OK);
        verify(jobService).recordOutput(eq(jobId), any());
        verify(chargeService, never()).markFirstStepFailed(any(), any());
        verify(chargeService, never()).decrementStepCount(any());
    }

    @Test
    void afterCompletion_5xx_opened_callsMarkFirstStepFailed() throws Exception {
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));
        MockHttpServletResponse res = new MockHttpServletResponse();
        res.setStatus(503);

        interceptor.preHandle(req, res, handlerMethodForFakeController());
        interceptor.afterCompletion(req, res, handlerMethodForFakeController(), null);

        verify(chargeService).markFirstStepFailed(eq(jobId), eq("first-step-5xx:503"));
        verify(chargeService, never()).decrementStepCount(any());
        verify(jobService, never()).recordOutput(any(), any());
        verify(jobService)
                .appendStep(eq(jobId), any(), eq(JobStepStatus.FAILED), any(), any(), eq("503"));
        assertThat(meterRegistry.counter("payg.filter.refunds").count()).isEqualTo(1.0);
    }

    @Test
    void afterCompletion_5xx_joined_callsDecrementStepCount() throws Exception {
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 0, ChargeOutcome.Disposition.JOINED));

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));
        MockHttpServletResponse res = new MockHttpServletResponse();
        res.setStatus(500);

        interceptor.preHandle(req, res, handlerMethodForFakeController());
        interceptor.afterCompletion(req, res, handlerMethodForFakeController(), null);

        verify(chargeService).decrementStepCount(jobId);
        verify(chargeService, never()).markFirstStepFailed(any(), any());
    }

    @Test
    void afterCompletion_4xx_appendsFailedStepNoRefundNoOutputs() throws Exception {
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));
        MockHttpServletResponse res = new MockHttpServletResponse();
        res.setStatus(422);

        interceptor.preHandle(req, res, handlerMethodForFakeController());
        interceptor.afterCompletion(req, res, handlerMethodForFakeController(), null);

        verify(chargeService, never()).markFirstStepFailed(any(), any());
        verify(chargeService, never()).decrementStepCount(any());
        verify(jobService, never()).recordOutput(any(), any());
        verify(jobService)
                .appendStep(eq(jobId), any(), eq(JobStepStatus.FAILED), any(), any(), eq("422"));
    }

    @Test
    void afterCompletion_preHandleFailedFlag_cleansUpWithoutCharging() throws Exception {
        MockMultipartHttpServletRequest req = newMultipart();
        req.setAttribute(PaygChargeInterceptor.ATTR_FAILED, Boolean.TRUE);
        MockHttpServletResponse res = new MockHttpServletResponse();

        interceptor.afterCompletion(req, res, handlerMethodForFakeController(), null);

        verifyNoInteractions(chargeService);
        verifyNoInteractions(jobService);
    }

    @Test
    void afterCompletion_noJobId_isNoop() throws Exception {
        MockMultipartHttpServletRequest req = newMultipart();
        MockHttpServletResponse res = new MockHttpServletResponse();
        interceptor.afterCompletion(req, res, handlerMethodForFakeController(), null);
        verifyNoInteractions(chargeService);
        verifyNoInteractions(jobService);
    }

    @Test
    void afterCompletion_maxBytesExceeded_skipsOutputRecording() throws Exception {
        properties.getResponse().setMaxBytes(2L);
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));
        MockHttpServletResponse res = new MockHttpServletResponse();
        res.setStatus(200);
        res.setContentType("application/pdf");

        PaygResponseBodyWrapper wrapper = new PaygResponseBodyWrapper(res, tempFileManager, 1024);
        wrapper.getOutputStream().write("1234567890".getBytes(StandardCharsets.UTF_8));
        req.setAttribute(PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE, wrapper);

        interceptor.preHandle(req, res, handlerMethodForFakeController());
        interceptor.afterCompletion(req, res, handlerMethodForFakeController(), null);

        verify(outputExtractor, never()).extract(any(), any());
        verify(jobService, never()).recordOutput(any(), any());
    }

    @Test
    void preHandle_desktopClientHeader_setsJobSourceDesktopApp() throws Exception {
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));
        org.mockito.ArgumentCaptor<stirling.software.saas.payg.charge.ChargeContext> ctxCaptor =
                org.mockito.ArgumentCaptor.forClass(
                        stirling.software.saas.payg.charge.ChargeContext.class);

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));
        req.addHeader("X-Stirling-Client", "desktop");

        interceptor.preHandle(req, new MockHttpServletResponse(), handlerMethodForFakeController());

        verify(chargeService).openProcess(ctxCaptor.capture(), anyList());
        assertThat(ctxCaptor.getValue().source())
                .isEqualTo(stirling.software.saas.payg.model.JobSource.DESKTOP_APP);
    }

    @Test
    void preHandle_toolId_prefersBestMatchingPattern() throws Exception {
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));

        MockMultipartHttpServletRequest req = newMultipart();
        // Raw URI contains a path variable; the matched pattern is what audit rollups want.
        req.setRequestURI("/api/v1/security/add-password/extra/segment");
        req.setAttribute(
                org.springframework.web.servlet.HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE,
                "/api/v1/security/add-password");
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));

        interceptor.preHandle(req, new MockHttpServletResponse(), handlerMethodForFakeController());

        assertThat(req.getAttribute(PaygChargeInterceptor.ATTR_TOOL_ID))
                .isEqualTo("/api/v1/security/add-password");
    }

    @Test
    void preHandle_toolId_truncatesAndCountsWhenLongerThan128() throws Exception {
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));

        MockMultipartHttpServletRequest req = newMultipart();
        String oversized = "/api/v1/" + "x".repeat(200);
        req.setRequestURI(oversized);
        // No matching pattern attribute — falls back to URI.
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));

        interceptor.preHandle(req, new MockHttpServletResponse(), handlerMethodForFakeController());

        Object stored = req.getAttribute(PaygChargeInterceptor.ATTR_TOOL_ID);
        assertThat(stored).isInstanceOf(String.class);
        assertThat(((String) stored)).hasSize(128);
        assertThat(meterRegistry.counter("payg.filter.errors").count()).isEqualTo(1.0);
    }

    @Test
    void preHandle_pipelineHeader_setsJobSourcePipeline() throws Exception {
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));
        org.mockito.ArgumentCaptor<stirling.software.saas.payg.charge.ChargeContext> ctxCaptor =
                org.mockito.ArgumentCaptor.forClass(
                        stirling.software.saas.payg.charge.ChargeContext.class);

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));
        req.addHeader("X-Stirling-Automation", "true");

        interceptor.preHandle(req, new MockHttpServletResponse(), handlerMethodForFakeController());

        verify(chargeService).openProcess(ctxCaptor.capture(), anyList());
        assertThat(ctxCaptor.getValue().source())
                .isEqualTo(stirling.software.saas.payg.model.JobSource.PIPELINE);
    }

    // --- helpers --------------------------------------------------------------------------------

    private MockMultipartHttpServletRequest newMultipart() {
        MockMultipartHttpServletRequest r = new MockMultipartHttpServletRequest();
        r.setRequestURI("/api/v1/security/test-tool");
        return r;
    }

    private void authenticateWithUser(User user) {
        UsernamePasswordAuthenticationToken token =
                new UsernamePasswordAuthenticationToken(
                        "supabase-id-here", null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
        SecurityContextHolder.getContext().setAuthentication(token);
        // resolveUser does UUID.fromString on the name, so use a real UUID string.
        String supabaseId = UUID.randomUUID().toString();
        UsernamePasswordAuthenticationToken realToken =
                new UsernamePasswordAuthenticationToken(
                        supabaseId, null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
        SecurityContextHolder.getContext().setAuthentication(realToken);
        when(userRepository.findBySupabaseId(UUID.fromString(supabaseId)))
                .thenReturn(Optional.of(user));
    }

    private static User makeUser(Long id, Long teamId) {
        User user = new User();
        try {
            // User entity doesn't expose Lombok setters for all fields. Set via reflection.
            java.lang.reflect.Field idField = User.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(user, id);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
        if (teamId != null) {
            stirling.software.proprietary.model.Team team =
                    new stirling.software.proprietary.model.Team();
            team.setId(teamId);
            user.setTeam(team);
        }
        return user;
    }

    private static HandlerMethod handlerMethodForFakeController() {
        try {
            Method m = FakeController.class.getDeclaredMethod("handleAuto");
            return new HandlerMethod(new FakeController(), m);
        } catch (NoSuchMethodException e) {
            throw new RuntimeException(e);
        }
    }

    private static HandlerMethod handlerMethodForPlain() {
        try {
            Method m = FakeController.class.getDeclaredMethod("handlePlain");
            return new HandlerMethod(new FakeController(), m);
        } catch (NoSuchMethodException e) {
            throw new RuntimeException(e);
        }
    }

    static class FakeController {
        @AutoJobPostMapping(value = "/x", resourceWeight = 1)
        public void handleAuto() {}

        public void handlePlain() {}
    }

    /** Placeholder so AutoCloseable resources flow in some helper methods. */
    @SuppressWarnings("unused")
    private static void closeQuietly(AutoCloseable c) {
        try {
            c.close();
        } catch (Exception ignored) {
            // ignored
        }
    }

    @SuppressWarnings("unused")
    private static IOException unused() {
        return null;
    }
}
