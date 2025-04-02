package stirling.software.SPDF.config.security.oauth2;

import static org.springframework.security.oauth2.core.AuthorizationGrantType.AUTHORIZATION_CODE;
import static stirling.software.SPDF.utils.validation.Validator.*;

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
import stirling.software.SPDF.model.UsernameAttribute;
import stirling.software.SPDF.model.exception.NoProviderFoundException;
import stirling.software.SPDF.model.provider.GitHubProvider;
import stirling.software.SPDF.model.provider.GoogleProvider;
import stirling.software.SPDF.model.provider.KeycloakProvider;
import stirling.software.SPDF.model.provider.Provider;

@Slf4j
@Configuration
@ConditionalOnProperty(value = "security.oauth2.enabled", havingValue = "true")
public class OAuth2Configuration {

    public static final String REDIRECT_URI_PATH = "{baseUrl}/login/oauth2/code/";

    private final ApplicationProperties applicationProperties;
    @Lazy private final UserService userService;

    public OAuth2Configuration(
            ApplicationProperties applicationProperties, @Lazy UserService userService) {
        this.userService = userService;
        this.applicationProperties = applicationProperties;
    }

    @Bean
    @ConditionalOnProperty(value = "security.oauth2.enabled", havingValue = "true")
    public ClientRegistrationRepository clientRegistrationRepository()
            throws NoProviderFoundException {
        List<ClientRegistration> registrations = new ArrayList<>();
        githubClientRegistration().ifPresent(registrations::add);
        oidcClientRegistration().ifPresent(registrations::add);
        googleClientRegistration().ifPresent(registrations::add);
        keycloakClientRegistration().ifPresent(registrations::add);

        if (registrations.isEmpty()) {
            log.error("No OAuth2 provider registered");
            throw new NoProviderFoundException("At least one OAuth2 provider must be configured.");
        }

        return new InMemoryClientRegistrationRepository(registrations);
    }

    private Optional<ClientRegistration> keycloakClientRegistration() {
        OAUTH2 oauth2 = applicationProperties.getSecurity().getOauth2();

        if (isOAuth2Enabled(oauth2) || isClientInitialised(oauth2)) {
            return Optional.empty();
        }

        Client client = oauth2.getClient();
        KeycloakProvider keycloakClient = client.getKeycloak();
        Provider keycloak =
                new KeycloakProvider(
                        keycloakClient.getIssuer(),
                        keycloakClient.getClientId(),
                        keycloakClient.getClientSecret(),
                        keycloakClient.getScopes(),
                        keycloakClient.getUseAsUsername());

        return validateProvider(keycloak)
                ? Optional.of(
                        ClientRegistrations.fromIssuerLocation(keycloak.getIssuer())
                                .registrationId(keycloak.getName())
                                .clientId(keycloak.getClientId())
                                .clientSecret(keycloak.getClientSecret())
                                .scope(keycloak.getScopes())
                                .userNameAttributeName(keycloak.getUseAsUsername().getName())
                                .clientName(keycloak.getClientName())
                                .build())
                : Optional.empty();
    }

    private Optional<ClientRegistration> googleClientRegistration() {
        OAUTH2 oAuth2 = applicationProperties.getSecurity().getOauth2();

        if (isOAuth2Enabled(oAuth2) || isClientInitialised(oAuth2)) {
            return Optional.empty();
        }

        Client client = oAuth2.getClient();
        GoogleProvider googleClient = client.getGoogle();
        Provider google =
                new GoogleProvider(
                        googleClient.getClientId(),
                        googleClient.getClientSecret(),
                        googleClient.getScopes(),
                        googleClient.getUseAsUsername());

        return validateProvider(google)
                ? Optional.of(
                        ClientRegistration.withRegistrationId(google.getName())
                                .clientId(google.getClientId())
                                .clientSecret(google.getClientSecret())
                                .scope(google.getScopes())
                                .authorizationUri(google.getAuthorizationUri())
                                .tokenUri(google.getTokenUri())
                                .userInfoUri(google.getUserInfoUri())
                                .userNameAttributeName(google.getUseAsUsername().getName())
                                .clientName(google.getClientName())
                                .redirectUri(REDIRECT_URI_PATH + google.getName())
                                .authorizationGrantType(AUTHORIZATION_CODE)
                                .build())
                : Optional.empty();
    }

    private Optional<ClientRegistration> githubClientRegistration() {
        OAUTH2 oAuth2 = applicationProperties.getSecurity().getOauth2();

        if (isOAuth2Enabled(oAuth2)) {
            return Optional.empty();
        }

        Client client = oAuth2.getClient();
        GitHubProvider githubClient = client.getGithub();
        Provider github =
                new GitHubProvider(
                        githubClient.getClientId(),
                        githubClient.getClientSecret(),
                        githubClient.getScopes(),
                        githubClient.getUseAsUsername());

        return validateProvider(github)
                ? Optional.of(
                        ClientRegistration.withRegistrationId(github.getName())
                                .clientId(github.getClientId())
                                .clientSecret(github.getClientSecret())
                                .scope(github.getScopes())
                                .authorizationUri(github.getAuthorizationUri())
                                .tokenUri(github.getTokenUri())
                                .userInfoUri(github.getUserInfoUri())
                                .userNameAttributeName(github.getUseAsUsername().getName())
                                .clientName(github.getClientName())
                                .redirectUri(REDIRECT_URI_PATH + github.getName())
                                .authorizationGrantType(AUTHORIZATION_CODE)
                                .build())
                : Optional.empty();
    }

    private Optional<ClientRegistration> oidcClientRegistration() {
        OAUTH2 oauth = applicationProperties.getSecurity().getOauth2();

        if (isOAuth2Enabled(oauth) || isClientInitialised(oauth)) {
            return Optional.empty();
        }

        String name = oauth.getProvider();
        String firstChar = String.valueOf(name.charAt(0));
        String clientName = name.replaceFirst(firstChar, firstChar.toUpperCase());

        Provider oidcProvider =
                new Provider(
                        oauth.getIssuer(),
                        name,
                        clientName,
                        oauth.getClientId(),
                        oauth.getClientSecret(),
                        oauth.getScopes(),
                        UsernameAttribute.valueOf(oauth.getUseAsUsername().toUpperCase()),
                        null,
                        null,
                        null);

        return !isStringEmpty(oidcProvider.getIssuer()) || validateProvider(oidcProvider)
                ? Optional.of(
                        ClientRegistrations.fromIssuerLocation(oauth.getIssuer())
                                .registrationId(name)
                                .clientId(oidcProvider.getClientId())
                                .clientSecret(oidcProvider.getClientSecret())
                                .scope(oidcProvider.getScopes())
                                .userNameAttributeName(oidcProvider.getUseAsUsername().getName())
                                .clientName(clientName)
                                .redirectUri(REDIRECT_URI_PATH + "oidc")
                                .authorizationGrantType(AUTHORIZATION_CODE)
                                .build())
                : Optional.empty();
    }

    private boolean isOAuth2Enabled(OAUTH2 oAuth2) {
        return oAuth2 == null || !oAuth2.getEnabled();
    }

    private boolean isClientInitialised(OAUTH2 oauth2) {
        Client client = oauth2.getClient();
        return client == null;
    }

    /*
    This following function is to grant Authorities to the OAUTH2 user from the values stored in the database.
    This is required for the internal; 'hasRole()' function to give out the correct role.
     */

    @Bean
    @ConditionalOnProperty(value = "security.oauth2.enabled", havingValue = "true")
    GrantedAuthoritiesMapper userAuthoritiesMapper() {
        return (authorities) -> {
            Set<GrantedAuthority> mappedAuthorities = new HashSet<>();
            authorities.forEach(
                    authority -> {
                        // Add existing OAUTH2 Authorities
                        mappedAuthorities.add(new SimpleGrantedAuthority(authority.getAuthority()));
                        // Add Authorities from database for existing user, if user is present.
                        if (authority instanceof OAuth2UserAuthority oAuth2Auth) {
                            String useAsUsername =
                                    applicationProperties
                                            .getSecurity()
                                            .getOauth2()
                                            .getUseAsUsername();
                            Optional<User> userOpt =
                                    userService.findByUsernameIgnoreCase(
                                            (String) oAuth2Auth.getAttributes().get(useAsUsername));
                            if (userOpt.isPresent()) {
                                User user = userOpt.get();
                                mappedAuthorities.add(
                                        new SimpleGrantedAuthority(
                                                userService.findRole(user).getAuthority()));
                            }
                        }
                    });
            return mappedAuthorities;
        };
    }
}
