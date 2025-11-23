package stirling.software.SPDF.exception;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.net.URI;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.MessageSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;

import jakarta.servlet.http.HttpServletRequest;

@ExtendWith(MockitoExtension.class)
@DisplayName("SecurityExceptionHandler Tests")
class SecurityExceptionHandlerTest {

    @Mock private MessageSource messageSource;

    @Mock private HttpServletRequest request;

    @InjectMocks private SecurityExceptionHandler exceptionHandler;

    @BeforeEach
    void setUp() {
        when(messageSource.getMessage(anyString(), any(), anyString(), any()))
                .thenAnswer(invocation -> invocation.getArgument(2)); // Return default message
    }

    @Nested
    @DisplayName("Security Exceptions")
    class SecurityExceptionTests {

        @Test
        @DisplayName("AccessDeniedException returns 403 Forbidden")
        void testHandleAccessDenied() {
            when(request.getRequestURI()).thenReturn("/api/v1/admin/settings");
            org.springframework.security.access.AccessDeniedException ex =
                    new org.springframework.security.access.AccessDeniedException(
                            "Access is denied");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleAccessDenied(ex, request);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
            ProblemDetail detail = response.getBody();
            assertNotNull(detail);
            assertEquals(URI.create("/errors/access-denied"), detail.getType());
            assertEquals("Access Denied", detail.getTitle());
            assertNotNull(detail.getProperties().get("timestamp"));
            assertTrue(detail.getProperties().containsKey("hints"));
            assertTrue(detail.getProperties().containsKey("actionRequired"));
            assertNotNull(detail.getDetail());
        }

        @Test
        @DisplayName("AccessDeniedException with null message")
        void testHandleAccessDeniedWithNullMessage() {
            when(request.getRequestURI()).thenReturn("/api/v1/protected");
            org.springframework.security.access.AccessDeniedException ex =
                    new org.springframework.security.access.AccessDeniedException(null);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleAccessDenied(ex, request);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
            ProblemDetail detail = response.getBody();
            assertNotNull(detail);
            assertEquals("Access Denied", detail.getTitle());
        }

        @Test
        @DisplayName("AccessDeniedException with custom message")
        void testHandleAccessDeniedWithCustomMessage() {
            String customMessage = "Custom access denied message";
            when(request.getRequestURI()).thenReturn("/api/v1/restricted");
            org.springframework.security.access.AccessDeniedException ex =
                    new org.springframework.security.access.AccessDeniedException(customMessage);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleAccessDenied(ex, request);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
            ProblemDetail detail = response.getBody();
            assertNotNull(detail);
            assertEquals("Access Denied", detail.getTitle());
        }
    }

    @Nested
    @DisplayName("Edge Cases")
    class EdgeCaseTests {

        @Test
        @DisplayName("AccessDeniedException with empty message")
        void testHandleAccessDeniedWithEmptyMessage() {
            when(request.getRequestURI()).thenReturn("/api/v1/empty");
            org.springframework.security.access.AccessDeniedException ex =
                    new org.springframework.security.access.AccessDeniedException("");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleAccessDenied(ex, request);

            assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
            ProblemDetail detail = response.getBody();
            assertNotNull(detail);
            assertEquals("Access Denied", detail.getTitle());
        }
    }

    @Nested
    @DisplayName("RFC 7807 Compliance")
    class Rfc7807ComplianceTests {

        @Test
        @DisplayName("AccessDeniedException follows RFC 7807 structure")
        void testAccessDeniedRfc7807Compliance() {
            when(request.getRequestURI()).thenReturn("/api/v1/compliant");
            org.springframework.security.access.AccessDeniedException ex =
                    new org.springframework.security.access.AccessDeniedException(
                            "Access is denied");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleAccessDenied(ex, request);

            ProblemDetail detail = response.getBody();
            assertNotNull(detail);

            // RFC 7807 required fields
            assertNotNull(detail.getType());
            assertNotNull(detail.getTitle());
            assertNotNull(detail.getDetail());
            assertEquals(403, detail.getStatus());

            // Custom properties
            assertNotNull(detail.getProperties().get("timestamp"));
            assertNotNull(detail.getProperties().get("path"));
            assertEquals("/api/v1/compliant", detail.getProperties().get("path"));
        }
    }

    @Nested
    @DisplayName("Custom Properties")
    class CustomPropertiesTests {

        static Stream<Arguments> accessDeniedTestCases() {
            return Stream.of(
                    Arguments.of(
                            "/api/admin",
                            "Admin access denied",
                            "Access Denied",
                            URI.create("/errors/access-denied")),
                    Arguments.of(
                            "/api/user/profile",
                            "Profile access denied",
                            "Access Denied",
                            URI.create("/errors/access-denied")),
                    Arguments.of(
                            "/api/system",
                            "System access denied",
                            "Access Denied",
                            URI.create("/errors/access-denied")));
        }

        @Test
        @DisplayName("AccessDeniedException includes custom properties")
        void testAccessDeniedCustomProperties() {
            when(request.getRequestURI()).thenReturn("/api/v1/custom");
            org.springframework.security.access.AccessDeniedException ex =
                    new org.springframework.security.access.AccessDeniedException("Test");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleAccessDenied(ex, request);

            ProblemDetail detail = response.getBody();
            assertNotNull(detail);

            // Check custom properties are present
            assertTrue(detail.getProperties().containsKey("hints"));
            assertTrue(detail.getProperties().containsKey("actionRequired"));
            assertTrue(detail.getProperties().containsKey("title"));
        }

        @ParameterizedTest
        @MethodSource("accessDeniedTestCases")
        @DisplayName("AccessDeniedException various scenarios")
        void testAccessDeniedParameterized(
                String requestUri,
                String exceptionMessage,
                String expectedTitle,
                URI expectedType) {
            when(request.getRequestURI()).thenReturn(requestUri);
            org.springframework.security.access.AccessDeniedException ex =
                    new org.springframework.security.access.AccessDeniedException(exceptionMessage);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleAccessDenied(ex, request);

            ProblemDetail detail = response.getBody();
            assertNotNull(detail);
            assertEquals(expectedType, detail.getType());
            assertEquals(expectedTitle, detail.getTitle());
            assertEquals(requestUri, detail.getProperties().get("path"));
        }
    }
}
