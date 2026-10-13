package stirling.software.proprietary.mcp.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;

/** Which Stirling account an MCP token is bound to. */
class McpUserBindingFilterTest {

    private final UserService users = mock(UserService.class);

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void supabaseSubjectWins_soAChangedEmailStillReachesItsOwnAccount() throws Exception {
        UUID id = UUID.randomUUID();
        when(users.findBySupabaseId(id)).thenReturn(Optional.of(user("old@example.com")));
        when(users.findByUsernameIgnoreCase(any())).thenReturn(Optional.empty());

        Authentication bound = run(token(id.toString(), "new@example.com"));

        assertEquals("old@example.com", bound.getName());
    }

    @Test
    void nonUuidSubjectsFallBackToTheUsernameClaim() throws Exception {
        when(users.findByUsernameIgnoreCase("alice@example.com"))
                .thenReturn(Optional.of(user("alice@example.com")));

        Authentication bound = run(token("keycloak-subject", "alice@example.com"));

        assertEquals("alice@example.com", bound.getName());
    }

    @Test
    void noMatchingAccountIsRefused() throws Exception {
        when(users.findByUsernameIgnoreCase(any())).thenReturn(Optional.empty());
        SecurityContextHolder.getContext().setAuthentication(token("x", "nobody@example.com"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        new McpUserBindingFilter(users, "email", true)
                .doFilter(new MockHttpServletRequest(), response, chain);

        assertEquals(403, response.getStatus());
        assertNull(chain.getRequest());
    }

    @Test
    void anEmailNowUsedBySomeoneElseDoesNotReachTheOldAccount() throws Exception {
        User previousOwner = user("old@example.com");
        previousOwner.setSupabaseId(UUID.randomUUID());
        when(users.findBySupabaseId(any())).thenReturn(Optional.empty());
        when(users.findByUsernameIgnoreCase("old@example.com"))
                .thenReturn(Optional.of(previousOwner));

        assertEquals(403, status(token(UUID.randomUUID().toString(), "old@example.com")));
    }

    @Test
    void guestSessionsAreToldToSignIn() throws Exception {
        Jwt jwt =
                Jwt.withTokenValue("t")
                        .header("alg", "RS256")
                        .subject(UUID.randomUUID().toString())
                        .claim("is_anonymous", true)
                        .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
        MockHttpServletResponse response = new MockHttpServletResponse();

        new McpUserBindingFilter(users, "email", true)
                .doFilter(new MockHttpServletRequest(), response, new MockFilterChain());

        assertEquals(403, response.getStatus());
        assertTrue(response.getContentAsString().contains("Guest sessions"));
    }

    private int status(JwtAuthenticationToken token) throws Exception {
        SecurityContextHolder.getContext().setAuthentication(token);
        MockHttpServletResponse response = new MockHttpServletResponse();
        new McpUserBindingFilter(users, "email", true)
                .doFilter(new MockHttpServletRequest(), response, new MockFilterChain());
        return response.getStatus();
    }

    private Authentication run(JwtAuthenticationToken token) throws Exception {
        SecurityContextHolder.getContext().setAuthentication(token);
        new McpUserBindingFilter(users, "email", true)
                .doFilter(
                        new MockHttpServletRequest(),
                        new MockHttpServletResponse(),
                        new MockFilterChain());
        return SecurityContextHolder.getContext().getAuthentication();
    }

    private static JwtAuthenticationToken token(String subject, String email) {
        Jwt jwt =
                Jwt.withTokenValue("t")
                        .header("alg", "RS256")
                        .subject(subject)
                        .claim("email", email)
                        .build();
        return new JwtAuthenticationToken(jwt, List.of());
    }

    private static User user(String username) {
        User user = new User();
        user.setUsername(username);
        user.setEnabled(true);
        return user;
    }
}
