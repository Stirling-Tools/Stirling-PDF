package stirling.software.proprietary.security.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class IPRateLimitingFilterTest {

    @Test
    void successfulCallbackIsSignalledOnce() throws Exception {
        AtomicInteger attempts = new AtomicInteger();
        IPRateLimitingFilter filter =
                new IPRateLimitingFilter(1000, 1000, attempts::incrementAndGet);

        filter.doFilter(apiRequest(), new MockHttpServletResponse(), new MockFilterChain());
        filter.doFilter(apiRequest(), new MockHttpServletResponse(), new MockFilterChain());

        assertEquals(1, attempts.get());
    }

    @Test
    void failedCallbackIsRetriedOnTheNextRequest() throws Exception {
        AtomicInteger attempts = new AtomicInteger();
        IPRateLimitingFilter filter =
                new IPRateLimitingFilter(
                        1000,
                        1000,
                        () -> {
                            attempts.incrementAndGet();
                            throw new IllegalStateException("scheduler unavailable");
                        });

        filter.doFilter(apiRequest(), new MockHttpServletResponse(), new MockFilterChain());
        assertEquals(1, attempts.get());

        filter.doFilter(apiRequest(), new MockHttpServletResponse(), new MockFilterChain());
        assertEquals(2, attempts.get(), "a failed first-use callback must be retried");
    }

    private static MockHttpServletRequest apiRequest() {
        return new MockHttpServletRequest("POST", "/api/v1/general/rotate-pdf");
    }
}
