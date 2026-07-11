package stirling.software.proprietary.security.filter;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

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

    private void authenticateAs(String username) {
        User u = new User();
        u.setUsername(username);
        u.setEnabled(true);
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new ApiKeyAuthenticationToken(
                                u,
                                "irrelevant",
                                List.of(new SimpleGrantedAuthority(Role.USER.getRoleId()))));
    }

    private long remainingAfterApiPost(UserBasedRateLimitingFilter filter, String apiKey)
            throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/general/x");
        req.addHeader("X-API-KEY", apiKey);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, new MockFilterChain());
        return Long.parseLong(res.getHeader("X-Rate-Limit-Remaining"));
    }

    @Test
    @DisplayName("all of a user's keys share ONE bucket - minting keys can't multiply the quota")
    void keysShareOnePerUserBucket() throws Exception {
        UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
        authenticateAs("alice");

        long afterKeyA = remainingAfterApiPost(filter, "key-A");
        long afterKeyB = remainingAfterApiPost(filter, "key-B"); // different key, same user

        // The second (different) key drew from the SAME per-user bucket, so remaining fell by one.
        // If it were keyed per-API-key, both would report the same remaining.
        assertThat(afterKeyB).isEqualTo(afterKeyA - 1);
    }

    @Test
    @DisplayName("non-POST requests are not rate limited")
    void nonPostPassesThrough() throws Exception {
        UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(true);
        authenticateAs("alice");
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
        UserBasedRateLimitingFilter filter = new UserBasedRateLimitingFilter(false);
        authenticateAs("alice");
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/general/x");
        req.addHeader("X-API-KEY", "key-A");
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, new MockFilterChain());

        assertThat(res.getHeader("X-Rate-Limit-Remaining")).isNull();
    }
}
