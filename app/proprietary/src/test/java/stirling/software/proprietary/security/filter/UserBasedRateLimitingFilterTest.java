package stirling.software.proprietary.security.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.common.cluster.RateLimitStore;
import stirling.software.common.cluster.inprocess.InProcessRateLimitStore;
import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;

@ExtendWith(MockitoExtension.class)
@DisplayName("UserBasedRateLimitingFilter")
class UserBasedRateLimitingFilterTest {

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(String username, Role role) {
        User u = new User();
        u.setUsername(username);
        u.setEnabled(true);
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new ApiKeyAuthenticationToken(
                                u,
                                "irrelevant",
                                List.of(new SimpleGrantedAuthority(role.getRoleId()))));
    }

    private MockHttpServletResponse apiPost(UserBasedRateLimitingFilter filter, String apiKey)
            throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/general/x");
        req.addHeader("X-API-KEY", apiKey);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, new MockFilterChain());
        return res;
    }

    private long remainingAfterApiPost(UserBasedRateLimitingFilter filter, String apiKey)
            throws Exception {
        return Long.parseLong(apiPost(filter, apiKey).getHeader("X-Rate-Limit-Remaining"));
    }

    private UserBasedRateLimitingFilter enabledFilter() {
        return new UserBasedRateLimitingFilter(true, new InProcessRateLimitStore());
    }

    @Test
    @DisplayName("all of a user's keys share ONE bucket - minting keys can't multiply the quota")
    void keysShareOnePerUserBucket() throws Exception {
        UserBasedRateLimitingFilter filter = enabledFilter();
        authenticateAs("alice", Role.EXTRA_LIMITED_API_USER);

        long afterKeyA = remainingAfterApiPost(filter, "key-A");
        long afterKeyB = remainingAfterApiPost(filter, "key-B"); // different key, same user

        // The second (different) key drew from the SAME per-user bucket, so remaining fell by one.
        // If it were keyed per-API-key, both would report the same remaining.
        assertThat(afterKeyB).isEqualTo(afterKeyA - 1);
    }

    @Test
    @DisplayName("counting goes through the RateLimitStore, so a cluster shares one quota")
    void consumesFromTheBackplaneStore() throws Exception {
        List<String> keys = new ArrayList<>();
        RateLimitStore store =
                (bucketKey, capacity, refillPeriod) -> {
                    keys.add(bucketKey + "|" + capacity + "|" + refillPeriod);
                    return new RateLimitStore.RateLimitDecision(true, 7L, 0L);
                };
        UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true, store);
        authenticateAs("alice", Role.EXTRA_LIMITED_API_USER);

        assertThat(remainingAfterApiPost(filter, "key-A")).isEqualTo(7L);
        assertThat(keys).containsExactly("api:alice|20|" + Duration.ofDays(1));
    }

    @Test
    @DisplayName("web and API calls draw from separate quotas")
    void webAndApiBucketsAreSeparate() throws Exception {
        List<String> keys = new ArrayList<>();
        RateLimitStore store =
                (bucketKey, capacity, refillPeriod) -> {
                    keys.add(bucketKey);
                    return new RateLimitStore.RateLimitDecision(true, 1L, 0L);
                };
        UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true, store);
        authenticateAs("alice", Role.EXTRA_LIMITED_API_USER);

        apiPost(filter, "key-A");
        MockHttpServletRequest webReq = new MockHttpServletRequest("POST", "/api/v1/general/x");
        filter.doFilter(webReq, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(keys).containsExactly("api:alice", "web:alice");
    }

    @Test
    @DisplayName("unauthenticated POST passes through instead of throwing")
    void unauthenticatedPostPassesThrough() throws Exception {
        // Regression guard: this used to throw IllegalStateException("User does not have a valid
        // role."), which turned every permit-all POST - login included - into a 500.
        UserBasedRateLimitingFilter filter = enabledFilter();
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/auth/login");
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(req, res, chain);

        assertThat(chain.getRequest()).isNotNull();
        assertThat(res.getStatus()).isEqualTo(200);
        assertThat(res.getHeader("X-Rate-Limit-Remaining")).isNull();
    }

    @Test
    @DisplayName("anonymous authentication is treated as unauthenticated, not as an error")
    void anonymousPostPassesThrough() throws Exception {
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new AnonymousAuthenticationToken(
                                "key",
                                "anonymousUser",
                                List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));
        UserBasedRateLimitingFilter filter = enabledFilter();
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/auth/login");
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(req, res, chain);

        assertThat(chain.getRequest()).isNotNull();
        assertThat(res.getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("unlimited roles never touch the backplane")
    void unlimitedRolesSkipTheStore() throws Exception {
        RateLimitStore store = mock(RateLimitStore.class);
        UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true, store);
        authenticateAs("alice", Role.USER);

        MockHttpServletResponse res = apiPost(filter, "key-A");

        verify(store, never()).tryConsume(anyString(), anyLong(), any());
        assertThat(res.getHeader("X-Rate-Limit-Remaining")).isNull();
    }

    @Test
    @DisplayName("exhausted quota returns 429 with a retry hint")
    void exhaustedQuotaReturns429() throws Exception {
        RateLimitStore store =
                (bucketKey, capacity, refillPeriod) ->
                        new RateLimitStore.RateLimitDecision(false, 0L, 90_000_000_000L);
        UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true, store);
        authenticateAs("alice", Role.EXTRA_LIMITED_API_USER);

        MockHttpServletResponse res = apiPost(filter, "key-A");

        assertThat(res.getStatus()).isEqualTo(429);
        assertThat(res.getHeader("X-Rate-Limit-Retry-After-Seconds")).isEqualTo("90");
    }

    @Test
    @DisplayName("an unreachable backplane fails open rather than 500ing every POST")
    void backplaneFailureFailsOpen() throws Exception {
        RateLimitStore store = mock(RateLimitStore.class);
        when(store.tryConsume(anyString(), anyLong(), any()))
                .thenThrow(new IllegalStateException("valkey down"));
        UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true, store);
        authenticateAs("alice", Role.EXTRA_LIMITED_API_USER);

        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/general/x");
        req.addHeader("X-API-KEY", "key-A");
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(req, res, chain);

        assertThat(chain.getRequest()).isNotNull();
        assertThat(res.getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("non-POST requests are not rate limited")
    void nonPostPassesThrough() throws Exception {
        UserBasedRateLimitingFilter filter = enabledFilter();
        authenticateAs("alice", Role.EXTRA_LIMITED_API_USER);
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/general/x");
        req.addHeader("X-API-KEY", "key-A");
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(req, res, chain);

        assertThat(res.getHeader("X-Rate-Limit-Remaining")).isNull();
        assertThat(chain.getRequest()).isNotNull(); // passed down the chain
    }

    @Test
    @DisplayName("rate limiting disabled: passes through untouched")
    void disabledPassesThrough() throws Exception {
        RateLimitStore store = mock(RateLimitStore.class);
        UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(false, store);
        authenticateAs("alice", Role.EXTRA_LIMITED_API_USER);
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/general/x");
        req.addHeader("X-API-KEY", "key-A");
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, new MockFilterChain());

        assertThat(res.getHeader("X-Rate-Limit-Remaining")).isNull();
        verify(store, never()).tryConsume(anyString(), anyLong(), any());
    }
}
