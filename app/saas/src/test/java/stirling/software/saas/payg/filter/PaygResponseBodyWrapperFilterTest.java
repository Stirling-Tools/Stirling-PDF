package stirling.software.saas.payg.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockAsyncContext;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import jakarta.servlet.AsyncEvent;
import jakarta.servlet.AsyncListener;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/**
 * Tests for {@link PaygResponseBodyWrapperFilter}: the enabled/disabled gate, the synchronous
 * close-in-finally path, the fail-open behaviour when wrapper construction throws, and the async
 * branch that defers cleanup to a {@code ReleaseOnAsyncComplete} listener.
 */
class PaygResponseBodyWrapperFilterTest {

    private final TempFileManager tempFileManager =
            new TempFileManager(new TempFileRegistry(), new ApplicationProperties());

    private PaygResponseBodyWrapperFilter filter(boolean enabled) {
        PaygFilterProperties props = new PaygFilterProperties();
        props.setEnabled(enabled);
        return new PaygResponseBodyWrapperFilter(tempFileManager, props);
    }

    @Test
    @DisplayName("REQUEST_ATTRIBUTE key is derived from the class name")
    void requestAttributeKey() {
        assertThat(PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE)
                .isEqualTo(PaygResponseBodyWrapperFilter.class.getName() + ".WRAPPER");
    }

    @Test
    @DisplayName("disabled: passes the original response through, no wrapper attribute set")
    void disabled_passesThrough() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter(false).doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        assertThat(request.getAttribute(PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE)).isNull();
    }

    @Nested
    @DisplayName("enabled")
    class Enabled {

        @Test
        @DisplayName(
                "wraps the response, exposes it as an attribute, then removes + closes on sync")
        void sync_wrapsAndClosesInFinally() throws ServletException, IOException {
            MockHttpServletRequest request = new MockHttpServletRequest();
            MockHttpServletResponse response = new MockHttpServletResponse();

            // Capture the wrapper visible mid-chain; after the chain returns (sync) it is removed.
            Object[] seenMidChain = new Object[1];
            FilterChain chain =
                    (req, res) ->
                            seenMidChain[0] =
                                    request.getAttribute(
                                            PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE);

            filter(true).doFilter(request, response, chain);

            assertThat(seenMidChain[0]).isInstanceOf(PaygResponseBodyWrapper.class);
            // Sync request: not async-started, so the attribute is removed in the finally block.
            assertThat(request.getAttribute(PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE))
                    .isNull();
        }

        @Test
        @DisplayName("the chain receives the wrapper, not the raw response")
        void chainReceivesWrapper() throws ServletException, IOException {
            MockHttpServletRequest request = new MockHttpServletRequest();
            MockHttpServletResponse response = new MockHttpServletResponse();
            Object[] passedResponse = new Object[1];
            FilterChain chain = (req, res) -> passedResponse[0] = res;

            filter(true).doFilter(request, response, chain);

            assertThat(passedResponse[0]).isInstanceOf(PaygResponseBodyWrapper.class);
        }

        @Test
        @DisplayName("async request: defers cleanup to an AsyncListener, attribute survives chain")
        void async_registersListenerAndKeepsAttribute() throws ServletException, IOException {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setAsyncSupported(true);
            MockHttpServletResponse response = new MockHttpServletResponse();

            // startAsync() (called inside the chain) creates the live async context the filter then
            // registers its listener on; isAsyncStarted() reads true afterwards.
            FilterChain chain = (req, res) -> request.startAsync();

            filter(true).doFilter(request, response, chain);

            // Async branch: the attribute is NOT removed in the finally; a listener owns cleanup.
            assertThat(request.getAttribute(PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE))
                    .isInstanceOf(PaygResponseBodyWrapper.class);
            MockAsyncContext ctx = (MockAsyncContext) request.getAsyncContext();
            assertThat(ctx.getListeners()).hasSize(1);
            assertThat(ctx.getListeners().get(0).getClass().getSimpleName())
                    .isEqualTo("ReleaseOnAsyncComplete");
        }

        @Test
        @DisplayName("async listener removes the attribute and closes the wrapper on completion")
        void asyncListener_releasesOnComplete() throws ServletException, IOException {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setAsyncSupported(true);
            MockHttpServletResponse response = new MockHttpServletResponse();

            FilterChain chain = (req, res) -> request.startAsync();
            filter(true).doFilter(request, response, chain);

            MockAsyncContext ctx = (MockAsyncContext) request.getAsyncContext();
            AsyncListener listener = ctx.getListeners().get(0);
            listener.onComplete(new AsyncEvent(ctx));

            assertThat(request.getAttribute(PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE))
                    .isNull();
        }

        @Test
        @DisplayName("async listener also releases on timeout and on error; startAsync is a no-op")
        void asyncListener_releasesOnTimeoutAndError() throws ServletException, IOException {
            // onTimeout
            MockHttpServletRequest reqTimeout = new MockHttpServletRequest();
            reqTimeout.setAsyncSupported(true);
            MockHttpServletResponse resp = new MockHttpServletResponse();
            filter(true).doFilter(reqTimeout, resp, (req, res) -> reqTimeout.startAsync());
            MockAsyncContext ctxTimeout = (MockAsyncContext) reqTimeout.getAsyncContext();
            AsyncListener tl = ctxTimeout.getListeners().get(0);
            tl.onStartAsync(new AsyncEvent(ctxTimeout)); // no-op, must not throw
            tl.onTimeout(new AsyncEvent(ctxTimeout));
            assertThat(reqTimeout.getAttribute(PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE))
                    .isNull();

            // onError
            MockHttpServletRequest reqError = new MockHttpServletRequest();
            reqError.setAsyncSupported(true);
            MockHttpServletResponse resp2 = new MockHttpServletResponse();
            filter(true).doFilter(reqError, resp2, (req, res) -> reqError.startAsync());
            MockAsyncContext ctxError = (MockAsyncContext) reqError.getAsyncContext();
            AsyncListener el = ctxError.getListeners().get(0);
            el.onError(new AsyncEvent(ctxError));
            assertThat(reqError.getAttribute(PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE))
                    .isNull();
        }

        @Test
        @DisplayName("wrapper construction failure: fail-open, chain runs with the raw response")
        void constructionFailure_failsOpen() throws ServletException, IOException {
            // The wrapper is built inside a try that catches RuntimeException. Make the threshold
            // read (properties.getResponse()) throw so the catch's fail-open branch is taken.
            PaygFilterProperties props = mock(PaygFilterProperties.class);
            when(props.isEnabled()).thenReturn(true);
            when(props.getResponse()).thenThrow(new IllegalStateException("boom"));
            PaygResponseBodyWrapperFilter filter =
                    new PaygResponseBodyWrapperFilter(tempFileManager, props);

            MockHttpServletRequest request = new MockHttpServletRequest();
            MockHttpServletResponse response = new MockHttpServletResponse();
            FilterChain chain = mock(FilterChain.class);

            filter.doFilter(request, response, chain);

            // Fail-open: chain still ran with the original (unwrapped) response.
            verify(chain).doFilter(request, response);
            assertThat(request.getAttribute(PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE))
                    .isNull();
        }

        @Test
        @DisplayName("propagates a ServletException thrown by the downstream chain")
        void propagatesChainException() throws ServletException, IOException {
            MockHttpServletRequest request = new MockHttpServletRequest();
            MockHttpServletResponse response = new MockHttpServletResponse();
            FilterChain chain = mock(FilterChain.class);
            doThrow(new ServletException("downstream")).when(chain).doFilter(any(), any());

            org.assertj.core.api.Assertions.assertThatThrownBy(
                            () -> filter(true).doFilter(request, response, chain))
                    .isInstanceOf(ServletException.class);

            // Even on exception, the finally block removed the attribute (sync path).
            assertThat(request.getAttribute(PaygResponseBodyWrapperFilter.REQUEST_ATTRIBUTE))
                    .isNull();
        }
    }
}
