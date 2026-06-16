package stirling.software.proprietary.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.service.AuditService;

/**
 * Unit tests for {@link ControllerAuditAspect}. The aspect is exercised by driving its
 * around-advice methods with a mocked {@link ProceedingJoinPoint} whose signature returns real
 * reflected methods (so the {@code @Audited} annotation lookup behaves exactly as in production).
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ControllerAuditAspect")
class ControllerAuditAspectTest {

    @Mock private AuditService auditService;
    @Mock private AuditConfigurationProperties auditConfig;
    @Mock private ProceedingJoinPoint joinPoint;
    @Mock private MethodSignature methodSignature;

    private ControllerAuditAspect aspect;

    private static final Object PROCEED_RESULT = "proceed-result";

    @BeforeEach
    void setUp() {
        aspect = new ControllerAuditAspect(auditService, auditConfig);
        RequestContextHolder.resetRequestAttributes();
        MDC.clear();
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
        MDC.clear();
    }

    // ====================================================================
    // Test fixture controllers with real annotated methods
    // ====================================================================

    @RequestMapping("/base")
    static class SampleController {

        @GetMapping("/get")
        public Object getMethod() {
            return null;
        }

        @PostMapping("/post")
        public Object postMethod() {
            return null;
        }

        @PutMapping("/put")
        public Object putMethod() {
            return null;
        }

        @DeleteMapping("/delete")
        public Object deleteMethod() {
            return null;
        }

        @PatchMapping("/patch")
        public Object patchMethod() {
            return null;
        }

        @PostMapping("/audited")
        @Audited(type = AuditEventType.SETTINGS_CHANGED, level = AuditLevel.BASIC)
        public Object auditedMethod() {
            return null;
        }

        @PostMapping("/audited-string")
        @Audited(typeString = "CUSTOM_EVENT", level = AuditLevel.STANDARD)
        public Object auditedStringMethod() {
            return null;
        }

        @GetMapping
        public Object getNoPath() {
            return null;
        }
    }

    /** Controller without any class-level @RequestMapping, to exercise the null-base branch. */
    static class NoRequestMappingController {

        @GetMapping("/plain")
        public Object plainGet() {
            return null;
        }
    }

    // ====================================================================
    // Helpers
    // ====================================================================

    private Method method(String name) {
        for (Method m : SampleController.class.getDeclaredMethods()) {
            if (m.getName().equals(name)) {
                return m;
            }
        }
        throw new IllegalStateException("No such method: " + name);
    }

    /** Wire the join point to return the given reflected method and target instance. */
    private void wireJoinPoint(Method m, Object target) {
        when(joinPoint.getSignature()).thenReturn(methodSignature);
        when(methodSignature.getMethod()).thenReturn(m);
        when(joinPoint.getTarget()).thenReturn(target);
    }

    private void wireJoinPoint(Method m) {
        wireJoinPoint(m, new SampleController());
    }

    private void bindRequest(MockHttpServletRequest request) {
        bindRequest(request, null);
    }

    private void bindRequest(MockHttpServletRequest request, MockHttpServletResponse response) {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request, response));
    }

    /** Default happy-path config: enterprise audit enabled at the given level. */
    private void enableAuditing(AuditLevel level) {
        when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
        when(auditConfig.getAuditLevel()).thenReturn(level);
        when(auditService.createBaseAuditData(any(), any())).thenReturn(new HashMap<>());
        when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                .thenReturn(AuditEventType.HTTP_REQUEST);
    }

    // ====================================================================
    // shouldAudit == false: fast path just proceeds without any data work
    // ====================================================================

    @Nested
    @DisplayName("fast path when auditing disabled")
    class FastPath {

        @Test
        @DisplayName("auditGetMethod proceeds without auditing when shouldAudit is false")
        void getFastPath() throws Throwable {
            wireJoinPoint(method("getMethod"));
            when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(false);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            Object result = aspect.auditGetMethod(joinPoint);

            assertSame(PROCEED_RESULT, result);
            verify(joinPoint).proceed();
            verify(auditService, never()).createBaseAuditData(any(), any());
            verify(auditService, never())
                    .audit(
                            anyString(),
                            anyString(),
                            anyString(),
                            any(AuditEventType.class),
                            any(),
                            any());
        }

        @Test
        @DisplayName("does not read audit level or collect data on the fast path")
        void fastPathDoesNoWork() throws Throwable {
            wireJoinPoint(method("postMethod"));
            when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(false);

            aspect.auditPostMethod(joinPoint);

            verify(auditConfig, never()).getAuditLevel();
            verify(auditService, never()).addHttpData(any(), any(), any(), any());
        }
    }

    // ====================================================================
    // HTTP method routing: each entry point passes the correct verb through
    // ====================================================================

    @Nested
    @DisplayName("HTTP verb routing")
    class VerbRouting {

        @Test
        @DisplayName("GET advice records httpMethod GET")
        void getVerb() throws Throwable {
            wireJoinPoint(method("getMethod"));
            enableAuditing(AuditLevel.STANDARD);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/base/get");
            bindRequest(req);
            when(auditService.getCurrentRequest()).thenReturn(req);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditGetMethod(joinPoint);

            verify(auditService)
                    .addHttpData(any(), eq("GET"), anyString(), eq(AuditLevel.STANDARD));
        }

        @Test
        @DisplayName("POST advice records httpMethod POST")
        void postVerb() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/base/post"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPostMethod(joinPoint);

            verify(auditService).addHttpData(any(), eq("POST"), anyString(), any());
        }

        @Test
        @DisplayName("PUT advice records httpMethod PUT")
        void putVerb() throws Throwable {
            wireJoinPoint(method("putMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("PUT", "/base/put"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPutMethod(joinPoint);

            verify(auditService).addHttpData(any(), eq("PUT"), anyString(), any());
        }

        @Test
        @DisplayName("DELETE advice records httpMethod DELETE")
        void deleteVerb() throws Throwable {
            wireJoinPoint(method("deleteMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("DELETE", "/base/delete"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditDeleteMethod(joinPoint);

            verify(auditService).addHttpData(any(), eq("DELETE"), anyString(), any());
        }

        @Test
        @DisplayName("PATCH advice records httpMethod PATCH")
        void patchVerb() throws Throwable {
            wireJoinPoint(method("patchMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("PATCH", "/base/patch"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPatchMethod(joinPoint);

            verify(auditService).addHttpData(any(), eq("PATCH"), anyString(), any());
        }

        @Test
        @DisplayName("AutoJob advice records httpMethod POST")
        void autoJobVerb() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/base/post"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditAutoJobMethod(joinPoint);

            verify(auditService).addHttpData(any(), eq("POST"), anyString(), any());
        }

        @Test
        @DisplayName("static-resource advice records httpMethod GET")
        void staticResourceVerb() throws Throwable {
            // Reuse a GET-annotated method; the static-resource advice always passes "GET".
            wireJoinPoint(method("getMethod"));
            enableAuditing(AuditLevel.STANDARD);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/static/x");
            bindRequest(req);
            when(auditService.getCurrentRequest()).thenReturn(req);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditStaticResource(joinPoint);

            verify(auditService).addHttpData(any(), eq("GET"), anyString(), any());
        }
    }

    // ====================================================================
    // GET-specific skip branches
    // ====================================================================

    @Nested
    @DisplayName("GET skip branches")
    class GetSkips {

        @Test
        @DisplayName("skips auditing for static resource GET requests")
        void skipsStaticResource() throws Throwable {
            wireJoinPoint(method("getMethod"));
            enableAuditing(AuditLevel.STANDARD);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/css/app.css");
            bindRequest(req);
            when(auditService.getCurrentRequest()).thenReturn(req);
            when(auditService.isStaticResourceRequest(req)).thenReturn(true);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            Object result = aspect.auditGetMethod(joinPoint);

            assertSame(PROCEED_RESULT, result);
            verify(joinPoint).proceed();
            verify(auditService, never()).createBaseAuditData(any(), any());
            verify(auditService, never())
                    .audit(
                            anyString(),
                            anyString(),
                            anyString(),
                            any(AuditEventType.class),
                            any(),
                            any());
        }

        @Test
        @DisplayName("skips polling GET requests at STANDARD level")
        void skipsPollingAtStandard() throws Throwable {
            wireJoinPoint(method("getMethod"));
            enableAuditing(AuditLevel.STANDARD);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/auth/me");
            bindRequest(req);
            when(auditService.getCurrentRequest()).thenReturn(req);
            when(auditService.isStaticResourceRequest(req)).thenReturn(false);
            when(auditService.isPollingCall(req)).thenReturn(true);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            Object result = aspect.auditGetMethod(joinPoint);

            assertSame(PROCEED_RESULT, result);
            verify(auditService, never()).createBaseAuditData(any(), any());
        }

        @Test
        @DisplayName("does NOT skip polling GET requests at VERBOSE level")
        void doesNotSkipPollingAtVerbose() throws Throwable {
            wireJoinPoint(method("getMethod"));
            enableAuditing(AuditLevel.VERBOSE);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/auth/me");
            bindRequest(req);
            when(auditService.getCurrentRequest()).thenReturn(req);
            when(auditService.isStaticResourceRequest(req)).thenReturn(false);
            when(auditService.isPollingCall(req)).thenReturn(true);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditGetMethod(joinPoint);

            // Polling is only skipped at STANDARD; at VERBOSE the full audit flow runs.
            verify(auditService).createBaseAuditData(any(), any());
        }

        @Test
        @DisplayName("proceeds with full audit when GET request is neither static nor polling")
        void normalGetIsAudited() throws Throwable {
            wireJoinPoint(method("getMethod"));
            enableAuditing(AuditLevel.STANDARD);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/base/get");
            bindRequest(req);
            when(auditService.getCurrentRequest()).thenReturn(req);
            when(auditService.isStaticResourceRequest(req)).thenReturn(false);
            when(auditService.isPollingCall(req)).thenReturn(false);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditGetMethod(joinPoint);

            verify(auditService).createBaseAuditData(any(), any());
        }

        @Test
        @DisplayName("getCurrentRequest null skips both static and polling checks")
        void nullCurrentRequest() throws Throwable {
            wireJoinPoint(method("getMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("GET", "/base/get"));
            when(auditService.getCurrentRequest()).thenReturn(null);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditGetMethod(joinPoint);

            verify(auditService, never()).isStaticResourceRequest(any());
            verify(auditService, never()).isPollingCall(any());
            verify(auditService).createBaseAuditData(any(), any());
        }
    }

    // ====================================================================
    // @Audited annotated methods: aspect must defer to AuditAspect (just proceed)
    // ====================================================================

    @Nested
    @DisplayName("@Audited annotated methods")
    class AuditedMethods {

        @Test
        @DisplayName("proceeds and does NOT emit a duplicate audit event for @Audited methods")
        void auditedMethodProceedsWithoutDuplicate() throws Throwable {
            wireJoinPoint(method("auditedMethod"));
            when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/base/audited"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            Object result = aspect.auditPostMethod(joinPoint);

            assertSame(PROCEED_RESULT, result);
            verify(joinPoint).proceed();
            // The aspect leaves @Audited methods to AuditAspect: no data collection, no audit call.
            verify(auditService, never()).createBaseAuditData(any(), any());
            verify(auditService, never())
                    .audit(
                            anyString(),
                            anyString(),
                            anyString(),
                            any(AuditEventType.class),
                            any(),
                            any());
        }

        @Test
        @DisplayName("captures principal/origin into MDC even for @Audited methods")
        void auditedMethodStillCapturesContext() throws Throwable {
            wireJoinPoint(method("auditedMethod"));
            when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/base/audited"));
            when(auditService.captureCurrentPrincipal()).thenReturn("alice");
            when(auditService.captureCurrentOrigin()).thenReturn("WEB");
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPostMethod(joinPoint);

            verify(auditService).captureCurrentPrincipal();
            verify(auditService).captureCurrentOrigin();
        }
    }

    // ====================================================================
    // Full audit flow: success and failure outcomes
    // ====================================================================

    @Nested
    @DisplayName("full audit flow")
    class FullFlow {

        @Test
        @DisplayName("success outcome: collects data, proceeds, and records an audit event")
        void successOutcome() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            MockHttpServletResponse resp = new MockHttpServletResponse();
            resp.setStatus(200);
            bindRequest(new MockHttpServletRequest("POST", "/base/post"), resp);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            Object result = aspect.auditPostMethod(joinPoint);

            assertSame(PROCEED_RESULT, result);

            ArgumentCaptor<Map<String, Object>> dataCaptor = ArgumentCaptor.forClass(Map.class);
            verify(auditService)
                    .audit(
                            any(),
                            any(),
                            any(),
                            eq(AuditEventType.HTTP_REQUEST),
                            dataCaptor.capture(),
                            eq(AuditLevel.STANDARD));
            assertEquals("success", dataCaptor.getValue().get("outcome"));
            assertEquals(200, dataCaptor.getValue().get("statusCode"));
        }

        @Test
        @DisplayName("failure outcome: records failure data and rethrows the original exception")
        void failureOutcome() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/base/post"));
            IllegalStateException boom = new IllegalStateException("kaboom");
            when(joinPoint.proceed()).thenThrow(boom);

            IllegalStateException thrown =
                    assertThrows(
                            IllegalStateException.class, () -> aspect.auditPostMethod(joinPoint));
            assertSame(boom, thrown);

            ArgumentCaptor<Map<String, Object>> dataCaptor = ArgumentCaptor.forClass(Map.class);
            verify(auditService)
                    .audit(
                            any(),
                            any(),
                            any(),
                            any(AuditEventType.class),
                            dataCaptor.capture(),
                            any());
            Map<String, Object> data = dataCaptor.getValue();
            assertEquals("failure", data.get("outcome"));
            assertEquals("IllegalStateException", data.get("errorType"));
            assertEquals("kaboom", data.get("errorMessage"));
        }

        @Test
        @DisplayName("passes early-captured principal/origin/ip to the audit call")
        void passesCapturedContext() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/base/post");
            bindRequest(req);
            when(auditService.captureCurrentPrincipal()).thenReturn("bob");
            when(auditService.captureCurrentOrigin()).thenReturn("API");
            when(auditService.extractClientIp(any())).thenReturn("10.0.0.5");
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPostMethod(joinPoint);

            verify(auditService)
                    .audit(
                            eq("bob"),
                            eq("API"),
                            eq("10.0.0.5"),
                            any(AuditEventType.class),
                            any(),
                            any());
        }

        @Test
        @DisplayName("adds method arguments only at VERBOSE level")
        void methodArgsAtVerbose() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.VERBOSE);
            bindRequest(new MockHttpServletRequest("POST", "/base/post"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPostMethod(joinPoint);

            verify(auditService).addMethodArguments(any(), eq(joinPoint), eq(AuditLevel.VERBOSE));
        }

        @Test
        @DisplayName("does NOT add method arguments below VERBOSE level")
        void noMethodArgsBelowVerbose() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/base/post"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPostMethod(joinPoint);

            verify(auditService, never()).addMethodArguments(any(), any(), any());
        }
    }

    // ====================================================================
    // Operation-result capture
    // ====================================================================

    @Nested
    @DisplayName("operation result capture")
    class ResultCapture {

        @Test
        @DisplayName("captures result string when capture enabled and event is not UI_DATA")
        void capturesResult() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/base/post"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);
            when(auditService.shouldCaptureOperationResults()).thenReturn(true);
            when(auditService.safeToString(eq(PROCEED_RESULT), anyInt())).thenReturn("converted");

            aspect.auditPostMethod(joinPoint);

            verify(auditService).safeToString(eq(PROCEED_RESULT), eq(1000));
            ArgumentCaptor<Map<String, Object>> dataCaptor = ArgumentCaptor.forClass(Map.class);
            verify(auditService)
                    .audit(
                            any(),
                            any(),
                            any(),
                            any(AuditEventType.class),
                            dataCaptor.capture(),
                            any());
            assertEquals("converted", dataCaptor.getValue().get("result"));
        }

        @Test
        @DisplayName("does NOT capture result for UI_DATA events even when capture enabled")
        void skipsResultForUiData() throws Throwable {
            wireJoinPoint(method("getMethod"));
            enableAuditing(AuditLevel.STANDARD);
            when(auditService.resolveEventType(any(), any(), any(), any(), any()))
                    .thenReturn(AuditEventType.UI_DATA);
            MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/ui-data/x");
            bindRequest(req);
            when(auditService.getCurrentRequest()).thenReturn(req);
            when(auditService.isStaticResourceRequest(req)).thenReturn(false);
            when(auditService.isPollingCall(req)).thenReturn(false);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);
            when(auditService.shouldCaptureOperationResults()).thenReturn(true);

            aspect.auditGetMethod(joinPoint);

            verify(auditService, never()).safeToString(any(), anyInt());
        }

        @Test
        @DisplayName("does NOT capture result when capture disabled")
        void skipsResultWhenDisabled() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/base/post"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);
            when(auditService.shouldCaptureOperationResults()).thenReturn(false);

            aspect.auditPostMethod(joinPoint);

            verify(auditService, never()).safeToString(any(), anyInt());
        }

        @Test
        @DisplayName("does NOT capture result when proceed returns null")
        void skipsResultWhenNull() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/base/post"));
            when(joinPoint.proceed()).thenReturn(null);
            when(auditService.shouldCaptureOperationResults()).thenReturn(true);

            Object result = aspect.auditPostMethod(joinPoint);

            assertNull(result);
            verify(auditService, never()).safeToString(any(), anyInt());
        }
    }

    // ====================================================================
    // MDC propagation and restoration
    // ====================================================================

    @Nested
    @DisplayName("MDC capture and restoration")
    class MdcHandling {

        @Test
        @DisplayName(
                "populates MDC keys from AuditService when not already set, then restores (removes) them")
        void populatesAndRemovesMdc() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/base/post");
            bindRequest(req);
            when(auditService.captureCurrentPrincipal()).thenReturn("alice");
            when(auditService.captureCurrentOrigin()).thenReturn("WEB");
            when(auditService.extractClientIp(any())).thenReturn("1.2.3.4");
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPostMethod(joinPoint);

            // No previous values were present, so MDC must be cleared afterwards.
            assertNull(MDC.get("auditPrincipal"));
            assertNull(MDC.get("auditOrigin"));
            assertNull(MDC.get("auditIp"));
        }

        @Test
        @DisplayName("restores pre-existing MDC values instead of removing them")
        void restoresPreExistingMdc() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            MDC.put("auditPrincipal", "prePrincipal");
            MDC.put("auditOrigin", "preOrigin");
            MDC.put("auditIp", "preIp");
            bindRequest(new MockHttpServletRequest("POST", "/base/post"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPostMethod(joinPoint);

            assertEquals("prePrincipal", MDC.get("auditPrincipal"));
            assertEquals("preOrigin", MDC.get("auditOrigin"));
            assertEquals("preIp", MDC.get("auditIp"));
            // Pre-existing values short-circuit re-capture from the service.
            verify(auditService, never()).captureCurrentPrincipal();
            verify(auditService, never()).captureCurrentOrigin();
            verify(auditService, never()).extractClientIp(any());
        }

        @Test
        @DisplayName("MDC is restored even when the controller throws")
        void restoresMdcOnException() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/base/post"));
            when(auditService.captureCurrentPrincipal()).thenReturn("alice");
            when(auditService.captureCurrentOrigin()).thenReturn("WEB");
            when(joinPoint.proceed()).thenThrow(new RuntimeException("fail"));

            assertThrows(RuntimeException.class, () -> aspect.auditPostMethod(joinPoint));

            assertNull(MDC.get("auditPrincipal"));
            assertNull(MDC.get("auditOrigin"));
            assertNull(MDC.get("auditIp"));
        }

        @Test
        @DisplayName("does not put auditIp into MDC when extractClientIp returns null")
        void noIpMdcWhenNull() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/base/post"));
            when(auditService.captureCurrentPrincipal()).thenReturn("alice");
            when(auditService.captureCurrentOrigin()).thenReturn("WEB");
            when(auditService.extractClientIp(any())).thenReturn(null);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPostMethod(joinPoint);

            assertNull(MDC.get("auditIp"));
        }
    }

    // ====================================================================
    // @Audited level + typeString resolution
    // ====================================================================

    @Nested
    @DisplayName("@Audited level override")
    class AuditedLevelOverride {

        @Test
        @DisplayName("BASIC-annotated method that fails shouldAudit only proceeds (fast path)")
        void basicAnnotatedFastPath() throws Throwable {
            wireJoinPoint(method("auditedMethod"));
            when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(false);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            Object result = aspect.auditPostMethod(joinPoint);

            assertSame(PROCEED_RESULT, result);
            verify(auditConfig, never()).getAuditLevel();
        }
    }

    // ====================================================================
    // Request path resolution via getRequestPath
    // ====================================================================

    @Nested
    @DisplayName("request path resolution")
    class PathResolution {

        @Test
        @DisplayName("prefers the live request URI for the audited path")
        void usesRequestUri() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/actual/uri/path"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPostMethod(joinPoint);

            verify(auditService).addHttpData(any(), eq("POST"), eq("/actual/uri/path"), any());
        }

        @Test
        @DisplayName("falls back to annotation path when no request context is bound")
        void fallsBackToAnnotationPath() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            // No request bound -> getRequestPath rebuilds from @RequestMapping + @PostMapping.
            when(auditService.getCurrentRequest()).thenReturn(null);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPostMethod(joinPoint);

            verify(auditService).addHttpData(any(), eq("POST"), eq("/base/post"), any());
        }

        @Test
        @DisplayName("annotation fallback handles controllers without @RequestMapping")
        void fallbackNoClassMapping() throws Throwable {
            Method plainGet = null;
            for (Method m : NoRequestMappingController.class.getDeclaredMethods()) {
                if (m.getName().equals("plainGet")) {
                    plainGet = m;
                }
            }
            wireJoinPoint(plainGet, new NoRequestMappingController());
            enableAuditing(AuditLevel.STANDARD);
            // No request context: path built solely from the @GetMapping value.
            when(auditService.getCurrentRequest()).thenReturn(null);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditGetMethod(joinPoint);

            verify(auditService).addHttpData(any(), eq("GET"), eq("/plain"), any());
        }
    }

    // ====================================================================
    // Timing / status code in finally block
    // ====================================================================

    @Nested
    @DisplayName("timing and status capture")
    class TimingAndStatus {

        @Test
        @DisplayName("adds latency and status code at STANDARD level with a response present")
        void latencyAndStatus() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            MockHttpServletResponse resp = new MockHttpServletResponse();
            resp.setStatus(201);
            bindRequest(new MockHttpServletRequest("POST", "/base/post"), resp);
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPostMethod(joinPoint);

            ArgumentCaptor<Map<String, Object>> dataCaptor = ArgumentCaptor.forClass(Map.class);
            verify(auditService)
                    .audit(
                            any(),
                            any(),
                            any(),
                            any(AuditEventType.class),
                            dataCaptor.capture(),
                            any());
            Map<String, Object> data = dataCaptor.getValue();
            assertEquals(201, data.get("statusCode"));
            // latencyMs must be present and non-negative
            Object latency = data.get("latencyMs");
            assertTrue(latency instanceof Long);
            verify(auditService)
                    .addTimingData(any(), anyLong(), eq(resp), eq(AuditLevel.STANDARD), eq(true));
        }

        @Test
        @DisplayName("invokes addTimingData with isHttpRequest=true")
        void delegatesTimingToService() throws Throwable {
            wireJoinPoint(method("postMethod"));
            enableAuditing(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/base/post"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPostMethod(joinPoint);

            verify(auditService)
                    .addTimingData(any(), anyLong(), any(), eq(AuditLevel.STANDARD), eq(true));
        }
    }

    // ====================================================================
    // @Audited typeString path (string-based event type)
    // ====================================================================

    @Nested
    @DisplayName("@Audited methods are never double-audited regardless of typeString")
    class AuditedTypeString {

        @Test
        @DisplayName(
                "typeString @Audited method only proceeds, no string-type audit is emitted here")
        void typeStringMethodProceedsOnly() throws Throwable {
            wireJoinPoint(method("auditedStringMethod"));
            when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.STANDARD);
            bindRequest(new MockHttpServletRequest("POST", "/base/audited-string"));
            when(joinPoint.proceed()).thenReturn(PROCEED_RESULT);

            aspect.auditPostMethod(joinPoint);

            // @Audited methods short-circuit before any audit emission in this aspect.
            verify(auditService, never())
                    .audit(anyString(), anyString(), anyString(), anyString(), any(), any());
            verify(auditService, never())
                    .audit(
                            anyString(),
                            anyString(),
                            anyString(),
                            any(AuditEventType.class),
                            any(),
                            any());
        }
    }
}
