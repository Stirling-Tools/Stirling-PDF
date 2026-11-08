package stirling.software.proprietary.security.filter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.JwtAuthenticationEntryPoint;
import stirling.software.proprietary.security.service.ApiKeyAuthenticationService;
import stirling.software.proprietary.security.service.CustomUserDetailsService;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.UserService;

@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterUserLookupTest {

    private static final String TOKEN = "valid-jwt";

    @Mock private JwtServiceInterface jwtService;
    @Mock private UserService userService;
    @Mock private CustomUserDetailsService userDetailsService;
    @Mock private ApiKeyAuthenticationService apiKeyAuthenticationService;

    private JwtAuthenticationFilter filter;
    private MockHttpServletRequest request;
    private MockHttpServletResponse response;
    private MockFilterChain chain;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();
        filter =
                new JwtAuthenticationFilter(
                        jwtService,
                        userService,
                        userDetailsService,
                        new JwtAuthenticationEntryPoint(),
                        new ApplicationProperties.Security(),
                        apiKeyAuthenticationService);
        request = new MockHttpServletRequest("GET", "/api/v1/proprietary/ui-data/account");
        response = new MockHttpServletResponse();
        chain = new MockFilterChain();
        when(jwtService.isJwtEnabled()).thenReturn(true);
        when(jwtService.extractToken(request)).thenReturn(TOKEN);
        when(jwtService.extractClaims(TOKEN)).thenReturn(Map.of("sub", "gone", "authType", "WEB"));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void deletedUserTokenIsUnauthorizedNotServerError() throws Exception {
        when(userDetailsService.loadUserByUsername("gone"))
                .thenThrow(new UsernameNotFoundException("No user found with username: gone"));

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString())
                .doesNotContain("UsernameNotFoundException")
                .doesNotContain("gone");
        assertThat(chain.getRequest()).isNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void lockedUserTokenIsUnauthorized() throws Exception {
        when(userDetailsService.loadUserByUsername("gone"))
                .thenThrow(new LockedException("locked"));

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(chain.getRequest()).isNull();
    }

    @Test
    void unexpectedFailureOnShareLinkDownloadLeavesTheRequestAnonymous() throws Exception {
        request.setRequestURI("/api/v1/storage/share-links/123e4567-e89b-12d3-a456-426614174000");
        when(userDetailsService.loadUserByUsername("gone"))
                .thenThrow(new IllegalStateException("lookup failed"));

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(chain.getRequest()).isSameAs(request);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }
}
