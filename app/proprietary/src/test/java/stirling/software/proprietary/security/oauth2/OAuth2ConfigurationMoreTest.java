package stirling.software.proprietary.security.oauth2;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.user.OAuth2UserAuthority;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.exception.NoProviderFoundException;
import stirling.software.proprietary.security.service.UserService;

/**
 * Behavioural tests for {@link OAuth2Configuration}. Exercises the offline GitHub registration
 * path, the no-provider failure, and the granted-authorities mapper. Issuer-discovery providers
 * (OIDC / Keycloak / Google) are intentionally left unconfigured so no network discovery is
 * attempted.
 */
@DisplayName("OAuth2Configuration")
class OAuth2ConfigurationMoreTest {

    private UserService userService;

    private OAuth2Configuration newConfig(ApplicationProperties props) {
        userService = mock(UserService.class);
        return new OAuth2Configuration(props, userService);
    }

    /** Base props with OAuth2 enabled and a dummy provider name so the OIDC branch never NPEs. */
    private static ApplicationProperties enabledProps() {
        ApplicationProperties props = new ApplicationProperties();
        OAUTH2 oauth2 = props.getSecurity().getOauth2();
        oauth2.setEnabled(true);
        oauth2.setProvider("custom");
        oauth2.setUseAsUsername("email");
        return props;
    }

    @Nested
    @DisplayName("clientRegistrationRepository")
    class Registrations {

        @Test
        @DisplayName("registers a GitHub client from offline static endpoints")
        void registersGithub() throws NoProviderFoundException {
            ApplicationProperties props = enabledProps();
            OAUTH2 oauth2 = props.getSecurity().getOauth2();
            oauth2.getClient().getGithub().setClientId("gh-id");
            oauth2.getClient().getGithub().setClientSecret("gh-secret");

            OAuth2Configuration config = newConfig(props);
            ClientRegistrationRepository repo = config.clientRegistrationRepository();

            ClientRegistration github = repo.findByRegistrationId("github");
            assertThat(github).isNotNull();
            assertThat(github.getClientId()).isEqualTo("gh-id");
            assertThat(github.getRedirectUri()).endsWith("github");
        }

        @Test
        @DisplayName("throws NoProviderFoundException when no provider is configured")
        void noProviderThrows() {
            ApplicationProperties props = enabledProps();
            OAuth2Configuration config = newConfig(props);
            assertThatThrownBy(config::clientRegistrationRepository)
                    .isInstanceOf(NoProviderFoundException.class);
        }

        @Test
        @DisplayName("skips GitHub when OAuth2 is disabled")
        void disabledSkipsGithub() {
            ApplicationProperties props = new ApplicationProperties();
            props.getSecurity().getOauth2().setEnabled(false);
            props.getSecurity().getOauth2().getClient().getGithub().setClientId("gh-id");
            props.getSecurity().getOauth2().getClient().getGithub().setClientSecret("gh-secret");

            OAuth2Configuration config = newConfig(props);
            // Disabled => no registrations => NoProviderFoundException.
            assertThatThrownBy(config::clientRegistrationRepository)
                    .isInstanceOf(NoProviderFoundException.class);
        }

        @Test
        @DisplayName("skips GitHub when its client id is blank")
        void blankGithubIdSkipped() {
            ApplicationProperties props = enabledProps();
            props.getSecurity().getOauth2().getClient().getGithub().setClientId("");
            props.getSecurity().getOauth2().getClient().getGithub().setClientSecret("");

            OAuth2Configuration config = newConfig(props);
            assertThatThrownBy(config::clientRegistrationRepository)
                    .isInstanceOf(NoProviderFoundException.class);
        }
    }

    @Nested
    @DisplayName("userAuthoritiesMapper")
    class AuthoritiesMapper {

        @Test
        @DisplayName("passes through a plain granted authority")
        void mapsSimpleAuthority() {
            OAuth2Configuration config = newConfig(enabledProps());
            GrantedAuthoritiesMapper mapper = config.userAuthoritiesMapper();

            var mapped = mapper.mapAuthorities(List.of(new SimpleGrantedAuthority("ROLE_X")));

            assertThat(mapped).extracting(GrantedAuthority::getAuthority).contains("ROLE_X");
        }

        @Test
        @DisplayName("adds no DB authority when the OAuth2 user is unknown")
        void unknownOauthUserAddsOnlyOriginal() {
            ApplicationProperties props = enabledProps();
            props.getSecurity().getOauth2().setUseAsUsername("email");
            OAuth2Configuration config = newConfig(props);
            when(userService.findByUsernameIgnoreCase("nobody@example.com"))
                    .thenReturn(Optional.empty());

            GrantedAuthoritiesMapper mapper = config.userAuthoritiesMapper();
            OAuth2UserAuthority oauthAuthority =
                    new OAuth2UserAuthority(Map.of("email", "nobody@example.com"));

            var mapped = mapper.mapAuthorities(List.of(oauthAuthority));

            // Only the original OAUTH2 authority is present; no DB-derived Authority added.
            assertThat(mapped).extracting(GrantedAuthority::getAuthority).contains("OAUTH2_USER");
            assertThat(mapped).noneMatch(a -> a instanceof Authority);
        }

        @Test
        @DisplayName("adds the DB role authority for a known OAuth2 user")
        void knownOauthUserAddsDbAuthority() {
            ApplicationProperties props = enabledProps();
            props.getSecurity().getOauth2().setUseAsUsername("email");
            OAuth2Configuration config = newConfig(props);

            User user = new User();
            user.setUsername("known@example.com");
            Authority role = new Authority("ROLE_ADMIN", user);
            when(userService.findByUsernameIgnoreCase("known@example.com"))
                    .thenReturn(Optional.of(user));
            when(userService.findRole(user)).thenReturn(role);

            GrantedAuthoritiesMapper mapper = config.userAuthoritiesMapper();
            OAuth2UserAuthority oauthAuthority =
                    new OAuth2UserAuthority(Map.of("email", "known@example.com"));

            var mapped = mapper.mapAuthorities(List.of(oauthAuthority));

            assertThat(mapped).extracting(GrantedAuthority::getAuthority).contains("ROLE_ADMIN");
        }
    }
}
