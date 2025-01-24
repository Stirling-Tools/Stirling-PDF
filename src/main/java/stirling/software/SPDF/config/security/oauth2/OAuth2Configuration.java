package stirling.software.SPDF.config.security.oauth2;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.ClientRegistrations;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.user.OAuth2UserAuthority;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.config.security.UserService;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2.Client;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.model.provider.GithubProvider;
import stirling.software.SPDF.model.provider.GoogleProvider;
import stirling.software.SPDF.model.provider.KeycloakProvider;

@Configuration
@Slf4j
@ConditionalOnProperty(
        value = "security.oauth2.enabled",
        havingValue = "true",
        matchIfMissing = false)
public class OAuth2Configuration {

    private final ApplicationProperties applicationProperties;
    @Lazy private final UserService userService;

    public OAuth2Configuration(
            ApplicationProperties applicationProperties, @Lazy UserService userService) {
        this.userService = userService;
        this.applicationProperties = applicationProperties;
    }

    @Bean
    @ConditionalOnProperty(
            value = "security.oauth2.enabled",
            havingValue = "true",
            matchIfMissing = false)
    public ClientRegistrationRepository clientRegistrationRepository() {
        List<ClientRegistration> registrations = new ArrayList<>();
        githubClientRegistration().ifPresent(registrations::add);
        oidcClientRegistration().ifPresent(registrations::add);
        googleClientRegistration().ifPresent(registrations::add);
        keycloakClientRegistration().ifPresent(registrations::add);
        if (registrations.isEmpty()) {
            log.error("At least one OAuth2 provider must be configured");
            System.exit(1);
        }
        return new InMemoryClientRegistrationRepository(registrations);
    }

    private Optional<ClientRegistration> googleClientRegistration() {
        OAUTH2 oauth = applicationProperties.getSecurity().getOauth2();
        if (oauth == null || !oauth.getEnabled()) {
            return Optional.empty();
        }
        Client client = oauth.getClient();
        if (client == null) {
            return Optional.empty();
        }
        GoogleProvider google = client.getGoogle();
        return google != null && google.isSettingsValid()
                ? Optional.of(
                        ClientRegistration.withRegistrationId(google.getName())
                                .clientId(google.getClientId())
                                .clientSecret(google.getClientSecret())
                                .scope(google.getScopes())
                                .authorizationUri(google.getAuthorizationuri())
                                .tokenUri(google.getTokenuri())
                                .userInfoUri(google.getUserinfouri())
                                .userNameAttributeName(google.getUseAsUsername())
                                .clientName(google.getClientName())
                                .redirectUri("{baseUrl}/login/oauth2/code/" + google.getName())
                                .authorizationGrantType(
                                        org.springframework.security.oauth2.core
                                                .AuthorizationGrantType.AUTHORIZATION_CODE)
                                .build())
                : Optional.empty();
    }

    private Optional<ClientRegistration> keycloakClientRegistration() {
        OAUTH2 oauth = applicationProperties.getSecurity().getOauth2();
        if (oauth == null || !oauth.getEnabled()) {
            return Optional.empty();
        }
        Client client = oauth.getClient();
        if (client == null) {
            return Optional.empty();
        }
        KeycloakProvider keycloak = client.getKeycloak();
        return keycloak != null && keycloak.isSettingsValid()
                ? Optional.of(
                        ClientRegistrations.fromIssuerLocation(keycloak.getIssuer())
                                .registrationId(keycloak.getName())
                                .clientId(keycloak.getClientId())
                                .clientSecret(keycloak.getClientSecret())
                                .scope(keycloak.getScopes())
                                .userNameAttributeName(keycloak.getUseAsUsername())
                                .clientName(keycloak.getClientName())
                                .build())
                : Optional.empty();
    }

    private Optional<ClientRegistration> githubClientRegistration() {
        OAUTH2 oauth = applicationProperties.getSecurity().getOauth2();
        if (oauth == null || !oauth.getEnabled()) {
            return Optional.empty();
        }
        Client client = oauth.getClient();
        if (client == null) {
            return Optional.empty();
        }
        GithubProvider github = client.getGithub();
        return github != null && github.isSettingsValid()
                ? Optional.of(
                        ClientRegistration.withRegistrationId(github.getName())
                                .clientId(github.getClientId())
                                .clientSecret(github.getClientSecret())
                                .scope(github.getScopes())
                                .authorizationUri(github.getAuthorizationuri())
                                .tokenUri(github.getTokenuri())
                                .userInfoUri(github.getUserinfouri())
                                .userNameAttributeName(github.getUseAsUsername())
                                .clientName(github.getClientName())
                                .redirectUri("{baseUrl}/login/oauth2/code/" + github.getName())
                                .authorizationGrantType(
                                        org.springframework.security.oauth2.core
                                                .AuthorizationGrantType.AUTHORIZATION_CODE)
                                .build())
                : Optional.empty();
    }

    private Optional<ClientRegistration> oidcClientRegistration() {
        OAUTH2 oauth = applicationProperties.getSecurity().getOauth2();
        if (oauth == null
                || oauth.getIssuer() == null
                || oauth.getIssuer().isEmpty()
                || oauth.getClientId() == null
                || oauth.getClientId().isEmpty()
                || oauth.getClientSecret() == null
                || oauth.getClientSecret().isEmpty()
                || oauth.getScopes() == null
                || oauth.getScopes().isEmpty()
                || oauth.getUseAsUsername() == null
                || oauth.getUseAsUsername().isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(
                ClientRegistrations.fromIssuerLocation(oauth.getIssuer())
                        .registrationId("oidc")
                        .clientId(oauth.getClientId())
                        .clientSecret(oauth.getClientSecret())
                        .scope(oauth.getScopes())
                        .userNameAttributeName(oauth.getUseAsUsername())
                        .clientName("OIDC")
                        .build());
    }

    /*
    This following function is to grant Authorities to the OAUTH2 user from the values stored in the database.
    This is required for the internal; 'hasRole()' function to give out the correct role.
     */
    @Bean
    @ConditionalOnProperty(
            value = "security.oauth2.enabled",
            havingValue = "true",
            matchIfMissing = false)
    GrantedAuthoritiesMapper userAuthoritiesMapper() {
        return (authorities) -> {
            Set<GrantedAuthority> mappedAuthorities = new HashSet<>();
            authorities.forEach(
                    authority -> {
                        // Add existing OAUTH2 Authorities
                        mappedAuthorities.add(new SimpleGrantedAuthority(authority.getAuthority()));
                        // Add Authorities from database for existing user, if user is present.
                        if (authority instanceof OAuth2UserAuthority oauth2Auth) {
                            String useAsUsername =
                                    applicationProperties
                                            .getSecurity()
                                            .getOauth2()
                                            .getUseAsUsername();
                            Optional<User> userOpt =
                                    userService.findByUsernameIgnoreCase(
                                            (String) oauth2Auth.getAttributes().get(useAsUsername));
                            if (userOpt.isPresent()) {
                                User user = userOpt.get();
                                if (user != null) {
                                    mappedAuthorities.add(
                                            new SimpleGrantedAuthority(
                                                    userService.findRole(user).getAuthority()));
                                }
                            }
                        }
                    });
            return mappedAuthorities;
        };
    }
}
