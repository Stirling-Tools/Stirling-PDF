package stirling.software.proprietary.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
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
import org.slf4j.MDC;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.service.AuditService;

@ExtendWith(MockitoExtension.class)
class ControllerAuditAspectTest {

    @Mock private AuditService auditService;

    private AuditConfigurationProperties auditConfig;
    private ControllerAuditAspect aspect;

    @BeforeEach
    void setUp() {
        // Default config: enabled=true, level=STANDARD(2)
        auditConfig = new AuditConfigurationProperties(new ApplicationProperties());
        aspect = new ControllerAuditAspect(auditService, auditConfig);
    }

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    private ProceedingJoinPoint joinPointFor(String methodName) throws Exception {
        ProceedingJoinPoint jp = mock(ProceedingJoinPoint.class);
        MethodSignature sig = mock(MethodSignature.class);
        Method method = SampleController.class.getMethod(methodName);
        lenient().when(jp.getSignature()).thenReturn((Signature) sig);
        lenient().when(sig.getMethod()).thenReturn(method);
        lenient().when(jp.getTarget()).thenReturn(new SampleController());
        lenient().when(jp.getArgs()).thenReturn(new Object[0]);
        return jp;
    }

    @Nested
    @DisplayName("fast path")
    class FastPath {

        @Test
        @DisplayName("shouldAudit false proceeds without recording")
        void skipsWhenShouldAuditFalse() throws Throwable {
            ProceedingJoinPoint jp = joinPointFor("getEndpoint");
            when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(false);
            when(jp.proceed()).thenReturn("ok");

            Object result = aspect.auditGetMethod(jp);

            assertThat(result).isEqualTo("ok");
            verify(jp).proceed();
            verify(auditService, never())
                    .audit(
                            any(String.class),
                            any(String.class),
                            any(),
                            any(AuditEventType.class),
                            anyMap(),
                            any(AuditLevel.class));
        }
    }

    @Nested
    @DisplayName("success path")
    class SuccessPath {

        @Test
        @DisplayName("records success outcome and returns result")
        void recordsSuccess() throws Throwable {
            ProceedingJoinPoint jp = joinPointFor("postEndpoint");
            when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
            when(auditService.captureCurrentPrincipal()).thenReturn("alice");
            when(auditService.captureCurrentOrigin()).thenReturn("WEB");
            when(auditService.createBaseAuditData(eq(jp), any(AuditLevel.class)))
                    .thenReturn(new HashMap<>());
            when(auditService.resolveEventType(
                            any(Method.class), any(Class.class), any(), eq("POST"), isNull()))
                    .thenReturn(AuditEventType.PDF_PROCESS);
            when(jp.proceed()).thenReturn("done");

            Object result = aspect.auditPostMethod(jp);

            assertThat(result).isEqualTo("done");

            ArgumentCaptor<Map<String, Object>> dataCaptor = mapCaptor();
            verify(auditService)
                    .audit(
                            eq("alice"),
                            eq("WEB"),
                            any(),
                            eq(AuditEventType.PDF_PROCESS),
                            dataCaptor.capture(),
                            any(AuditLevel.class));
            assertThat(dataCaptor.getValue()).containsEntry("outcome", "success");
        }

        @Test
        @DisplayName("reuses MDC principal/origin when present (no re-capture)")
        void reusesMdcContext() throws Throwable {
            MDC.put("auditPrincipal", "fromMdc");
            MDC.put("auditOrigin", "API");
            ProceedingJoinPoint jp = joinPointFor("postEndpoint");
            when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
            when(auditService.createBaseAuditData(eq(jp), any(AuditLevel.class)))
                    .thenReturn(new HashMap<>());
            when(auditService.resolveEventType(
                            any(Method.class), any(Class.class), any(), eq("POST"), isNull()))
                    .thenReturn(AuditEventType.PDF_PROCESS);
            when(jp.proceed()).thenReturn("done");

            aspect.auditPostMethod(jp);

            // Principal/origin already in MDC, so service capture must not be called
            verify(auditService, never()).captureCurrentPrincipal();
            verify(auditService, never()).captureCurrentOrigin();
            verify(auditService)
                    .audit(
                            eq("fromMdc"),
                            eq("API"),
                            any(),
                            eq(AuditEventType.PDF_PROCESS),
                            anyMap(),
                            any(AuditLevel.class));
        }
    }

    @Nested
    @DisplayName("failure path")
    class FailurePath {

        @Test
        @DisplayName("records failure outcome and rethrows")
        void recordsFailureAndRethrows() throws Throwable {
            ProceedingJoinPoint jp = joinPointFor("postEndpoint");
            when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
            when(auditService.captureCurrentPrincipal()).thenReturn("alice");
            when(auditService.captureCurrentOrigin()).thenReturn("WEB");
            when(auditService.createBaseAuditData(eq(jp), any(AuditLevel.class)))
                    .thenReturn(new HashMap<>());
            when(auditService.resolveEventType(
                            any(Method.class), any(Class.class), any(), eq("POST"), isNull()))
                    .thenReturn(AuditEventType.PDF_PROCESS);
            when(jp.proceed()).thenThrow(new IllegalStateException("boom"));

            assertThatThrownBy(() -> aspect.auditPostMethod(jp))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessage("boom");

            ArgumentCaptor<Map<String, Object>> dataCaptor = mapCaptor();
            verify(auditService)
                    .audit(
                            eq("alice"),
                            eq("WEB"),
                            any(),
                            eq(AuditEventType.PDF_PROCESS),
                            dataCaptor.capture(),
                            any(AuditLevel.class));
            Map<String, Object> data = dataCaptor.getValue();
            assertThat(data).containsEntry("outcome", "failure");
            assertThat(data).containsEntry("errorType", "IllegalStateException");
            assertThat(data).containsEntry("errorMessage", "boom");
        }
    }

    @Nested
    @DisplayName("@Audited delegation")
    class AuditedDelegation {

        @Test
        @DisplayName("annotated method proceeds without double-auditing")
        void annotatedMethodSkips() throws Throwable {
            ProceedingJoinPoint jp = joinPointFor("annotatedEndpoint");
            when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
            when(auditService.captureCurrentPrincipal()).thenReturn("alice");
            when(auditService.captureCurrentOrigin()).thenReturn("WEB");
            when(jp.proceed()).thenReturn("ok");

            Object result = aspect.auditPostMethod(jp);

            assertThat(result).isEqualTo("ok");
            // @Audited methods are handled by AuditAspect, so this aspect must not record
            verify(auditService, never())
                    .audit(
                            any(String.class),
                            any(String.class),
                            any(),
                            any(AuditEventType.class),
                            anyMap(),
                            any(AuditLevel.class));
        }
    }

    @Nested
    @DisplayName("operation result capture")
    class OperationResults {

        @Test
        @DisplayName("captures result when enabled and non-UI type")
        void capturesResult() throws Throwable {
            ProceedingJoinPoint jp = joinPointFor("postEndpoint");
            when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
            when(auditService.captureCurrentPrincipal()).thenReturn("alice");
            when(auditService.captureCurrentOrigin()).thenReturn("WEB");
            when(auditService.createBaseAuditData(eq(jp), any(AuditLevel.class)))
                    .thenReturn(new HashMap<>());
            when(auditService.resolveEventType(
                            any(Method.class), any(Class.class), any(), eq("POST"), isNull()))
                    .thenReturn(AuditEventType.PDF_PROCESS);
            when(auditService.shouldCaptureOperationResults()).thenReturn(true);
            when(auditService.safeToString(eq("done"), anyInt())).thenReturn("done");
            when(jp.proceed()).thenReturn("done");

            aspect.auditPostMethod(jp);

            ArgumentCaptor<Map<String, Object>> dataCaptor = mapCaptor();
            verify(auditService)
                    .audit(
                            eq("alice"),
                            eq("WEB"),
                            any(),
                            eq(AuditEventType.PDF_PROCESS),
                            dataCaptor.capture(),
                            any(AuditLevel.class));
            assertThat(dataCaptor.getValue()).containsEntry("result", "done");
        }

        @Test
        @DisplayName("UI_DATA result is not captured")
        void uiDataResultSkipped() throws Throwable {
            ProceedingJoinPoint jp = joinPointFor("getEndpoint");
            when(auditService.shouldAudit(any(Method.class), eq(auditConfig))).thenReturn(true);
            when(auditService.captureCurrentPrincipal()).thenReturn("alice");
            when(auditService.captureCurrentOrigin()).thenReturn("WEB");
            when(auditService.createBaseAuditData(eq(jp), any(AuditLevel.class)))
                    .thenReturn(new HashMap<>());
            when(auditService.resolveEventType(
                            any(Method.class), any(Class.class), any(), eq("GET"), isNull()))
                    .thenReturn(AuditEventType.UI_DATA);
            lenient().when(auditService.shouldCaptureOperationResults()).thenReturn(true);
            when(jp.proceed()).thenReturn("payload");

            aspect.auditGetMethod(jp);

            ArgumentCaptor<Map<String, Object>> dataCaptor = mapCaptor();
            verify(auditService)
                    .audit(
                            eq("alice"),
                            eq("WEB"),
                            any(),
                            eq(AuditEventType.UI_DATA),
                            dataCaptor.capture(),
                            any(AuditLevel.class));
            assertThat(dataCaptor.getValue()).doesNotContainKey("result");
        }
    }

    @SuppressWarnings("unchecked")
    private static ArgumentCaptor<Map<String, Object>> mapCaptor() {
        return ArgumentCaptor.forClass(Map.class);
    }

    /** Sample controller whose methods carry the web-mapping annotations the aspect inspects. */
    public static class SampleController {

        @GetMapping("/api/v1/sample")
        public String getEndpoint() {
            return "get";
        }

        @PostMapping("/api/v1/sample")
        public String postEndpoint() {
            return "post";
        }

        @PostMapping("/api/v1/annotated")
        @Audited(type = AuditEventType.USER_PROFILE_UPDATE, level = AuditLevel.BASIC)
        public String annotatedEndpoint() {
            return "annotated";
        }
    }
}
