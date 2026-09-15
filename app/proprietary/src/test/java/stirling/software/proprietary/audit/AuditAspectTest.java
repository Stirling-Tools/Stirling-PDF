package stirling.software.proprietary.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.service.AuditService;

@ExtendWith(MockitoExtension.class)
class AuditAspectTest {

    @Mock private AuditService auditService;

    private AuditConfigurationProperties auditConfig;
    private AuditAspect aspect;
    private MockHttpServletRequest request;

    @BeforeEach
    void setUp() {
        auditConfig = new AuditConfigurationProperties(new ApplicationProperties());
        aspect = new AuditAspect(auditService, auditConfig);
        request = new MockHttpServletRequest("POST", "/api/v1/auth/login");
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(request, new MockHttpServletResponse()));
    }

    @AfterEach
    void tearDown() {
        RequestContextHolder.resetRequestAttributes();
        MDC.clear();
    }

    @Test
    @DisplayName("keeps the handler's status when the servlet response still reads 200")
    void handlerStatusSurvivesTimingData() throws Throwable {
        ProceedingJoinPoint jp = joinPointFor("login");
        ResponseEntity<String> rejected = ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("no");
        when(jp.proceed()).thenReturn(rejected);
        when(auditService.responseStatus(rejected)).thenReturn(401);
        // Stand-in for the real addTimingData, which reads the not-yet-written servlet response.
        doAnswer(
                        invocation -> {
                            invocation
                                    .<Map<String, Object>>getArgument(0)
                                    .put("statusCode", HttpStatus.OK.value());
                            return null;
                        })
                .when(auditService)
                .addTimingData(anyMap(), anyLong(), any(), any(AuditLevel.class), anyBoolean());

        aspect.auditMethod(jp);

        assertThat(recordedData())
                .containsEntry("status", "failure")
                .containsEntry("statusCode", 401);
    }

    @Test
    @DisplayName("records an unverified identity as data, never as the principal")
    void keepsAttemptedSubjectOutOfThePrincipal() throws Throwable {
        ProceedingJoinPoint jp = joinPointFor("login");
        AuditContext.setAttemptedSubject(request, "victim@example.com");
        when(jp.proceed()).thenReturn(ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("no"));

        aspect.auditMethod(jp);

        ArgumentCaptor<Map<String, Object>> dataCaptor = mapCaptor();
        verify(auditService)
                .audit(
                        eq("anonymousUser"),
                        eq("WEB"),
                        any(),
                        eq(AuditEventType.USER_LOGIN),
                        dataCaptor.capture(),
                        any(AuditLevel.class));
        assertThat(dataCaptor.getValue()).containsEntry("attemptedUsername", "victim@example.com");
    }

    @Test
    @DisplayName("records the verified subject as the principal")
    void promotesVerifiedSubject() throws Throwable {
        ProceedingJoinPoint jp = joinPointFor("login");
        AuditContext.setAttemptedSubject(request, "alice@example.com");
        AuditContext.setSubject(request, "alice@example.com");
        when(jp.proceed()).thenReturn(ResponseEntity.ok("in"));

        aspect.auditMethod(jp);

        verify(auditService)
                .audit(
                        eq("alice@example.com"),
                        eq("WEB"),
                        any(),
                        eq(AuditEventType.USER_LOGIN),
                        anyMap(),
                        any(AuditLevel.class));
    }

    private Map<String, Object> recordedData() {
        ArgumentCaptor<Map<String, Object>> dataCaptor = mapCaptor();
        verify(auditService)
                .audit(
                        any(),
                        any(),
                        any(),
                        any(AuditEventType.class),
                        dataCaptor.capture(),
                        any(AuditLevel.class));
        return dataCaptor.getValue();
    }

    @SuppressWarnings("unchecked")
    private static ArgumentCaptor<Map<String, Object>> mapCaptor() {
        return ArgumentCaptor.forClass(Map.class);
    }

    private ProceedingJoinPoint joinPointFor(String methodName) throws Exception {
        ProceedingJoinPoint jp = mock(ProceedingJoinPoint.class);
        MethodSignature sig = mock(MethodSignature.class);
        Method method = SampleAuthController.class.getMethod(methodName);
        lenient().when(jp.getSignature()).thenReturn((Signature) sig);
        lenient().when(sig.getMethod()).thenReturn(method);
        lenient().when(jp.getTarget()).thenReturn(new SampleAuthController());
        lenient().when(jp.getArgs()).thenReturn(new Object[0]);
        lenient().when(auditService.shouldAudit(method, auditConfig)).thenReturn(true);
        lenient().when(auditService.captureCurrentPrincipal()).thenReturn("anonymousUser");
        lenient().when(auditService.captureCurrentOrigin()).thenReturn("WEB");
        lenient()
                .when(auditService.createBaseAuditData(eq(jp), any(AuditLevel.class)))
                .thenReturn(new HashMap<>());
        lenient()
                .when(
                        auditService.resolveEventType(
                                eq(method),
                                any(Class.class),
                                any(),
                                eq("POST"),
                                any(Audited.class)))
                .thenReturn(AuditEventType.USER_LOGIN);
        return jp;
    }

    public static class SampleAuthController {
        @Audited(type = AuditEventType.USER_LOGIN, level = AuditLevel.BASIC)
        public ResponseEntity<String> login() {
            return ResponseEntity.ok("in");
        }
    }
}
