package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.List;
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
import org.springframework.boot.actuate.audit.AuditEvent;
import org.springframework.boot.actuate.audit.AuditEventRepository;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.config.AuditConfigurationProperties;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.service.JwtServiceInterface;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("AuditService")
class AuditServiceTest {

    @Mock private AuditEventRepository repository;
    @Mock private AuditConfigurationProperties auditConfig;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private JwtServiceInterface jwtService;

    private AuditService auditService;

    /** Helper to build the service with a given runningEE flag. */
    private AuditService newService(boolean runningEE) {
        return new AuditService(repository, auditConfig, runningEE, pdfDocumentFactory, jwtService);
    }

    @BeforeEach
    void setUp() {
        // Default: enterprise edition, fully-enabled audit. Individual tests override.
        auditService = newService(true);
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
        org.slf4j.MDC.clear();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
        org.slf4j.MDC.clear();
    }

    private void setAuthentication(String name) {
        // 3-arg ctor sets isAuthenticated()=true (the 2-arg one does not), matching a real
        // logged-in user.
        Authentication auth =
                new UsernamePasswordAuthenticationToken(
                        name, "creds", java.util.Collections.emptyList());
        SecurityContext ctx = SecurityContextHolder.createEmptyContext();
        ctx.setAuthentication(auth);
        SecurityContextHolder.setContext(ctx);
    }

    private void bindRequest(MockHttpServletRequest request) {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
    }

    private AuditEvent captureEvent() {
        ArgumentCaptor<AuditEvent> captor = ArgumentCaptor.forClass(AuditEvent.class);
        verify(repository).add(captor.capture());
        return captor.getValue();
    }

    // ==================================================================
    // audit(...) - persistence + gating
    // ==================================================================

    @Nested
    @DisplayName("audit() gating and persistence")
    class AuditGating {

        @Test
        @DisplayName("records event for current user when enabled, EE, level included")
        void recordsWhenEnabled() {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.VERBOSE);
            setAuthentication("alice");

            auditService.audit(AuditEventType.USER_LOGIN, new HashMap<>(), AuditLevel.STANDARD);

            AuditEvent event = captureEvent();
            assertEquals("alice", event.getPrincipal());
            assertEquals("USER_LOGIN", event.getType());
            // origin enrichment is added by the service
            assertTrue(event.getData().containsKey("__origin"));
        }

        @Test
        @DisplayName("skips when audit disabled")
        void skipsWhenDisabled() {
            when(auditConfig.isEnabled()).thenReturn(false);

            auditService.audit(AuditEventType.USER_LOGIN, new HashMap<>(), AuditLevel.STANDARD);

            verify(repository, never()).add(any());
        }

        @Test
        @DisplayName("skips when current level does not include required level")
        void skipsWhenLevelNotIncluded() {
            when(auditConfig.isEnabled()).thenReturn(true);
            // current BASIC does not include VERBOSE
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.BASIC);

            auditService.audit(AuditEventType.USER_LOGIN, new HashMap<>(), AuditLevel.VERBOSE);

            verify(repository, never()).add(any());
        }

        @Test
        @DisplayName("skips when not running enterprise edition")
        void skipsWhenNotEE() {
            auditService = newService(false);
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.VERBOSE);

            auditService.audit(AuditEventType.USER_LOGIN, new HashMap<>(), AuditLevel.STANDARD);

            verify(repository, never()).add(any());
        }

        @Test
        @DisplayName("default-level overload delegates with STANDARD")
        void defaultLevelOverload() {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.STANDARD);
            setAuthentication("bob");

            auditService.audit(AuditEventType.PDF_PROCESS, new HashMap<>());

            AuditEvent event = captureEvent();
            assertEquals("bob", event.getPrincipal());
            assertEquals("PDF_PROCESS", event.getType());
        }

        @Test
        @DisplayName("does not mutate the caller's data map (defensive copy)")
        void doesNotMutateCallerMap() {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.VERBOSE);
            setAuthentication("carol");

            Map<String, Object> data = new HashMap<>();
            data.put("k", "v");
            auditService.audit(AuditEventType.USER_LOGIN, data, AuditLevel.STANDARD);

            assertFalse(data.containsKey("__origin"), "caller map must not be enriched in place");
            assertEquals(1, data.size());
        }

        @Test
        @DisplayName("uses 'system' principal when no authentication present")
        void systemPrincipalWhenNoAuth() {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.STANDARD);

            auditService.audit(AuditEventType.PDF_PROCESS, new HashMap<>(), AuditLevel.STANDARD);

            AuditEvent event = captureEvent();
            assertEquals("system", event.getPrincipal());
        }
    }

    @Nested
    @DisplayName("audit(principal, ...) explicit-principal overloads")
    class AuditExplicitPrincipal {

        @Test
        @DisplayName("records with the supplied principal and no origin enrichment")
        void recordsWithSuppliedPrincipal() {
            when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);

            Map<String, Object> data = new HashMap<>();
            data.put("foo", "bar");
            auditService.audit(
                    "svc-account", AuditEventType.SETTINGS_CHANGED, data, AuditLevel.STANDARD);

            AuditEvent event = captureEvent();
            assertEquals("svc-account", event.getPrincipal());
            assertEquals("SETTINGS_CHANGED", event.getType());
            // explicit-principal overload stores the data as-is, no __origin injected
            assertFalse(event.getData().containsKey("__origin"));
            assertEquals("bar", event.getData().get("foo"));
        }

        @Test
        @DisplayName("skips when level not enabled")
        void skipsWhenLevelNotEnabled() {
            when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(false);

            auditService.audit(
                    "svc", AuditEventType.SETTINGS_CHANGED, new HashMap<>(), AuditLevel.STANDARD);

            verify(repository, never()).add(any());
        }

        @Test
        @DisplayName("skips when not EE even if level enabled")
        void skipsWhenNotEE() {
            auditService = newService(false);
            when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);

            auditService.audit(
                    "svc", AuditEventType.SETTINGS_CHANGED, new HashMap<>(), AuditLevel.STANDARD);

            verify(repository, never()).add(any());
        }

        @Test
        @DisplayName("default-level overload delegates with STANDARD")
        void defaultLevelDelegates() {
            when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);

            auditService.audit("svc", AuditEventType.FILE_OPERATION, new HashMap<>());

            AuditEvent event = captureEvent();
            assertEquals("svc", event.getPrincipal());
            assertEquals("FILE_OPERATION", event.getType());
        }
    }

    @Nested
    @DisplayName("audit(...) string-type overloads")
    class AuditStringType {

        @Test
        @DisplayName("current-user string-type records with origin and custom type")
        void currentUserStringType() {
            when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);
            setAuthentication("dave");

            auditService.audit("CUSTOM_EVENT", new HashMap<>(), AuditLevel.STANDARD);

            AuditEvent event = captureEvent();
            assertEquals("dave", event.getPrincipal());
            assertEquals("CUSTOM_EVENT", event.getType());
            assertTrue(event.getData().containsKey("__origin"));
        }

        @Test
        @DisplayName("current-user string-type default level delegates")
        void currentUserStringTypeDefault() {
            when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);
            setAuthentication("erin");

            auditService.audit("CUSTOM_EVENT", new HashMap<>());

            AuditEvent event = captureEvent();
            assertEquals("CUSTOM_EVENT", event.getType());
        }

        @Test
        @DisplayName("current-user string-type skips when level disabled")
        void currentUserStringTypeSkips() {
            when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(false);

            auditService.audit("CUSTOM_EVENT", new HashMap<>(), AuditLevel.STANDARD);

            verify(repository, never()).add(any());
        }

        @Test
        @DisplayName("explicit-principal string-type records as-is")
        void explicitPrincipalStringType() {
            when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);

            auditService.audit("acct", "CUSTOM", new HashMap<>(), AuditLevel.STANDARD);

            AuditEvent event = captureEvent();
            assertEquals("acct", event.getPrincipal());
            assertEquals("CUSTOM", event.getType());
            assertFalse(event.getData().containsKey("__origin"));
        }

        @Test
        @DisplayName("explicit-principal string-type default level delegates")
        void explicitPrincipalStringTypeDefault() {
            when(auditConfig.isLevelEnabled(AuditLevel.STANDARD)).thenReturn(true);

            auditService.audit("acct", "CUSTOM", new HashMap<>());

            AuditEvent event = captureEvent();
            assertEquals("acct", event.getPrincipal());
        }
    }

    @Nested
    @DisplayName("audit(...) pre-captured principal/origin/ip overloads")
    class AuditPreCaptured {

        @Test
        @DisplayName("enum-type records origin and ip when provided")
        void enumTypeWithIp() {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.VERBOSE);

            auditService.audit(
                    "principal",
                    "WEB",
                    "1.2.3.4",
                    AuditEventType.HTTP_REQUEST,
                    new HashMap<>(),
                    AuditLevel.STANDARD);

            AuditEvent event = captureEvent();
            assertEquals("principal", event.getPrincipal());
            assertEquals("HTTP_REQUEST", event.getType());
            assertEquals("WEB", event.getData().get("__origin"));
            assertEquals("1.2.3.4", event.getData().get("__ipAddress"));
        }

        @Test
        @DisplayName("enum-type omits ip key when ip is null")
        void enumTypeNullIp() {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.VERBOSE);

            auditService.audit(
                    "principal",
                    "API",
                    null,
                    AuditEventType.HTTP_REQUEST,
                    new HashMap<>(),
                    AuditLevel.STANDARD);

            AuditEvent event = captureEvent();
            assertEquals("API", event.getData().get("__origin"));
            assertFalse(event.getData().containsKey("__ipAddress"));
        }

        @Test
        @DisplayName("enum-type skips when disabled")
        void enumTypeSkipsWhenDisabled() {
            when(auditConfig.isEnabled()).thenReturn(false);

            auditService.audit(
                    "p",
                    "WEB",
                    "1.2.3.4",
                    AuditEventType.HTTP_REQUEST,
                    new HashMap<>(),
                    AuditLevel.STANDARD);

            verify(repository, never()).add(any());
        }

        @Test
        @DisplayName("string-type records origin and ip when provided")
        void stringTypeWithIp() {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.VERBOSE);

            auditService.audit(
                    "principal",
                    "SYSTEM",
                    "9.9.9.9",
                    "CUSTOM",
                    new HashMap<>(),
                    AuditLevel.STANDARD);

            AuditEvent event = captureEvent();
            assertEquals("CUSTOM", event.getType());
            assertEquals("SYSTEM", event.getData().get("__origin"));
            assertEquals("9.9.9.9", event.getData().get("__ipAddress"));
        }

        @Test
        @DisplayName("string-type skips when not EE")
        void stringTypeSkipsWhenNotEE() {
            auditService = newService(false);
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.VERBOSE);

            auditService.audit(
                    "p", "WEB", "1.2.3.4", "CUSTOM", new HashMap<>(), AuditLevel.STANDARD);

            verify(repository, never()).add(any());
        }
    }

    // ==================================================================
    // createBaseAuditData
    // ==================================================================

    @Nested
    @DisplayName("createBaseAuditData")
    class CreateBaseAuditData {

        @Test
        @DisplayName("includes timestamp and MDC principal when present")
        void usesMdcPrincipal() {
            org.slf4j.MDC.put("auditPrincipal", "mdc-user");
            ProceedingJoinPoint jp = org.mockito.Mockito.mock(ProceedingJoinPoint.class);

            Map<String, Object> data = auditService.createBaseAuditData(jp, AuditLevel.BASIC);

            assertEquals("mdc-user", data.get("principal"));
            assertNotNull(data.get("timestamp"));
            // BASIC does not include VERBOSE, so no class/method keys
            assertFalse(data.containsKey("className"));
            assertFalse(data.containsKey("methodName"));
        }

        @Test
        @DisplayName("falls back to SecurityContext principal when no MDC")
        void usesSecurityContextPrincipal() {
            setAuthentication("ctx-user");
            ProceedingJoinPoint jp = org.mockito.Mockito.mock(ProceedingJoinPoint.class);

            Map<String, Object> data = auditService.createBaseAuditData(jp, AuditLevel.BASIC);

            assertEquals("ctx-user", data.get("principal"));
        }

        @Test
        @DisplayName("falls back to 'system' when no MDC and no authentication")
        void fallsBackToSystem() {
            ProceedingJoinPoint jp = org.mockito.Mockito.mock(ProceedingJoinPoint.class);

            Map<String, Object> data = auditService.createBaseAuditData(jp, AuditLevel.BASIC);

            assertEquals("system", data.get("principal"));
        }

        @Test
        @DisplayName("adds className and methodName at VERBOSE level")
        void addsClassAndMethodAtVerbose() throws Exception {
            ProceedingJoinPoint jp = org.mockito.Mockito.mock(ProceedingJoinPoint.class);
            MethodSignature sig = org.mockito.Mockito.mock(MethodSignature.class);
            Method method = SampleTarget.class.getDeclaredMethod("doThing", String.class);
            when(jp.getTarget()).thenReturn(new SampleTarget());
            when(jp.getSignature()).thenReturn(sig);
            when(sig.getMethod()).thenReturn(method);

            Map<String, Object> data = auditService.createBaseAuditData(jp, AuditLevel.VERBOSE);

            assertEquals(SampleTarget.class.getName(), data.get("className"));
            assertEquals("doThing", data.get("methodName"));
        }
    }

    // ==================================================================
    // addHttpData
    // ==================================================================

    @Nested
    @DisplayName("addHttpData")
    class AddHttpData {

        @Test
        @DisplayName("returns early when httpMethod or path is null")
        void earlyReturnOnNull() {
            Map<String, Object> data = new HashMap<>();
            auditService.addHttpData(data, null, "/x", AuditLevel.STANDARD);
            auditService.addHttpData(data, "GET", null, AuditLevel.STANDARD);
            assertTrue(data.isEmpty());
        }

        @Test
        @DisplayName("adds basic method/path even without request context")
        void basicWithoutRequestContext() {
            Map<String, Object> data = new HashMap<>();
            auditService.addHttpData(data, "GET", "/api/v1/test", AuditLevel.BASIC);

            assertEquals("GET", data.get("httpMethod"));
            assertEquals("/api/v1/test", data.get("path"));
            // no request context: standard fields not added
            assertFalse(data.containsKey("clientIp"));
        }

        @Test
        @DisplayName("adds standard fields when request bound at STANDARD level")
        void standardFieldsWithRequest() {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/test");
            request.addHeader("X-Forwarded-For", "10.0.0.1, 10.0.0.2");
            bindRequest(request);
            org.slf4j.MDC.put("requestId", "req-123");

            Map<String, Object> data = new HashMap<>();
            auditService.addHttpData(data, "GET", "/api/v1/test", AuditLevel.STANDARD);

            assertEquals("10.0.0.1", data.get("clientIp"));
            assertNull(data.get("sessionId"));
            assertEquals("req-123", data.get("requestId"));
            assertFalse(data.containsKey("formParams"));
        }

        @Test
        @DisplayName("captures form params for POST form-urlencoded, stripping _csrf")
        void capturesFormParams() {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/submit");
            request.setContentType(MediaType.APPLICATION_FORM_URLENCODED_VALUE);
            request.addParameter("field", "value");
            request.addParameter("_csrf", "secret-token");
            bindRequest(request);

            Map<String, Object> data = new HashMap<>();
            auditService.addHttpData(data, "POST", "/submit", AuditLevel.STANDARD);

            assertTrue(data.containsKey("formParams"));
            @SuppressWarnings("unchecked")
            Map<String, String[]> params = (Map<String, String[]>) data.get("formParams");
            assertTrue(params.containsKey("field"));
            assertFalse(
                    params.containsKey("_csrf"), "CSRF token must be removed from logged params");
        }

        @Test
        @DisplayName("does not capture form params for JSON content type")
        void noFormParamsForJson() {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/submit");
            request.setContentType(MediaType.APPLICATION_JSON_VALUE);
            request.addParameter("field", "value");
            bindRequest(request);

            Map<String, Object> data = new HashMap<>();
            auditService.addHttpData(data, "POST", "/submit", AuditLevel.STANDARD);

            assertFalse(data.containsKey("formParams"));
        }

        @Test
        @DisplayName("at BASIC level adds only method/path, no standard fields")
        void basicLevelNoStandardFields() {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/x");
            bindRequest(request);

            Map<String, Object> data = new HashMap<>();
            auditService.addHttpData(data, "GET", "/x", AuditLevel.BASIC);

            assertEquals("GET", data.get("httpMethod"));
            assertFalse(data.containsKey("clientIp"));
        }
    }

    // ==================================================================
    // addFileData
    // ==================================================================

    @Nested
    @DisplayName("addFileData")
    class AddFileData {

        @Test
        @DisplayName("does nothing below STANDARD level")
        void noopBelowStandard() {
            ProceedingJoinPoint jp = org.mockito.Mockito.mock(ProceedingJoinPoint.class);
            Map<String, Object> data = new HashMap<>();

            auditService.addFileData(data, jp, AuditLevel.BASIC);

            assertFalse(data.containsKey("files"));
        }

        @Test
        @DisplayName("collects direct MultipartFile arguments")
        void collectsDirectMultipartFile() {
            MultipartFile file =
                    new MockMultipartFile("f", "doc.txt", "text/plain", new byte[] {1, 2, 3});
            ProceedingJoinPoint jp = org.mockito.Mockito.mock(ProceedingJoinPoint.class);
            when(jp.getArgs()).thenReturn(new Object[] {file});
            when(auditConfig.isCaptureFileHash()).thenReturn(false);
            when(auditConfig.isCapturePdfAuthor()).thenReturn(false);

            Map<String, Object> data = new HashMap<>();
            auditService.addFileData(data, jp, AuditLevel.STANDARD);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> files = (List<Map<String, Object>>) data.get("files");
            assertNotNull(files);
            assertEquals(1, files.size());
            assertEquals("doc.txt", files.get(0).get("name"));
            assertEquals(3L, files.get(0).get("size"));
            assertEquals("text/plain", files.get(0).get("type"));
            // hash/author disabled -> not present
            assertFalse(files.get(0).containsKey("fileHash"));
        }

        @Test
        @DisplayName("collects MultipartFile[] array arguments")
        void collectsArray() {
            MultipartFile f1 = new MockMultipartFile("a", "a.txt", "text/plain", new byte[] {1});
            MultipartFile f2 = new MockMultipartFile("b", "b.txt", "text/plain", new byte[] {2});
            ProceedingJoinPoint jp = org.mockito.Mockito.mock(ProceedingJoinPoint.class);
            when(jp.getArgs()).thenReturn(new Object[] {new MultipartFile[] {f1, f2}});
            when(auditConfig.isCaptureFileHash()).thenReturn(false);
            when(auditConfig.isCapturePdfAuthor()).thenReturn(false);

            Map<String, Object> data = new HashMap<>();
            auditService.addFileData(data, jp, AuditLevel.STANDARD);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> files = (List<Map<String, Object>>) data.get("files");
            assertEquals(2, files.size());
        }

        @Test
        @DisplayName("computes SHA-256 file hash when captureFileHash enabled")
        void computesFileHash() {
            // SHA-256 of empty byte array is a well-known constant.
            MultipartFile file =
                    new MockMultipartFile("f", "e.bin", "application/octet-stream", new byte[0]);
            ProceedingJoinPoint jp = org.mockito.Mockito.mock(ProceedingJoinPoint.class);
            when(jp.getArgs()).thenReturn(new Object[] {file});
            when(auditConfig.isCaptureFileHash()).thenReturn(true);
            when(auditConfig.isCapturePdfAuthor()).thenReturn(false);

            Map<String, Object> data = new HashMap<>();
            auditService.addFileData(data, jp, AuditLevel.STANDARD);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> files = (List<Map<String, Object>>) data.get("files");
            assertEquals(
                    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                    files.get(0).get("fileHash"));
        }

        @Test
        @DisplayName("ignores non-file arguments")
        void ignoresNonFileArgs() {
            ProceedingJoinPoint jp = org.mockito.Mockito.mock(ProceedingJoinPoint.class);
            when(jp.getArgs()).thenReturn(new Object[] {"a string", 42, null});

            Map<String, Object> data = new HashMap<>();
            auditService.addFileData(data, jp, AuditLevel.STANDARD);

            assertFalse(data.containsKey("files"));
        }
    }

    // ==================================================================
    // addMethodArguments
    // ==================================================================

    @Nested
    @DisplayName("addMethodArguments")
    class AddMethodArguments {

        @Test
        @DisplayName("does nothing below VERBOSE level")
        void noopBelowVerbose() {
            ProceedingJoinPoint jp = org.mockito.Mockito.mock(ProceedingJoinPoint.class);
            Map<String, Object> data = new HashMap<>();

            auditService.addMethodArguments(data, jp, AuditLevel.STANDARD);

            assertTrue(data.isEmpty());
        }

        @Test
        @DisplayName("adds named args at VERBOSE, including null values")
        void addsNamedArgs() {
            ProceedingJoinPoint jp = org.mockito.Mockito.mock(ProceedingJoinPoint.class);
            MethodSignature sig = org.mockito.Mockito.mock(MethodSignature.class);
            when(jp.getSignature()).thenReturn(sig);
            when(sig.getParameterNames()).thenReturn(new String[] {"username", "count"});
            when(jp.getArgs()).thenReturn(new Object[] {"alice", null});

            Map<String, Object> data = new HashMap<>();
            auditService.addMethodArguments(data, jp, AuditLevel.VERBOSE);

            assertEquals("alice", data.get("arg_username"));
            assertTrue(data.containsKey("arg_count"));
            assertNull(data.get("arg_count"));
        }

        @Test
        @DisplayName("does nothing when parameter names are null")
        void nullParamNames() {
            ProceedingJoinPoint jp = org.mockito.Mockito.mock(ProceedingJoinPoint.class);
            MethodSignature sig = org.mockito.Mockito.mock(MethodSignature.class);
            when(jp.getSignature()).thenReturn(sig);
            when(sig.getParameterNames()).thenReturn(null);
            when(jp.getArgs()).thenReturn(new Object[] {"x"});

            Map<String, Object> data = new HashMap<>();
            auditService.addMethodArguments(data, jp, AuditLevel.VERBOSE);

            assertTrue(data.isEmpty());
        }
    }

    // ==================================================================
    // safeToString
    // ==================================================================

    @Nested
    @DisplayName("safeToString")
    class SafeToString {

        @Test
        @DisplayName("null returns literal 'null'")
        void nullValue() {
            assertEquals("null", auditService.safeToString(null, 100));
        }

        @Test
        @DisplayName("String returned directly")
        void stringValue() {
            assertEquals("hello", auditService.safeToString("hello", 100));
        }

        @Test
        @DisplayName("Number and Boolean converted via toString")
        void numberAndBoolean() {
            assertEquals("42", auditService.safeToString(42, 100));
            assertEquals("true", auditService.safeToString(Boolean.TRUE, 100));
        }

        @Test
        @DisplayName("byte[] summarized by length, not content")
        void byteArray() {
            assertEquals(
                    "[binary data length=3]", auditService.safeToString(new byte[] {1, 2, 3}, 100));
        }

        @Test
        @DisplayName("truncates long strings with ellipsis")
        void truncates() {
            String input = "abcdefghij"; // length 10
            String result = auditService.safeToString(input, 6);
            assertEquals("abc...", result);
            assertEquals(6, result.length());
        }

        @Test
        @DisplayName("complex object uses toString")
        void complexObject() {
            Object obj =
                    new Object() {
                        @Override
                        public String toString() {
                            return "custom-repr";
                        }
                    };
            assertEquals("custom-repr", auditService.safeToString(obj, 100));
        }

        @Test
        @DisplayName("returns marker when toString throws")
        void toStringThrows() {
            Object obj =
                    new Object() {
                        @Override
                        public String toString() {
                            throw new RuntimeException("boom");
                        }
                    };
            String result = auditService.safeToString(obj, 100);
            assertTrue(result.endsWith("toString() failed]"));
        }
    }

    // ==================================================================
    // shouldAudit
    // ==================================================================

    @Nested
    @DisplayName("shouldAudit")
    class ShouldAudit {

        @Test
        @DisplayName("false when not EE")
        void falseWhenNotEE() throws Exception {
            auditService = newService(false);
            Method m = SampleTarget.class.getDeclaredMethod("doThing", String.class);

            assertFalse(auditService.shouldAudit(m, auditConfig));
        }

        @Test
        @DisplayName("false when audit disabled")
        void falseWhenDisabled() throws Exception {
            when(auditConfig.isEnabled()).thenReturn(false);
            Method m = SampleTarget.class.getDeclaredMethod("doThing", String.class);

            assertFalse(auditService.shouldAudit(m, auditConfig));
        }

        @Test
        @DisplayName("uses BASIC default for unannotated method and respects level")
        void unannotatedUsesBasic() throws Exception {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.BASIC);
            Method m = SampleTarget.class.getDeclaredMethod("doThing", String.class);

            assertTrue(auditService.shouldAudit(m, auditConfig));
        }

        @Test
        @DisplayName("false when config level below unannotated BASIC default")
        void unannotatedBelowBasic() throws Exception {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.OFF);
            Method m = SampleTarget.class.getDeclaredMethod("doThing", String.class);

            assertFalse(auditService.shouldAudit(m, auditConfig));
        }

        @Test
        @DisplayName("honors @Audited level on annotated method")
        void annotatedLevel() throws Exception {
            when(auditConfig.isEnabled()).thenReturn(true);
            when(auditConfig.getAuditLevel()).thenReturn(AuditLevel.STANDARD);
            Method m = SampleTarget.class.getDeclaredMethod("verboseOnly");

            // method requires VERBOSE, config only STANDARD -> not audited
            assertFalse(auditService.shouldAudit(m, auditConfig));
        }
    }

    // ==================================================================
    // addTimingData
    // ==================================================================

    @Nested
    @DisplayName("addTimingData")
    class AddTimingData {

        @Test
        @DisplayName("does nothing below STANDARD")
        void noopBelowStandard() {
            Map<String, Object> data = new HashMap<>();
            auditService.addTimingData(data, 0L, null, AuditLevel.BASIC, false);
            assertTrue(data.isEmpty());
        }

        @Test
        @DisplayName("adds latencyMs for non-HTTP method")
        void addsLatencyForNonHttp() {
            Map<String, Object> data = new HashMap<>();
            long start = System.currentTimeMillis() - 5;
            auditService.addTimingData(data, start, null, AuditLevel.STANDARD, false);

            assertTrue(data.containsKey("latencyMs"));
            Object latency = data.get("latencyMs");
            assertTrue(latency instanceof Long);
            assertTrue((Long) latency >= 0);
        }

        @Test
        @DisplayName("omits latencyMs for HTTP request")
        void omitsLatencyForHttp() {
            Map<String, Object> data = new HashMap<>();
            auditService.addTimingData(data, 0L, null, AuditLevel.STANDARD, true);

            assertFalse(data.containsKey("latencyMs"));
        }

        @Test
        @DisplayName("adds statusCode when response present")
        void addsStatusCode() {
            MockHttpServletResponse response = new MockHttpServletResponse();
            response.setStatus(418);
            Map<String, Object> data = new HashMap<>();

            auditService.addTimingData(data, 0L, response, AuditLevel.STANDARD, true);

            assertEquals(418, data.get("statusCode"));
        }
    }

    // ==================================================================
    // resolveEventType
    // ==================================================================

    @Nested
    @DisplayName("resolveEventType")
    class ResolveEventType {

        private Method anyMethod() throws Exception {
            return SampleTarget.class.getDeclaredMethod("doThing", String.class);
        }

        @Test
        @DisplayName("explicit non-HTTP_REQUEST annotation type wins")
        void explicitAnnotationWins() throws Exception {
            Audited annotation = annotationWithType(AuditEventType.USER_LOGIN);

            AuditEventType result =
                    auditService.resolveEventType(
                            anyMethod(), SampleTarget.class, "/x", "POST", annotation);

            assertEquals(AuditEventType.USER_LOGIN, result);
        }

        @Test
        @DisplayName("GET non-ui-data path resolves to HTTP_REQUEST")
        void getNonUiData() throws Exception {
            AuditEventType result =
                    auditService.resolveEventType(
                            anyMethod(), SampleController.class, "/api/v1/something", "GET", null);

            assertEquals(AuditEventType.HTTP_REQUEST, result);
        }

        @Test
        @DisplayName("GET ui-data endpoint resolves to UI_DATA")
        void getUiData() throws Exception {
            AuditEventType result =
                    auditService.resolveEventType(
                            anyMethod(), SampleController.class, "/api/v1/auth/me", "GET", null);

            assertEquals(AuditEventType.UI_DATA, result);
        }

        @Test
        @DisplayName("POST to user controller resolves to USER_PROFILE_UPDATE")
        void postUserController() throws Exception {
            AuditEventType result =
                    auditService.resolveEventType(
                            anyMethod(), UserSampleController.class, "/api/v1/x", "POST", null);

            assertEquals(AuditEventType.USER_PROFILE_UPDATE, result);
        }

        @Test
        @DisplayName("POST to admin path resolves to SETTINGS_CHANGED")
        void postAdminPath() throws Exception {
            AuditEventType result =
                    auditService.resolveEventType(
                            anyMethod(), SampleController.class, "/admin/users", "POST", null);

            assertEquals(AuditEventType.SETTINGS_CHANGED, result);
        }

        @Test
        @DisplayName("POST to upload/download path resolves to FILE_OPERATION")
        void postFilePath() throws Exception {
            AuditEventType result =
                    auditService.resolveEventType(
                            anyMethod(),
                            SampleController.class,
                            "/api/v1/upload/here",
                            "POST",
                            null);

            assertEquals(AuditEventType.FILE_OPERATION, result);
        }

        @Test
        @DisplayName("non-HTTP method (null httpMethod) defaults to PDF_PROCESS")
        void nonHttpDefaultsToPdfProcess() throws Exception {
            AuditEventType result =
                    auditService.resolveEventType(
                            anyMethod(), SampleController.class, null, null, null);

            assertEquals(AuditEventType.PDF_PROCESS, result);
        }

        @Test
        @DisplayName("HTTP_REQUEST annotation type is treated as no explicit override")
        void httpRequestAnnotationIgnored() throws Exception {
            Audited annotation = annotationWithType(AuditEventType.HTTP_REQUEST);

            AuditEventType result =
                    auditService.resolveEventType(
                            anyMethod(), SampleController.class, "/api/v1/x", "POST", annotation);

            // falls through to inference -> generic POST -> PDF_PROCESS
            assertEquals(AuditEventType.PDF_PROCESS, result);
        }
    }

    // ==================================================================
    // getEffectiveAuditLevel
    // ==================================================================

    @Nested
    @DisplayName("getEffectiveAuditLevel")
    class GetEffectiveAuditLevel {

        @Test
        @DisplayName("returns annotation level when present")
        void annotationLevel() throws Exception {
            Method m = SampleTarget.class.getDeclaredMethod("verboseOnly");

            AuditLevel level =
                    auditService.getEffectiveAuditLevel(m, AuditLevel.BASIC, auditConfig);

            assertEquals(AuditLevel.VERBOSE, level);
        }

        @Test
        @DisplayName("returns default level for unannotated method")
        void defaultLevel() throws Exception {
            Method m = SampleTarget.class.getDeclaredMethod("doThing", String.class);

            AuditLevel level =
                    auditService.getEffectiveAuditLevel(m, AuditLevel.STANDARD, auditConfig);

            assertEquals(AuditLevel.STANDARD, level);
        }
    }

    // ==================================================================
    // determineAuditEventType
    // ==================================================================

    @Nested
    @DisplayName("determineAuditEventType")
    class DetermineAuditEventType {

        private Method unannotated() throws Exception {
            return SampleTarget.class.getDeclaredMethod("doThing", String.class);
        }

        @Test
        @DisplayName("returns annotation type when annotated (even HTTP_REQUEST)")
        void annotatedType() throws Exception {
            Method m = SampleTarget.class.getDeclaredMethod("verboseOnly");

            AuditEventType result =
                    auditService.determineAuditEventType(m, SampleController.class, "/x", "POST");

            assertEquals(AuditEventType.USER_LOGIN, result);
        }

        @Test
        @DisplayName("GET infers HTTP_REQUEST")
        void getInfersHttpRequest() throws Exception {
            AuditEventType result =
                    auditService.determineAuditEventType(
                            unannotated(), SampleController.class, "/x", "GET");

            assertEquals(AuditEventType.HTTP_REQUEST, result);
        }

        @Test
        @DisplayName("user path infers USER_PROFILE_UPDATE")
        void userPath() throws Exception {
            AuditEventType result =
                    auditService.determineAuditEventType(
                            unannotated(), SampleController.class, "/user/profile", "POST");

            assertEquals(AuditEventType.USER_PROFILE_UPDATE, result);
        }

        @Test
        @DisplayName("settings path infers SETTINGS_CHANGED")
        void settingsPath() throws Exception {
            AuditEventType result =
                    auditService.determineAuditEventType(
                            unannotated(), SampleController.class, "/settings/x", "POST");

            assertEquals(AuditEventType.SETTINGS_CHANGED, result);
        }

        @Test
        @DisplayName("download path infers FILE_OPERATION")
        void filePath() throws Exception {
            AuditEventType result =
                    auditService.determineAuditEventType(
                            unannotated(), SampleController.class, "/api/v1/download/file", "POST");

            assertEquals(AuditEventType.FILE_OPERATION, result);
        }

        @Test
        @DisplayName("generic POST defaults to PDF_PROCESS")
        void genericPost() throws Exception {
            AuditEventType result =
                    auditService.determineAuditEventType(
                            unannotated(), SampleController.class, "/api/v1/convert", "POST");

            assertEquals(AuditEventType.PDF_PROCESS, result);
        }
    }

    // ==================================================================
    // request helpers
    // ==================================================================

    @Nested
    @DisplayName("request helpers")
    class RequestHelpers {

        @Test
        @DisplayName("getCurrentRequest returns null without request context")
        void getCurrentRequestNull() {
            assertNull(auditService.getCurrentRequest());
        }

        @Test
        @DisplayName("getCurrentRequest returns bound request")
        void getCurrentRequestBound() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            bindRequest(request);
            assertSame(request, auditService.getCurrentRequest());
        }

        @Test
        @DisplayName("isStaticResourceRequest true for css asset")
        void staticResourceTrue() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setContextPath("");
            request.setRequestURI("/styles/app.css");
            assertTrue(auditService.isStaticResourceRequest(request));
        }

        @Test
        @DisplayName("isStaticResourceRequest false for trackable api path")
        void staticResourceFalse() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setContextPath("");
            request.setRequestURI("/api/v1/convert");
            assertFalse(auditService.isStaticResourceRequest(request));
        }

        @Test
        @DisplayName("isStaticResourceRequest false for null request")
        void staticResourceNull() {
            assertFalse(auditService.isStaticResourceRequest(null));
        }

        @Test
        @DisplayName("extractClientIp prefers first X-Forwarded-For entry")
        void clientIpForwardedFor() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.addHeader("X-Forwarded-For", "203.0.113.1, 70.41.3.18");
            assertEquals("203.0.113.1", auditService.extractClientIp(request));
        }

        @Test
        @DisplayName("extractClientIp uses X-Real-IP when no forwarded-for")
        void clientIpRealIp() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.addHeader("X-Real-IP", "198.51.100.7");
            assertEquals("198.51.100.7", auditService.extractClientIp(request));
        }

        @Test
        @DisplayName("extractClientIp falls back to remote address")
        void clientIpRemoteAddr() {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setRemoteAddr("127.0.0.1");
            assertEquals("127.0.0.1", auditService.extractClientIp(request));
        }

        @Test
        @DisplayName("extractClientIp returns null for null request")
        void clientIpNull() {
            assertNull(auditService.extractClientIp(null));
        }
    }

    // ==================================================================
    // isPollingCall
    // ==================================================================

    @Nested
    @DisplayName("isPollingCall")
    class IsPollingCall {

        private MockHttpServletRequest get(String uri) {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
            request.setRequestURI(uri);
            return request;
        }

        @Test
        @DisplayName("null request is not polling")
        void nullRequest() {
            assertFalse(auditService.isPollingCall(null));
        }

        @Test
        @DisplayName("non-GET method is not polling")
        void nonGet() {
            MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/auth/me");
            request.setRequestURI("/api/v1/auth/me");
            assertFalse(auditService.isPollingCall(request));
        }

        @Test
        @DisplayName("exact polling endpoints return true")
        void exactPollingEndpoints() {
            assertTrue(auditService.isPollingCall(get("/api/v1/auth/me")));
            assertTrue(auditService.isPollingCall(get("/api/v1/app-config")));
            assertTrue(auditService.isPollingCall(get("/health")));
            assertTrue(auditService.isPollingCall(get("/actuator/health")));
        }

        @Test
        @DisplayName("prefix polling endpoints return true")
        void prefixPollingEndpoints() {
            assertTrue(auditService.isPollingCall(get("/health/live")));
            assertTrue(auditService.isPollingCall(get("/metrics/jvm")));
            assertTrue(auditService.isPollingCall(get("/actuator/metrics/cpu")));
        }

        @Test
        @DisplayName("unrelated GET path is not polling")
        void unrelatedPath() {
            assertFalse(auditService.isPollingCall(get("/api/v1/convert")));
        }
    }

    // ==================================================================
    // shouldCaptureOperationResults
    // ==================================================================

    @Nested
    @DisplayName("shouldCaptureOperationResults")
    class CaptureOperationResults {

        @Test
        @DisplayName("delegates to config flag - true")
        void delegatesTrue() {
            when(auditConfig.isCaptureOperationResults()).thenReturn(true);
            assertTrue(auditService.shouldCaptureOperationResults());
        }

        @Test
        @DisplayName("delegates to config flag - false")
        void delegatesFalse() {
            when(auditConfig.isCaptureOperationResults()).thenReturn(false);
            assertFalse(auditService.shouldCaptureOperationResults());
        }
    }

    // ==================================================================
    // captureCurrentPrincipal / captureCurrentOrigin
    // ==================================================================

    @Nested
    @DisplayName("capture current principal/origin")
    class CapturePrincipalOrigin {

        @Test
        @DisplayName("captureCurrentPrincipal returns authenticated user name")
        void principalFromAuth() {
            setAuthentication("frank");
            assertEquals("frank", auditService.captureCurrentPrincipal());
        }

        @Test
        @DisplayName("captureCurrentPrincipal returns 'system' for anonymous user")
        void principalAnonymous() {
            setAuthentication("anonymousUser");
            // no request context -> no refresh token path -> falls back to the anonymous name
            assertEquals("anonymousUser", auditService.captureCurrentPrincipal());
        }

        @Test
        @DisplayName("captureCurrentPrincipal returns 'system' when no auth")
        void principalSystem() {
            assertEquals("system", auditService.captureCurrentPrincipal());
        }

        @Test
        @DisplayName("captureCurrentOrigin returns API for ApiKey token")
        void originApi() {
            ApiKeyAuthenticationToken token = new ApiKeyAuthenticationToken("key");
            SecurityContext ctx = SecurityContextHolder.createEmptyContext();
            ctx.setAuthentication(token);
            SecurityContextHolder.setContext(ctx);

            assertEquals("API", auditService.captureCurrentOrigin());
        }

        @Test
        @DisplayName("captureCurrentOrigin returns WEB for authenticated user")
        void originWeb() {
            setAuthentication("grace");
            assertEquals("WEB", auditService.captureCurrentOrigin());
        }

        @Test
        @DisplayName("captureCurrentOrigin returns SYSTEM when unauthenticated")
        void originSystem() {
            assertEquals("SYSTEM", auditService.captureCurrentOrigin());
        }
    }

    // ==================================================================
    // refresh-token attribution (getCurrentUsername / determineOrigin paths)
    // ==================================================================

    @Nested
    @DisplayName("refresh-token attribution")
    class RefreshTokenAttribution {

        private void bindRefreshRequest() {
            MockHttpServletRequest request =
                    new MockHttpServletRequest("POST", "/api/v1/auth/refresh");
            request.setRequestURI("/app/api/v1/auth/refresh");
            bindRequest(request);
        }

        @Test
        @DisplayName("derives principal from refresh token subject when context anonymous")
        void principalFromRefreshToken() {
            bindRefreshRequest();
            when(jwtService.extractToken(any())).thenReturn("the-token");
            when(jwtService.extractUsernameAllowExpired("the-token")).thenReturn("heidi");

            assertEquals("heidi", auditService.captureCurrentPrincipal());
        }

        @Test
        @DisplayName("origin WEB for non-API refresh token claims")
        void originWebFromRefreshToken() {
            bindRefreshRequest();
            when(jwtService.extractToken(any())).thenReturn("the-token");
            Map<String, Object> claims = new HashMap<>();
            claims.put("authType", "WEB");
            when(jwtService.extractClaimsAllowExpired("the-token")).thenReturn(claims);

            assertEquals("WEB", auditService.captureCurrentOrigin());
        }

        @Test
        @DisplayName("origin API when refresh token claims authType=API")
        void originApiFromRefreshToken() {
            bindRefreshRequest();
            when(jwtService.extractToken(any())).thenReturn("the-token");
            Map<String, Object> claims = new HashMap<>();
            claims.put("authType", "API");
            when(jwtService.extractClaimsAllowExpired("the-token")).thenReturn(claims);

            assertEquals("API", auditService.captureCurrentOrigin());
        }

        @Test
        @DisplayName("origin SYSTEM when refresh token is blank")
        void originSystemWhenNoToken() {
            bindRefreshRequest();
            when(jwtService.extractToken(any())).thenReturn("");

            assertEquals("SYSTEM", auditService.captureCurrentOrigin());
        }

        @Test
        @DisplayName("principal 'system' when refresh token subject extraction throws")
        void principalSystemWhenExtractThrows() {
            bindRefreshRequest();
            when(jwtService.extractToken(any())).thenReturn("the-token");
            when(jwtService.extractUsernameAllowExpired("the-token"))
                    .thenThrow(new RuntimeException("bad token"));

            assertEquals("system", auditService.captureCurrentPrincipal());
        }
    }

    // ==================================================================
    // helper annotation + sample classes
    // ==================================================================

    /**
     * Build a synthetic @Audited instance carrying just a type, via the annotation on a sample
     * method.
     */
    private static Audited annotationWithType(AuditEventType type) {
        if (type == AuditEventType.USER_LOGIN) {
            return getAnnotation("annotatedUserLogin");
        }
        return getAnnotation("annotatedHttpRequest");
    }

    private static Audited getAnnotation(String methodName) {
        try {
            return SampleTarget.class.getDeclaredMethod(methodName).getAnnotation(Audited.class);
        } catch (NoSuchMethodException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Plain target whose package/class names do not match any inference branch. */
    static class SampleTarget {
        void doThing(String x) {}

        @Audited(type = AuditEventType.USER_LOGIN, level = AuditLevel.VERBOSE)
        void verboseOnly() {}

        @Audited(type = AuditEventType.USER_LOGIN)
        void annotatedUserLogin() {}

        @Audited(type = AuditEventType.HTTP_REQUEST)
        void annotatedHttpRequest() {}
    }

    /** Generic controller-like class (no user/admin/file in simple name). */
    static class SampleController {}

    /** Controller-like class whose simple name contains "user" for inference branches. */
    static class UserSampleController {}
}
