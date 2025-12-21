package stirling.software.proprietary.web;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.*;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;

/**
 * Tests for {@link CorrelationIdFilter}.
 *
 * <p>Important notes: - The filter sets MDC in the try block and clears it in the finally block.
 * Therefore, we capture the MDC values inside a special FilterChain before the clear happens
 * (snapshot). - The response header is sanitized via Newlines.stripAll(id). The current code does
 * NOT sanitize the value stored in the MDC or the request attribute. These tests reflect the
 * current behavior.
 */
class CorrelationIdFilterTest {

    private CorrelationIdFilter filter;
    private MockHttpServletRequest request;
    private MockHttpServletResponse response;

    /** Chain that snapshots the MDC and header/attribute values during doFilter(). */
    static class CapturingFilterChain implements FilterChain {
        final Map<String, String> capturedMdc = new HashMap<>();
        String responseHeader;
        Object requestAttr;
        boolean called = false;

        @Override
        public void doFilter(ServletRequest req, ServletResponse res)
                throws IOException, ServletException {
            called = true;
            // Snapshot: MDC and request attributes during chain execution
            capturedMdc.put(CorrelationIdFilter.MDC_KEY, MDC.get(CorrelationIdFilter.MDC_KEY));
            requestAttr = ((MockHttpServletRequest) req).getAttribute(CorrelationIdFilter.MDC_KEY);
            responseHeader = ((MockHttpServletResponse) res).getHeader(CorrelationIdFilter.HEADER);
        }
    }

    /** Variant that intentionally throws an exception after capturing (to test cleanup). */
    static class ThrowingAfterCaptureChain extends CapturingFilterChain {
        @Override
        public void doFilter(ServletRequest req, ServletResponse res)
                throws IOException, ServletException {
            super.doFilter(req, res);
            throw new IOException("boom");
        }
    }

    @BeforeEach
    void setUp() {
        filter = new CorrelationIdFilter();
        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();
        MDC.clear();
    }

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    @Nested
    @DisplayName("Existing X-Request-Id header")
    class ExistingHeader {

        @Test
        @DisplayName(
                "Should propagate existing ID unchanged to MDC & request attribute, and set it in"
                        + " the response header")
        void shouldPropagateExistingId() throws ServletException, IOException {
            String givenId = "abc-123";
            request.addHeader(CorrelationIdFilter.HEADER, givenId);

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(request, response, chain);

            assertTrue(chain.called);
            // Set during the chain
            assertEquals(givenId, chain.capturedMdc.get(CorrelationIdFilter.MDC_KEY));
            assertEquals(givenId, chain.requestAttr);
            assertEquals(givenId, chain.responseHeader);

            // Cleared afterwards
            assertNull(MDC.get(CorrelationIdFilter.MDC_KEY));
        }

        @Test
        @DisplayName(
                "Should strip newlines only in the response header, leaving MDC/attribute"
                        + " unsanitized (per current code)")
        void shouldStripNewlinesOnlyInResponseHeader() throws ServletException, IOException {
            String raw = "id-with\r\nnewlines";
            String expectedSanitized = "id-withnewlines"; // Newlines removed
            request.addHeader(CorrelationIdFilter.HEADER, raw);

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(request, response, chain);

            // MDC & request attribute get the raw value (per implementation)
            assertEquals(raw, chain.capturedMdc.get(CorrelationIdFilter.MDC_KEY));
            assertEquals(raw, chain.requestAttr);
            // Response header is sanitized
            assertEquals(expectedSanitized, chain.responseHeader);

            assertNull(MDC.get(CorrelationIdFilter.MDC_KEY));
        }
    }

    @Nested
    @DisplayName("Missing or blank header")
    class MissingOrBlankHeader {

        @Test
        @DisplayName("Should generate UUID when header is missing")
        void shouldGenerateUuidWhenHeaderMissing() throws ServletException, IOException {
            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(request, response, chain);

            assertTrue(chain.called);

            // Consistency: same value in MDC, request attribute, and response header (no newline
            // removal needed)
            String mdcId = chain.capturedMdc.get(CorrelationIdFilter.MDC_KEY);
            assertNotNull(mdcId);
            assertEquals(mdcId, chain.requestAttr);
            assertEquals(mdcId, chain.responseHeader);

            // UUID format check
            assertDoesNotThrow(() -> UUID.fromString(mdcId));

            assertNull(MDC.get(CorrelationIdFilter.MDC_KEY));
        }

        @Test
        @DisplayName("Should generate UUID when header is blank/whitespace")
        void shouldGenerateUuidWhenHeaderBlank() throws ServletException, IOException {
            request.addHeader(CorrelationIdFilter.HEADER, "   \t  ");

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(request, response, chain);

            String mdcId = chain.capturedMdc.get(CorrelationIdFilter.MDC_KEY);
            assertNotNull(mdcId);
            assertEquals(mdcId, chain.requestAttr);
            assertEquals(mdcId, chain.responseHeader);
            assertDoesNotThrow(() -> UUID.fromString(mdcId));

            assertNull(MDC.get(CorrelationIdFilter.MDC_KEY));
        }
    }

    @Nested
    @DisplayName("Cleanup logic (finally)")
    class CleanupBehavior {

        @Test
        @DisplayName("Should clear MDC even when FilterChain throws")
        void shouldClearMdcOnException() throws ServletException, IOException {
            request.addHeader(CorrelationIdFilter.HEADER, "req-1");
            ThrowingAfterCaptureChain chain = new ThrowingAfterCaptureChain();

            IOException ex =
                    assertThrows(
                            IOException.class,
                            () -> filter.doFilterInternal(request, response, chain));
            assertEquals("boom", ex.getMessage());

            // Was set during the chain…
            assertEquals("req-1", chain.capturedMdc.get(CorrelationIdFilter.MDC_KEY));
            // …and cleared afterwards.
            assertNull(MDC.get(CorrelationIdFilter.MDC_KEY));
        }
    }
}
