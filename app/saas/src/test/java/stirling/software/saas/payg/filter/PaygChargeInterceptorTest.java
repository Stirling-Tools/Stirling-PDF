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
        // API-key auth → BillingCategory.API → billable path engaged.
        authenticateWithApiKey(makeUser(7L, 42L));
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
        // API-key auth → API category → reaches openProcess so the throw can be observed.
        authenticateWithApiKey(makeUser(7L, 42L));
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
        authenticateWithApiKey(makeUser(7L, 42L));
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
        // Success on an OPENED process is the primary meter trigger — fires now, not at close.
        verify(chargeService).meterJobUsage(jobId);
    }

    @Test
    void afterCompletion_2xx_joined_doesNotMeter() throws Exception {
        // A JOINED follow-up step (chained tool on the same document) added no units when it
        // joined — it must not re-meter; the OPENED step already did.
        authenticateWithApiKey(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 0, ChargeOutcome.Disposition.JOINED));

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));
        MockHttpServletResponse res = new MockHttpServletResponse();
        res.setStatus(200);

        interceptor.preHandle(req, res, handlerMethodForFakeController());
        interceptor.afterCompletion(req, res, handlerMethodForFakeController(), null);

        verify(chargeService, never()).meterJobUsage(any());
    }

    @Test
    void afterCompletion_5xx_opened_callsMarkFirstStepFailed() throws Exception {
        authenticateWithApiKey(makeUser(7L, 42L));
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
        // First-step failure refunds — never meter it.
        verify(chargeService, never()).meterJobUsage(any());
    }

    @Test
    void afterCompletion_5xx_joined_callsDecrementStepCount() throws Exception {
        authenticateWithApiKey(makeUser(7L, 42L));
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
        authenticateWithApiKey(makeUser(7L, 42L));
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
        // 4xx is a full charge (customer paid for the attempt), so it still meters.
        verify(chargeService).meterJobUsage(jobId);
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
        authenticateWithApiKey(makeUser(7L, 42L));
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
        // API-key (billable) so the call reaches openProcess; the desktop header still wins the
        // source mapping (checked before the API-key branch in determineSource). A manual JWT call
        // is BYPASSED and never opens a process, so source wouldn't be recorded.
        authenticateWithApiKey(makeUser(7L, 42L));
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
        // API-key (billable) so doPreHandle runs and records tool_id; a manual JWT call is
        // BYPASSED before that point, so no tool_id is stored.
        authenticateWithApiKey(makeUser(7L, 42L));
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
        // API-key (billable) so doPreHandle runs and records tool_id (a manual JWT call is
        // BYPASSED).
        authenticateWithApiKey(makeUser(7L, 42L));
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
        authenticateWithApiKey(makeUser(7L, 42L));
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

    // --- BillingCategory categorisation + bypass fast-path -------------------------------------

    @Test
    void preHandle_manualToolJwt_isBypassedAndSkipsOpenProcess() throws Exception {
        // JWT-authenticated, plain @AutoJobPostMapping endpoint, no automation header → BYPASSED.
        // The interceptor must skip openProcess entirely (no temp files, no DB writes) and bump
        // the payg.filter.bypassed counter.
        authenticateWithUser(makeUser(7L, 42L));

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));

        boolean cont =
                interceptor.preHandle(
                        req, new MockHttpServletResponse(), handlerMethodForFakeController());

        assertThat(cont).isTrue();
        verify(chargeService, never()).openProcess(any(), anyList());
        assertThat(req.getAttribute(PaygChargeInterceptor.ATTR_JOB_ID)).isNull();
        assertThat(req.getAttribute(PaygChargeInterceptor.ATTR_INPUT_TEMP_FILES)).isNull();
        assertThat(meterRegistry.counter("payg.filter.bypassed").count()).isEqualTo(1.0);
    }

    @Test
    void preHandle_apiKeyAuth_setsBillingCategoryApi() throws Exception {
        authenticateWithApiKey(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));
        org.mockito.ArgumentCaptor<stirling.software.saas.payg.charge.ChargeContext> ctxCaptor =
                org.mockito.ArgumentCaptor.forClass(
                        stirling.software.saas.payg.charge.ChargeContext.class);

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));

        interceptor.preHandle(req, new MockHttpServletResponse(), handlerMethodForFakeController());

        verify(chargeService).openProcess(ctxCaptor.capture(), anyList());
        assertThat(ctxCaptor.getValue().billingCategory())
                .isEqualTo(stirling.software.saas.payg.model.BillingCategory.API);
    }

    @Test
    void preHandle_requiresFeatureAutomation_setsBillingCategoryAutomation() throws Exception {
        // JWT auth on a @RequiresFeature(AUTOMATION) endpoint → AUTOMATION category.
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));
        org.mockito.ArgumentCaptor<stirling.software.saas.payg.charge.ChargeContext> ctxCaptor =
                org.mockito.ArgumentCaptor.forClass(
                        stirling.software.saas.payg.charge.ChargeContext.class);

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));

        interceptor.preHandle(req, new MockHttpServletResponse(), handlerMethodForAutomation());

        verify(chargeService).openProcess(ctxCaptor.capture(), anyList());
        assertThat(ctxCaptor.getValue().billingCategory())
                .isEqualTo(stirling.software.saas.payg.model.BillingCategory.AUTOMATION);
    }

    @Test
    void preHandle_requiresFeatureAiSupport_setsBillingCategoryAi() throws Exception {
        // JWT auth on a @RequiresFeature(AI_SUPPORT) endpoint → AI category.
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));
        org.mockito.ArgumentCaptor<stirling.software.saas.payg.charge.ChargeContext> ctxCaptor =
                org.mockito.ArgumentCaptor.forClass(
                        stirling.software.saas.payg.charge.ChargeContext.class);

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));

        interceptor.preHandle(req, new MockHttpServletResponse(), handlerMethodForAi());

        verify(chargeService).openProcess(ctxCaptor.capture(), anyList());
        assertThat(ctxCaptor.getValue().billingCategory())
                .isEqualTo(stirling.software.saas.payg.model.BillingCategory.AI);
    }

    @Test
    void preHandle_requiresFeatureWithoutAutoJobPostMapping_reachesCategoryGate() throws Exception {
        // Regression: AI controllers carry @RequiresFeature but NO @AutoJobPostMapping. They must
        // still flow past the short-circuit gate so determineCategory runs (and so future
        // multipart-bearing @RequiresFeature routes bill correctly). API-key auth +
        // @RequiresFeature
        // — even without multipart inputs — should land in the BillingCategory.API branch via
        // determineCategory's auth check, then short-circuit inside doPreHandle because there are
        // no multipart parts.
        authenticateWithApiKey(makeUser(7L, 42L));
        MockMultipartHttpServletRequest req = newMultipart();
        // No file parts — emulates a JSON-bodied AI controller request that happens to be wrapped
        // as multipart. doPreHandle short-circuits with no openProcess call.
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", new byte[0]));

        boolean cont =
                interceptor.preHandle(
                        req, new MockHttpServletResponse(), handlerMethodForAiNoAutoJob());

        assertThat(cont).isTrue();
        verify(chargeService, never()).openProcess(any(), anyList());
        // Importantly: not counted as BYPASSED — the AI category was determined correctly.
        assertThat(meterRegistry.counter("payg.filter.bypassed").count()).isEqualTo(0.0);
    }

    @Test
    void preHandle_aiEndpointWithoutAutoJobPostMapping_categoryIsAi() throws Exception {
        // With multipart parts present + @RequiresFeature(AI_SUPPORT) but no @AutoJobPostMapping:
        // the interceptor must run determineCategory and tag the ChargeContext as AI.
        authenticateWithApiKey(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));
        org.mockito.ArgumentCaptor<stirling.software.saas.payg.charge.ChargeContext> ctxCaptor =
                org.mockito.ArgumentCaptor.forClass(
                        stirling.software.saas.payg.charge.ChargeContext.class);

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));

        interceptor.preHandle(req, new MockHttpServletResponse(), handlerMethodForAiNoAutoJob());

        verify(chargeService).openProcess(ctxCaptor.capture(), anyList());
        assertThat(ctxCaptor.getValue().billingCategory())
                .isEqualTo(stirling.software.saas.payg.model.BillingCategory.AI);
    }

    @Test
    void preHandle_classLevelRequiresFeatureOnly_isInScope() throws Exception {
        // Mirrors AiCreateController shape: @RequiresFeature on the @RestController class.
        // The interceptor must resolve it via beanType lookup and not short-circuit as
        // "no annotation".
        authenticateWithApiKey(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));
        org.mockito.ArgumentCaptor<stirling.software.saas.payg.charge.ChargeContext> ctxCaptor =
                org.mockito.ArgumentCaptor.forClass(
                        stirling.software.saas.payg.charge.ChargeContext.class);

        MockMultipartHttpServletRequest req = newMultipart();
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));

        interceptor.preHandle(req, new MockHttpServletResponse(), handlerMethodForClassLevelAi());

        verify(chargeService).openProcess(ctxCaptor.capture(), anyList());
        assertThat(ctxCaptor.getValue().billingCategory())
                .isEqualTo(stirling.software.saas.payg.model.BillingCategory.AI);
    }

    @Test
    void preHandle_aiEndpointWithAutomationHeader_automationWinsByPrecedence() throws Exception {
        // X-Stirling-Automation: true on an @RequiresFeature(AI_SUPPORT) endpoint → AUTOMATION
        // (header beats annotation by design — pipeline-driven AI counts as automation usage).
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

        interceptor.preHandle(req, new MockHttpServletResponse(), handlerMethodForAi());

        verify(chargeService).openProcess(ctxCaptor.capture(), anyList());
        assertThat(ctxCaptor.getValue().billingCategory())
                .isEqualTo(stirling.software.saas.payg.model.BillingCategory.AUTOMATION);
    }

    @Test
    void preHandle_aiToolRoute_inScopeAndCategoryAi() throws Exception {
        // AI document tools (/api/v1/ai/tools/**) live in the proprietary module and carry no PAYG
        // annotation. The interceptor recognises them by path → in scope + AI category, so a direct
        // multipart call opens a charge. Handler has NO annotations (handlerMethodForPlain).
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));
        org.mockito.ArgumentCaptor<stirling.software.saas.payg.charge.ChargeContext> ctxCaptor =
                org.mockito.ArgumentCaptor.forClass(
                        stirling.software.saas.payg.charge.ChargeContext.class);

        MockMultipartHttpServletRequest req = newMultipart();
        req.setRequestURI("/api/v1/ai/tools/pdf-comment-agent");
        req.addFile(
                new MockMultipartFile("fileInput", "x.pdf", "application/pdf", "abc".getBytes()));

        interceptor.preHandle(req, new MockHttpServletResponse(), handlerMethodForPlain());

        verify(chargeService).openProcess(ctxCaptor.capture(), anyList());
        assertThat(ctxCaptor.getValue().billingCategory())
                .isEqualTo(stirling.software.saas.payg.model.BillingCategory.AI);
    }

    @Test
    void preHandle_aiToolRoute_withAutomationHeader_isAutomation() throws Exception {
        // An AI tool dispatched inside a policy / AI workflow carries X-Stirling-Automation: true →
        // AUTOMATION wins over the AI path rule (the header is checked first).
        authenticateWithUser(makeUser(7L, 42L));
        UUID jobId = UUID.randomUUID();
        when(chargeService.openProcess(any(), anyList()))
                .thenReturn(new ChargeOutcome(jobId, 1, ChargeOutcome.Disposition.OPENED));
        org.mockito.ArgumentCaptor<stirling.software.saas.payg.charge.ChargeContext> ctxCaptor =
                org.mockito.ArgumentCaptor.forClass(
                        stirling.software.saas.payg.charge.ChargeContext.class);

        MockMultipartHttpServletRequest req = newMultipart();
        req.setRequestURI("/api/v1/ai/tools/pdf-comment-agent");
        req.addFile(
                new MockMultipartFile("fileInput", "x.pdf", "application/pdf", "abc".getBytes()));
        req.addHeader("X-Stirling-Automation", "true");

        interceptor.preHandle(req, new MockHttpServletResponse(), handlerMethodForPlain());

        verify(chargeService).openProcess(ctxCaptor.capture(), anyList());
        assertThat(ctxCaptor.getValue().billingCategory())
                .isEqualTo(stirling.software.saas.payg.model.BillingCategory.AUTOMATION);
    }

    @Test
    void preHandle_plainRouteNoAnnotations_stillShortCircuits() throws Exception {
        // Guard against the path rule being too broad: a non-AI-tools route with no annotations
        // must
        // still short-circuit (BYPASSED path), unaffected by the AI-tools recognition.
        authenticateWithUser(makeUser(7L, 42L));

        MockMultipartHttpServletRequest req = newMultipart(); // URI = /api/v1/security/test-tool
        req.addFile(new MockMultipartFile("file", "x.pdf", "application/pdf", "abc".getBytes()));

        boolean cont =
                interceptor.preHandle(req, new MockHttpServletResponse(), handlerMethodForPlain());

        assertThat(cont).isTrue();
        verify(chargeService, never()).openProcess(any(), anyList());
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

    private static HandlerMethod handlerMethodForAutomation() {
        try {
            Method m = FakeController.class.getDeclaredMethod("handleAutomation");
            return new HandlerMethod(new FakeController(), m);
        } catch (NoSuchMethodException e) {
            throw new RuntimeException(e);
        }
    }

    private static HandlerMethod handlerMethodForAi() {
        try {
            Method m = FakeController.class.getDeclaredMethod("handleAi");
            return new HandlerMethod(new FakeController(), m);
        } catch (NoSuchMethodException e) {
            throw new RuntimeException(e);
        }
    }

    private static HandlerMethod handlerMethodForAiNoAutoJob() {
        try {
            Method m = FakeController.class.getDeclaredMethod("handleAiNoAutoJob");
            return new HandlerMethod(new FakeController(), m);
        } catch (NoSuchMethodException e) {
            throw new RuntimeException(e);
        }
    }

    private static HandlerMethod handlerMethodForClassLevelAi() {
        try {
            Method m = ClassLevelAiController.class.getDeclaredMethod("classLevelAi");
            return new HandlerMethod(new ClassLevelAiController(), m);
        } catch (NoSuchMethodException e) {
            throw new RuntimeException(e);
        }
    }

    private void authenticateWithApiKey(User user) {
        stirling.software.proprietary.security.model.ApiKeyAuthenticationToken token =
                new stirling.software.proprietary.security.model.ApiKeyAuthenticationToken(
                        user, "test-api-key", List.of(new SimpleGrantedAuthority("ROLE_API")));
        SecurityContextHolder.getContext().setAuthentication(token);
    }

    static class FakeController {
        @AutoJobPostMapping(value = "/x", resourceWeight = 1)
        public void handleAuto() {}

        public void handlePlain() {}

        @AutoJobPostMapping(value = "/auto", resourceWeight = 1)
        @stirling.software.saas.payg.cap.RequiresFeature(
                stirling.software.saas.payg.model.FeatureGate.AUTOMATION)
        public void handleAutomation() {}

        @AutoJobPostMapping(value = "/ai", resourceWeight = 1)
        @stirling.software.saas.payg.cap.RequiresFeature(
                stirling.software.saas.payg.model.FeatureGate.AI_SUPPORT)
        public void handleAi() {}

        /**
         * AI-controller shape: @RequiresFeature without @AutoJobPostMapping (JSON body / proxy).
         */
        @stirling.software.saas.payg.cap.RequiresFeature(
                stirling.software.saas.payg.model.FeatureGate.AI_SUPPORT)
        public void handleAiNoAutoJob() {}
    }

    /** Mirrors AiCreateController layout: @RequiresFeature on the class, plain methods. */
    @stirling.software.saas.payg.cap.RequiresFeature(
            stirling.software.saas.payg.model.FeatureGate.AI_SUPPORT)
    static class ClassLevelAiController {
        public void classLevelAi() {}
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
