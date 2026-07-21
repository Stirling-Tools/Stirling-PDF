package stirling.software.saas.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.security.EnhancedJwtAuthenticationToken;

/**
 * Unit tests for {@link AuthenticationUtils}.
 *
 * <p>Covers the three extractors across every authentication shape they branch on: {@link
 * EnhancedJwtAuthenticationToken}, {@link ApiKeyAuthenticationToken}, a plain {@link
 * UsernamePasswordAuthenticationToken}, a raw {@link Jwt} principal, and the SecurityException
 * failure paths in {@code getCurrentUser}. {@link UserRepository} is mocked.
 */
@ExtendWith(MockitoExtension.class)
class AuthenticationUtilsTest {

    private static final UUID SUPABASE_UUID =
            UUID.fromString("11111111-2222-3333-4444-555555555555");
    private static final String EMAIL = "user@example.com";

    @Mock private UserRepository userRepository;

    private static Jwt jwt(Map<String, Object> claims) {
        return new Jwt(
                "token",
                Instant.now(),
                Instant.now().plusSeconds(3600),
                Map.of("alg", "none"),
                claims);
    }

    private static EnhancedJwtAuthenticationToken enhancedJwt(
            String email, String supabaseId, User user) {
        Jwt jwt = jwt(Map.of("sub", supabaseId == null ? "x" : supabaseId));
        return new EnhancedJwtAuthenticationToken(
                jwt, List.of(new SimpleGrantedAuthority("ROLE_USER")), email, supabaseId, user);
    }

    @Nested
    @DisplayName("extractSupabaseId")
    class ExtractSupabaseId {

        @Test
        @DisplayName("returns the supabase id for an EnhancedJwt token")
        void enhancedJwt_returnsSupabaseId() {
            Authentication auth = enhancedJwt(EMAIL, SUPABASE_UUID.toString(), null);

            assertThat(AuthenticationUtils.extractSupabaseId(auth))
                    .isEqualTo(SUPABASE_UUID.toString());
        }

        @Test
        @DisplayName("returns the name (from principal) for an ApiKey token")
        void apiKey_returnsName() {
            // Authenticated token derives getName() from the principal's toString.
            ApiKeyAuthenticationToken auth =
                    new ApiKeyAuthenticationToken("the-user", "api-key-123", List.of());

            assertThat(AuthenticationUtils.extractSupabaseId(auth)).isEqualTo("the-user");
        }

        @Test
        @DisplayName("falls back to getName() for other authentication types")
        void other_returnsName() {
            Authentication auth = new UsernamePasswordAuthenticationToken("bob", "pw", List.of());

            assertThat(AuthenticationUtils.extractSupabaseId(auth)).isEqualTo("bob");
        }
    }

    @Nested
    @DisplayName("extractEmail")
    class ExtractEmail {

        @Test
        @DisplayName("returns the email for an EnhancedJwt token")
        void enhancedJwt_returnsEmail() {
            Authentication auth = enhancedJwt(EMAIL, SUPABASE_UUID.toString(), null);

            assertThat(AuthenticationUtils.extractEmail(auth)).isEqualTo(EMAIL);
        }

        @Test
        @DisplayName("falls back to getName() for other authentication types")
        void other_returnsName() {
            Authentication auth = new UsernamePasswordAuthenticationToken("carol", "pw", List.of());

            assertThat(AuthenticationUtils.extractEmail(auth)).isEqualTo("carol");
        }
    }

    @Nested
    @DisplayName("getCurrentUser")
    class GetCurrentUser {

        @Test
        @DisplayName("throws when authentication is null")
        void nullAuth_throws() {
            assertThatThrownBy(() -> AuthenticationUtils.getCurrentUser(null, userRepository))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("Not authenticated");
        }

        @Test
        @DisplayName("returns the principal directly when it is already a User")
        void userPrincipal_returnedDirectly() {
            User user = new User();
            user.setId(7L);
            Authentication auth = new UsernamePasswordAuthenticationToken(user, "pw", List.of());

            assertThat(AuthenticationUtils.getCurrentUser(auth, userRepository)).isSameAs(user);
        }

        @Test
        @DisplayName("resolves an EnhancedJwt user via Supabase id lookup")
        void enhancedJwt_resolvedBySupabaseId() {
            User user = new User();
            user.setId(8L);
            // Principal is the raw Jwt (no resolved User) so the Supabase-id branch is exercised.
            Authentication auth = enhancedJwt(EMAIL, SUPABASE_UUID.toString(), null);
            when(userRepository.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.of(user));

            assertThat(AuthenticationUtils.getCurrentUser(auth, userRepository)).isSameAs(user);
        }

        @Test
        @DisplayName("throws when the EnhancedJwt Supabase id resolves to no user")
        void enhancedJwt_userNotFound() {
            Authentication auth = enhancedJwt(EMAIL, SUPABASE_UUID.toString(), null);
            when(userRepository.findBySupabaseId(SUPABASE_UUID)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("User not found");
        }

        @Test
        @DisplayName("throws when the EnhancedJwt Supabase id is not a valid UUID")
        void enhancedJwt_invalidUuid() {
            Authentication auth = enhancedJwt(EMAIL, "not-a-uuid", null);

            assertThatThrownBy(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("Invalid Supabase ID format");
        }

        @Test
        @DisplayName("resolves a String principal via findByUsername")
        void stringPrincipal_resolvedByUsername() {
            User user = new User();
            user.setId(9L);
            Authentication auth = new UsernamePasswordAuthenticationToken("dave", "pw", List.of());
            when(userRepository.findByUsername("dave")).thenReturn(Optional.of(user));

            assertThat(AuthenticationUtils.getCurrentUser(auth, userRepository)).isSameAs(user);
        }

        @Test
        @DisplayName("throws when a String principal resolves to no user")
        void stringPrincipal_userNotFound() {
            Authentication auth = new UsernamePasswordAuthenticationToken("erin", "pw", List.of());
            when(userRepository.findByUsername("erin")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("User not found");
        }

        @Test
        @DisplayName("resolves a raw Jwt principal via the email claim")
        void jwtPrincipal_resolvedByEmail() {
            User user = new User();
            user.setId(10L);
            Jwt rawJwt = jwt(Map.of("sub", "abc", "email", EMAIL));
            Authentication auth = new UsernamePasswordAuthenticationToken(rawJwt, "pw", List.of());
            when(userRepository.findByUsername(EMAIL)).thenReturn(Optional.of(user));

            assertThat(AuthenticationUtils.getCurrentUser(auth, userRepository)).isSameAs(user);
        }

        @Test
        @DisplayName("throws when a raw Jwt principal email resolves to no user")
        void jwtPrincipal_emailUserNotFound() {
            Jwt rawJwt = jwt(Map.of("sub", "abc", "email", EMAIL));
            Authentication auth = new UsernamePasswordAuthenticationToken(rawJwt, "pw", List.of());
            when(userRepository.findByUsername(EMAIL)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("User not found");
        }

        @Test
        @DisplayName("throws invalid-principal when a raw Jwt has no email claim")
        void jwtPrincipal_noEmail_invalidPrincipal() {
            Jwt rawJwt = jwt(Map.of("sub", "abc"));
            Authentication auth = new UsernamePasswordAuthenticationToken(rawJwt, "pw", List.of());

            assertThatThrownBy(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("Invalid authentication principal");
        }

        @Test
        @DisplayName("throws invalid-principal for an unrecognised principal type")
        void unknownPrincipal_invalidPrincipal() {
            Authentication auth = new UsernamePasswordAuthenticationToken(123, "pw", List.of());

            assertThatThrownBy(() -> AuthenticationUtils.getCurrentUser(auth, userRepository))
                    .isInstanceOf(SecurityException.class)
                    .hasMessageContaining("Invalid authentication principal")
                    .hasMessageContaining("Integer");
        }
    }
}
