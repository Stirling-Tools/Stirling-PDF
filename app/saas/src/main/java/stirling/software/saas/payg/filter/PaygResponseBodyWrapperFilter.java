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
                // Async controller: defer close to async dispatch completion. The interceptor's
                // afterCompletion will run AFTER the async work resolves, and that close() is
                // idempotent with this listener's.
                request.getAsyncContext().addListener(new CloseOnAsyncComplete(wrapper));
            }
        } finally {
            request.removeAttribute(REQUEST_ATTRIBUTE);
            if (!asyncStarted) {
                wrapper.close();
            }
        }
    }

    /**
     * Closes the wrapper after the async dispatch completes — covers normal completion, error, and
     * timeout paths. Servlet container fires exactly one of {@code onComplete} / {@code onError} /
     * {@code onTimeout} per async context lifecycle.
     */
    private static final class CloseOnAsyncComplete implements AsyncListener {

        private final PaygResponseBodyWrapper wrapper;

        CloseOnAsyncComplete(PaygResponseBodyWrapper wrapper) {
            this.wrapper = wrapper;
        }

        @Override
        public void onComplete(AsyncEvent event) {
            wrapper.close();
        }

        @Override
        public void onTimeout(AsyncEvent event) {
            wrapper.close();
        }

        @Override
        public void onError(AsyncEvent event) {
            wrapper.close();
        }

        @Override
        public void onStartAsync(AsyncEvent event) {
            // re-dispatch retains the listener — no-op
        }
    }
}
