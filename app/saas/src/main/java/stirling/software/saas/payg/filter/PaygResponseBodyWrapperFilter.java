package stirling.software.saas.payg.filter;

import java.io.IOException;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.AsyncEvent;
import jakarta.servlet.AsyncListener;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.TempFileManager;

/**
 * Wraps the {@link HttpServletResponse} with a {@link PaygResponseBodyWrapper} for every request,
 * making the response body retrievable by the downstream {@code PaygChargeInterceptor} in {@code
 * afterCompletion}. The wrapper is stashed as a request attribute under {@link #REQUEST_ATTRIBUTE}
 * so the interceptor can find it.
 *
 * <p>Pure plumbing — no business logic. When {@code payg.filter.enabled=false} the filter passes
 * through unchanged.
 *
 * <p>Lifecycle: the wrapper is closed in a {@code finally} after the chain returns for sync
 * requests; for async controllers ({@code DeferredResult}, {@code CompletableFuture}), close is
 * deferred to an {@link AsyncListener} so the wrapper survives the async window. Close is
 * idempotent so a defensive call by the interceptor's {@code afterCompletion} is harmless.
 */
@Slf4j
@Component
@Profile("saas")
public class PaygResponseBodyWrapperFilter extends OncePerRequestFilter {

    /** Request-attribute key under which the wrapper is exposed to the interceptor. */
    public static final String REQUEST_ATTRIBUTE =
            PaygResponseBodyWrapperFilter.class.getName() + ".WRAPPER";

    private final TempFileManager tempFileManager;
    private final PaygFilterProperties properties;

    public PaygResponseBodyWrapperFilter(
            TempFileManager tempFileManager, PaygFilterProperties properties) {
        this.tempFileManager = tempFileManager;
        this.properties = properties;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        if (!properties.isEnabled()) {
            chain.doFilter(request, response);
            return;
        }

        PaygResponseBodyWrapper wrapper;
        try {
            wrapper =
                    new PaygResponseBodyWrapper(
                            response,
                            tempFileManager,
                            properties.getResponse().getInMemoryThresholdBytes());
        } catch (RuntimeException e) {
            // Wrapper construction failure: fail-open. Pass through unwrapped — OUTPUT recording
            // is lost but the customer's tool call still runs.
            log.warn("PaygResponseBodyWrapper construction failed; passing through unwrapped", e);
            chain.doFilter(request, response);
            return;
        }

        request.setAttribute(REQUEST_ATTRIBUTE, wrapper);
        boolean asyncStarted = false;
        try {
            chain.doFilter(request, wrapper);
            asyncStarted = request.isAsyncStarted();
            if (asyncStarted) {
                // Async controller: defer attribute removal + close to async dispatch completion.
                // The interceptor's afterCompletion fires on the async dispatch and needs the
                // wrapper attribute still present at that point. close() is idempotent so a
                // defensive call by the interceptor is harmless.
                request.getAsyncContext().addListener(new ReleaseOnAsyncComplete(request, wrapper));
            }
        } finally {
            if (!asyncStarted) {
                // Sync path: interceptor.afterCompletion has already run inside chain.doFilter.
                request.removeAttribute(REQUEST_ATTRIBUTE);
                wrapper.close();
            }
        }
    }

    /**
     * For async dispatches, removes the wrapper attribute and closes the wrapper after the async
     * dispatch completes. The Servlet container fires exactly one of {@code onComplete} / {@code
     * onError} / {@code onTimeout} per async context lifecycle.
     */
    private static final class ReleaseOnAsyncComplete implements AsyncListener {

        private final HttpServletRequest request;
        private final PaygResponseBodyWrapper wrapper;

        ReleaseOnAsyncComplete(HttpServletRequest request, PaygResponseBodyWrapper wrapper) {
            this.request = request;
            this.wrapper = wrapper;
        }

        private void release() {
            request.removeAttribute(REQUEST_ATTRIBUTE);
            wrapper.close();
        }

        @Override
        public void onComplete(AsyncEvent event) {
            release();
        }

        @Override
        public void onTimeout(AsyncEvent event) {
            release();
        }

        @Override
        public void onError(AsyncEvent event) {
            release();
        }

        @Override
        public void onStartAsync(AsyncEvent event) {
            // re-dispatch retains the listener — no-op
        }
    }
}
