package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.MDC;
import org.springframework.boot.actuate.audit.AuditEvent;
import org.springframework.boot.actuate.audit.AuditEventRepository;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.security.service.JwtServiceInterface;

@ExtendWith(MockitoExtension.class)
class AuditServiceTest {

    @Mock private AuditEventRepository repository;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private JwtServiceInterface jwtService;

    private AuditConfigurationProperties auditConfig;
    private AuditService service;

    @BeforeEach
    void setUp() {
        auditConfig = new AuditConfigurationProperties(new ApplicationProperties());
        service = new AuditService(repository, auditConfig, true, pdfDocumentFactory, jwtService);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
        MDC.clear();
    }

    private AuditConfigurationProperties config(boolean enabled, int level) {
        ApplicationProperties props = new ApplicationProperties();
        var audit = props.getPremium().getEnterpriseFeatures().getAudit();
        audit.setEnabled(enabled);
        audit.setLevel(level);
        return new AuditConfigurationProperties(props);
    }

    private void authenticateAs(String username) {
        // 3-arg ctor marks the token authenticated (2-arg leaves it unauthenticated)
        Authentication auth =
                new UsernamePasswordAuthenticationToken(username, null, java.util.List.of());
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    private void bindRequest(MockHttpServletRequest request) {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    @Nested
    @DisplayName("audit() gating")
    class AuditGating {

        @Test
        @DisplayName("records event when enabled, level included and EE")
        void recordsWhenEnabled() {
            authenticateAs("alice");

            service.audit(AuditEventType.USER_LOGIN, new HashMap<>(), AuditLevel.BASIC);

            verify(repository).add(any(AuditEvent.class));
        }

        @Test
        @DisplayName("skips when not running EE")
        void skipsWhenNotEE() {
            AuditService nonEe =
                    new AuditService(
                            repository, auditConfig, false, pdfDocumentFactory, jwtService);

            nonEe.audit(AuditEventType.USER_LOGIN, new HashMap<>(), AuditLevel.BASIC);

            verify(repository, never()).add(any(AuditEvent.class));
        }

        @Test
        @DisplayName("skips when audit disabled")
        void skipsWhenDisabled() {
            AuditService disabled =
                    new AuditService(
                            repository, config(false, 2), true, pdfDocumentFactory, jwtService);

            disabled.audit(AuditEventType.USER_LOGIN, new HashMap<>(), AuditLevel.BASIC);

            verify(repository, never()).add(any(AuditEvent.class));
        }

        @Test
        @DisplayName("skips when required level exceeds configured level")
        void skipsWhenLevelTooHigh() {
            // STANDARD config does not include VERBOSE
            service.audit(AuditEventType.USER_LOGIN, new HashMap<>(), AuditLevel.VERBOSE);

            verify(repository, never()).add(any(AuditEvent.class));
        }

        @Test
        @DisplayName("default-level overload uses STANDARD and enriches origin")
        void defaultLevelEnrichesOrigin() {
            authenticateAs("alice");

            service.audit(AuditEventType.USER_LOGIN, new HashMap<>());

            org.mockito.ArgumentCaptor<AuditEvent> captor =
                    org.mockito.ArgumentCaptor.forClass(AuditEvent.class);
            verify(repository).add(captor.capture());
            assertThat(captor.getValue().getData()).containsKey("__origin");
            assertThat(captor.getValue().getPrincipal()).isEqualTo("alice");
        }

        @Test
        @DisplayName("string-type overload records with provided type name")
        void stringTypeOverload() {
            authenticateAs("alice");

            service.audit("CUSTOM_EVENT", new HashMap<>());

            org.mockito.ArgumentCaptor<AuditEvent> captor =
                    org.mockito.ArgumentCaptor.forClass(AuditEvent.class);
            verify(repository).add(captor.capture());
            assertThat(captor.getValue().getType()).isEqualTo("CUSTOM_EVENT");
        }

        @Test
        @DisplayName("explicit-principal overload bypasses SecurityContext")
        void explicitPrincipalOverload() {
            service.audit("bob", AuditEventType.USER_LOGIN, new HashMap<>());

            org.mockito.ArgumentCaptor<AuditEvent> captor =
                    org.mockito.ArgumentCaptor.forClass(AuditEvent.class);
            verify(repository).add(captor.capture());
            assertThat(captor.getValue().getPrincipal()).isEqualTo("bob");
        }

        @Test
        @DisplayName("pre-captured principal/origin/ip overload adds ip to data")
        void preCapturedOverloadAddsIp() {
            service.audit(
                    "carol",
                    "WEB",
                    "10.0.0.1",
                    AuditEventType.PDF_PROCESS,
                    new HashMap<>(),
                    AuditLevel.BASIC);

            org.mockito.ArgumentCaptor<AuditEvent> captor =
                    org.mockito.ArgumentCaptor.forClass(AuditEvent.class);
            verify(repository).add(captor.capture());
            assertThat(captor.getValue().getData()).containsEntry("__ipAddress", "10.0.0.1");
            assertThat(captor.getValue().getData()).containsEntry("__origin", "WEB");
        }

        @Test
        @DisplayName("pre-captured string-type overload skips ip when null")
        void preCapturedStringOverloadNullIp() {
            service.audit("carol", "API", null, "CUSTOM", new HashMap<>(), AuditLevel.BASIC);

            org.mockito.ArgumentCaptor<AuditEvent> captor =
                    org.mockito.ArgumentCaptor.forClass(AuditEvent.class);
            verify(repository).add(captor.capture());
            assertThat(captor.getValue().getData()).doesNotContainKey("__ipAddress");
            assertThat(captor.getValue().getType()).isEqualTo("CUSTOM");
        }
    }

    @Nested
    @DisplayName("createBaseAuditData")
    class CreateBaseAuditData {

        @Test
        @DisplayName("prefers MDC principal over SecurityContext")
        void prefersMdcPrincipal() {
            MDC.put("auditPrincipal", "mdcUser");
            authenticateAs("ctxUser");
            ProceedingJoinPoint jp = joinPoint();

            Map<String, Object> data = service.createBaseAuditData(jp, AuditLevel.BASIC);

            assertThat(data).containsEntry("principal", "mdcUser");
            assertThat(data).containsKey("timestamp");
            assertThat(data).doesNotContainKey("className");
        }

        @Test
        @DisplayName("falls back to system when no principal anywhere")
        void fallsBackToSystem() {
            ProceedingJoinPoint jp = joinPoint();

            Map<String, Object> data = service.createBaseAuditData(jp, AuditLevel.BASIC);

            assertThat(data).containsEntry("principal", "system");
        }

        @Test
        @DisplayName("VERBOSE level adds class and method names")
        void verboseAddsClassAndMethod() {
            ProceedingJoinPoint jp = joinPoint();

            Map<String, Object> data = service.createBaseAuditData(jp, AuditLevel.VERBOSE);

            assertThat(data).containsKey("className");
            assertThat(data).containsEntry("methodName", "sample");
        }
    }

    @Nested
    @DisplayName("addHttpData")
    class AddHttpData {

        @Test
        @DisplayName("returns early when method or path null")
        void earlyReturnOnNull() {
            Map<String, Object> data = new HashMap<>();

            service.addHttpData(data, null, "/x", AuditLevel.STANDARD);

            assertThat(data).isEmpty();
        }

        @Test
        @DisplayName("adds basic http data and stops when no request context")
        void noRequestContext() {
            Map<String, Object> data = new HashMap<>();

            service.addHttpData(data, "GET", "/api/v1/x", AuditLevel.STANDARD);

            assertThat(data).containsEntry("httpMethod", "GET");
            assertThat(data).containsEntry("path", "/api/v1/x");
            assertThat(data).doesNotContainKey("clientIp");
        }

        @Test
        @DisplayName("STANDARD level captures client IP and form params for POST")
        void standardCapturesIpAndForm() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setMethod("POST");
            request.setContentType("application/x-www-form-urlencoded");
            request.addParameter("name", "value");
            request.addParameter("_csrf", "secret");
            bindRequest(request);

            Map<String, Object> data = new HashMap<>();
            service.addHttpData(data, "POST", "/api/v1/x", AuditLevel.STANDARD);

            assertThat(data).containsKey("clientIp");
            @SuppressWarnings("unchecked")
            Map<String, String[]> form = (Map<String, String[]>) data.get("formParams");
            assertThat(form).containsKey("name");
            // CSRF token must be stripped from logged params
            assertThat(form).doesNotContainKey("_csrf");
        }
    }

    @Nested
    @DisplayName("safeToString")
    class SafeToString {

        @Test
        @DisplayName("null becomes literal null")
        void nullValue() {
            assertThat(service.safeToString(null, 100)).isEqualTo("null");
        }

        @Test
        @DisplayName("string passthrough and truncation with ellipsis")
        void stringTruncation() {
            assertThat(service.safeToString("hello", 100)).isEqualTo("hello");
            String result = service.safeToString("abcdefghij", 6);
            assertThat(result).endsWith("...");
            assertThat(result).hasSize(6);
        }

        @Test
        @DisplayName("byte arrays render as binary length marker")
        void byteArray() {
            assertThat(service.safeToString(new byte[] {1, 2, 3}, 100))
                    .isEqualTo("[binary data length=3]");
        }

        @Test
        @DisplayName("numbers and booleans use toString")
        void numbersAndBooleans() {
            assertThat(service.safeToString(42, 100)).isEqualTo("42");
            assertThat(service.safeToString(true, 100)).isEqualTo("true");
        }

        @Test
        @DisplayName("toString failure returns class marker")
        void toStringFailure() {
            Object boom =
                    new Object() {
                        @Override
                        public String toString() {
                            throw new IllegalStateException("nope");
                        }
                    };

            assertThat(service.safeToString(boom, 100)).contains("toString() failed");
        }
    }

    @Nested
    @DisplayName("shouldAudit / getEffectiveAuditLevel")
    class ShouldAudit {

        @Test
        @DisplayName("false when not running EE")
        void notEe() throws Exception {
            AuditService nonEe =
                    new AuditService(
                            repository, auditConfig, false, pdfDocumentFactory, jwtService);

            assertThat(nonEe.shouldAudit(sampleMethod(), auditConfig)).isFalse();
        }

        @Test
        @DisplayName("false when audit disabled")
        void disabled() throws Exception {
            assertThat(service.shouldAudit(sampleMethod(), config(false, 2))).isFalse();
        }

        @Test
        @DisplayName("true for BASIC method at STANDARD config")
        void enabledBasicMethod() throws Exception {
            assertThat(service.shouldAudit(sampleMethod(), auditConfig)).isTrue();
        }

        @Test
        @DisplayName("effective level defaults to provided when unannotated")
        void effectiveLevelDefault() throws Exception {
            AuditLevel level =
                    service.getEffectiveAuditLevel(sampleMethod(), AuditLevel.BASIC, auditConfig);

            assertThat(level).isEqualTo(AuditLevel.BASIC);
        }
    }

    @Nested
    @DisplayName("addTimingData")
    class AddTimingData {

        @Test
        @DisplayName("non-http call adds latency and status code")
        void nonHttpAddsLatency() {
            HttpServletResponse response =
                    new org.springframework.mock.web.MockHttpServletResponse();
            ((org.springframework.mock.web.MockHttpServletResponse) response).setStatus(200);
            Map<String, Object> data = new HashMap<>();

            service.addTimingData(
                    data, System.currentTimeMillis() - 5, response, AuditLevel.STANDARD, false);

            assertThat(data).containsKey("latencyMs");
            assertThat(data).containsEntry("statusCode", 200);
        }

        @Test
        @DisplayName("http request skips latency here")
        void httpSkipsLatency() {
            Map<String, Object> data = new HashMap<>();

            service.addTimingData(
                    data, System.currentTimeMillis(), null, AuditLevel.STANDARD, true);

            assertThat(data).doesNotContainKey("latencyMs");
        }

        @Test
        @DisplayName("below STANDARD level adds nothing")
        void belowStandard() {
            Map<String, Object> data = new HashMap<>();

            service.addTimingData(data, System.currentTimeMillis(), null, AuditLevel.BASIC, false);

            assertThat(data).isEmpty();
        }
    }

    @Nested
    @DisplayName("resolveEventType")
    class ResolveEventType {

        @Test
        @DisplayName("explicit annotation type wins")
        void annotationWins() throws Exception {
            Audited annotation = annotationWith(AuditEventType.USER_LOGIN);

            AuditEventType type =
                    service.resolveEventType(
                            sampleMethod(), SampleController.class, "/x", "POST", annotation);

            assertThat(type).isEqualTo(AuditEventType.USER_LOGIN);
        }

        @Test
        @DisplayName("GET ui-data endpoint resolves to UI_DATA")
        void getUiData() throws Exception {
            AuditEventType type =
                    service.resolveEventType(
                            sampleMethod(),
                            SampleController.class,
                            "/api/v1/ui-data/foo",
                            "GET",
                            null);

            assertThat(type).isEqualTo(AuditEventType.UI_DATA);
        }

        @Test
        @DisplayName("GET non-ui endpoint resolves to HTTP_REQUEST")
        void getHttpRequest() throws Exception {
            AuditEventType type =
                    service.resolveEventType(
                            sampleMethod(), SampleController.class, "/api/v1/merge", "GET", null);

            assertThat(type).isEqualTo(AuditEventType.HTTP_REQUEST);
        }

        @Test
        @DisplayName("settings path resolves to SETTINGS_CHANGED")
        void settingsPath() throws Exception {
            AuditEventType type =
                    service.resolveEventType(
                            sampleMethod(), SampleController.class, "/settings/x", "POST", null);

            assertThat(type).isEqualTo(AuditEventType.SETTINGS_CHANGED);
        }

        @Test
        @DisplayName("non-http defaults to PDF_PROCESS")
        void defaultPdfProcess() throws Exception {
            AuditEventType type =
                    service.resolveEventType(
                            sampleMethod(), SampleController.class, null, null, null);

            assertThat(type).isEqualTo(AuditEventType.PDF_PROCESS);
        }
    }

    @Nested
    @DisplayName("determineAuditEventType")
    class DetermineAuditEventType {

        @Test
        @DisplayName("GET resolves to HTTP_REQUEST")
        void getRequest() throws Exception {
            AuditEventType type =
                    service.determineAuditEventType(
                            sampleMethod(), SampleController.class, "/anything", "GET");

            assertThat(type).isEqualTo(AuditEventType.HTTP_REQUEST);
        }

        @Test
        @DisplayName("user path resolves to USER_PROFILE_UPDATE")
        void userPath() throws Exception {
            AuditEventType type =
                    service.determineAuditEventType(
                            sampleMethod(), SampleController.class, "/user/edit", "POST");

            assertThat(type).isEqualTo(AuditEventType.USER_PROFILE_UPDATE);
        }

        @Test
        @DisplayName("upload path matches file-operation pattern")
        void uploadPath() throws Exception {
            AuditEventType type =
                    service.determineAuditEventType(
                            sampleMethod(), SampleController.class, "/api/upload/file", "POST");

            assertThat(type).isEqualTo(AuditEventType.FILE_OPERATION);
        }

        @Test
        @DisplayName("plain POST defaults to PDF_PROCESS")
        void defaultProcess() throws Exception {
            AuditEventType type =
                    service.determineAuditEventType(
                            sampleMethod(), SampleController.class, "/api/v1/merge", "POST");

            assertThat(type).isEqualTo(AuditEventType.PDF_PROCESS);
        }
    }

    @Nested
    @DisplayName("request helpers")
    class RequestHelpers {

        @Test
        @DisplayName("getCurrentRequest returns bound request")
        void getCurrentRequest() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            bindRequest(request);

            assertThat(service.getCurrentRequest()).isSameAs(request);
        }

        @Test
        @DisplayName("getCurrentRequest null when no context")
        void getCurrentRequestNull() {
            assertThat(service.getCurrentRequest()).isNull();
        }

        @Test
        @DisplayName("static resource detection")
        void staticResource() {
            MockHttpServletRequest staticReq = new MockHttpServletRequest();
            staticReq.setRequestURI("/images/logo.png");
            assertThat(service.isStaticResourceRequest(staticReq)).isTrue();

            MockHttpServletRequest apiReq = new MockHttpServletRequest();
            apiReq.setRequestURI("/api/v1/merge");
            assertThat(service.isStaticResourceRequest(apiReq)).isFalse();

            assertThat(service.isStaticResourceRequest(null)).isFalse();
        }

        @Test
        @DisplayName("polling call detection")
        void pollingCall() {
            MockHttpServletRequest pollReq = new MockHttpServletRequest();
            pollReq.setMethod("GET");
            pollReq.setRequestURI("/api/v1/auth/me");
            assertThat(service.isPollingCall(pollReq)).isTrue();

            MockHttpServletRequest healthReq = new MockHttpServletRequest();
            healthReq.setMethod("GET");
            healthReq.setRequestURI("/actuator/health/db");
            assertThat(service.isPollingCall(healthReq)).isTrue();

            MockHttpServletRequest postReq = new MockHttpServletRequest();
            postReq.setMethod("POST");
            postReq.setRequestURI("/api/v1/auth/me");
            assertThat(service.isPollingCall(postReq)).isFalse();

            assertThat(service.isPollingCall(null)).isFalse();
        }

        @Test
        @DisplayName("shouldCaptureOperationResults reflects config")
        void captureOperationResults() {
            assertThat(service.shouldCaptureOperationResults()).isFalse();
        }
    }

    @Nested
    @DisplayName("extractClientIp")
    class ExtractClientIp {

        @Test
        @DisplayName("null request returns null")
        void nullRequest() {
            assertThat(service.extractClientIp(null)).isNull();
        }

        @Test
        @DisplayName("X-Forwarded-For first IP wins")
        void forwardedFor() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.addHeader("X-Forwarded-For", "203.0.113.1, 10.0.0.1");

            assertThat(service.extractClientIp(request)).isEqualTo("203.0.113.1");
        }

        @Test
        @DisplayName("X-Real-IP used when no forwarded header")
        void realIp() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.addHeader("X-Real-IP", "198.51.100.2");

            assertThat(service.extractClientIp(request)).isEqualTo("198.51.100.2");
        }

        @Test
        @DisplayName("falls back to remote address")
        void remoteAddr() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setRemoteAddr("127.0.0.5");

            assertThat(service.extractClientIp(request)).isEqualTo("127.0.0.5");
        }
    }

    @Nested
    @DisplayName("captureCurrentPrincipal / origin")
    class Capture {

        @Test
        @DisplayName("authenticated user is captured directly")
        void authenticatedPrincipal() {
            authenticateAs("dave");

            assertThat(service.captureCurrentPrincipal()).isEqualTo("dave");
            assertThat(service.captureCurrentOrigin()).isEqualTo("WEB");
        }

        @Test
        @DisplayName("anonymous with no token resolves to system/SYSTEM")
        void anonymousPrincipal() {
            assertThat(service.captureCurrentPrincipal()).isEqualTo("system");
            assertThat(service.captureCurrentOrigin()).isEqualTo("SYSTEM");
        }

        @Test
        @DisplayName("refresh endpoint derives principal from verified token")
        void refreshEndpointPrincipal() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setRequestURI("/api/v1/auth/refresh");
            bindRequest(request);
            when(jwtService.extractToken(request)).thenReturn("tok");
            when(jwtService.extractUsernameAllowExpired("tok")).thenReturn("refreshUser");

            assertThat(service.captureCurrentPrincipal()).isEqualTo("refreshUser");
        }

        @Test
        @DisplayName("refresh endpoint with API authType resolves origin API")
        void refreshEndpointApiOrigin() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setRequestURI("/api/v1/auth/refresh");
            bindRequest(request);
            when(jwtService.extractToken(request)).thenReturn("tok");
            when(jwtService.extractClaimsAllowExpired("tok")).thenReturn(Map.of("authType", "API"));

            assertThat(service.captureCurrentOrigin()).isEqualTo("API");
        }
    }

    // ===== helpers =====

    private ProceedingJoinPoint joinPoint() {
        ProceedingJoinPoint jp = org.mockito.Mockito.mock(ProceedingJoinPoint.class);
        MethodSignature sig = org.mockito.Mockito.mock(MethodSignature.class);
        try {
            // Lenient: BASIC-level tests do not touch signature/target
            org.mockito.Mockito.lenient().when(jp.getSignature()).thenReturn((Signature) sig);
            org.mockito.Mockito.lenient().when(sig.getMethod()).thenReturn(sampleMethod());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        org.mockito.Mockito.lenient().when(jp.getTarget()).thenReturn(new SampleController());
        return jp;
    }

    private Method sampleMethod() throws NoSuchMethodException {
        return SampleController.class.getMethod("sample");
    }

    private Audited annotationWith(AuditEventType type) {
        return new Audited() {
            @Override
            public Class<? extends java.lang.annotation.Annotation> annotationType() {
                return Audited.class;
            }

            @Override
            public AuditEventType type() {
                return type;
            }

            @Override
            public String typeString() {
                return "";
            }

            @Override
            public AuditLevel level() {
                return AuditLevel.STANDARD;
            }

            @Override
            public boolean includeArgs() {
                return true;
            }

            @Override
            public boolean includeResult() {
                return false;
            }
        };
    }

    /** Simple controller used as join-point target. */
    public static class SampleController {
        public void sample() {}
    }
}
