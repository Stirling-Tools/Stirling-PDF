package stirling.software.proprietary.security.oauth2;

import static stirling.software.common.util.ProviderUtils.validateProvider;
import static stirling.software.common.util.ValidationUtils.isStringEmpty;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.common.model.ApplicationProperties.Security.OAUTH2.Client;
import stirling.software.common.model.enumeration.UsernameAttribute;
import stirling.software.common.model.oauth2.GitHubProvider;
import stirling.software.common.model.oauth2.GoogleProvider;
import stirling.software.common.model.oauth2.KeycloakProvider;
import stirling.software.common.model.oauth2.Provider;
import stirling.software.proprietary.security.model.exception.NoProviderFoundException;
import stirling.software.proprietary.security.service.UserService;

@Slf4j
@ApplicationScoped
public class OAuth2Configuration {

    public static final String REDIRECT_URI_PATH = "{baseUrl}/login/oauth2/code/";

    private final ApplicationProperties applicationProperties;

    private final UserService userService;

    @Inject
    public OAuth2Configuration(
            ApplicationProperties applicationProperties, UserService userService) {
        this.userService = userService;
        this.applicationProperties = applicationProperties;
        log.info(
                "OAuth2Configuration initialized - OAuth2 enabled: {}",
                applicationProperties.getSecurity().getOauth2().getEnabled());
    }

    /**
     * Resolves the set of configured OAuth2 providers from ApplicationProperties and validates each
     * one. The original implementation built a Spring Security ClientRegistrationRepository from
     * these providers.
     */
    public List<Provider> resolveValidatedProviders() throws NoProviderFoundException {
        List<Provider> providers = new ArrayList<>();
        githubProvider().ifPresent(providers::add);
        oidcProvider().ifPresent(providers::add);
        googleProvider().ifPresent(providers::add);
        keycloakProvider().ifPresent(providers::add);

        if (providers.isEmpty()) {
            log.error("No OAuth2 provider registered - check your OAuth2 configuration");
            throw new NoProviderFoundException("At least one OAuth2 provider must be configured.");
        }

        log.info(
                "OAuth2 providers resolved: {} provider(s): {}",
                providers.size(),
                providers.stream().map(Provider::getName).toList());

        return providers;
    }

    private Optional<Provider> keycloakProvider() {
        OAUTH2 oauth2 = applicationProperties.getSecurity().getOauth2();

        if (isOAuth2Disabled(oauth2) || isClientInitialised(oauth2)) {
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

        return validateProvider(keycloak) ? Optional.of(keycloak) : Optional.empty();
    }

    private Optional<Provider> googleProvider() {
        OAUTH2 oAuth2 = applicationProperties.getSecurity().getOauth2();

        if (isOAuth2Disabled(oAuth2) || isClientInitialised(oAuth2)) {
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

        return validateProvider(google) ? Optional.of(google) : Optional.empty();
    }

    private Optional<Provider> githubProvider() {
        OAUTH2 oAuth2 = applicationProperties.getSecurity().getOauth2();

        if (isOAuth2Disabled(oAuth2)) {
            log.debug("OAuth2 is disabled, skipping GitHub client registration");
            return Optional.empty();
        }

        Client client = oAuth2.getClient();
        if (client == null) {
            log.debug("OAuth2 client configuration is null, skipping GitHub");
            return Optional.empty();
        }

        GitHubProvider githubClient = client.getGithub();
        if (githubClient == null) {
            log.debug("GitHub client configuration is null");
            return Optional.empty();
        }

        Provider github =
                new GitHubProvider(
                        githubClient.getClientId(),
                        githubClient.getClientSecret(),
                        githubClient.getScopes(),
                        githubClient.getUseAsUsername());

        return validateProvider(github) ? Optional.of(github) : Optional.empty();
    }

    private Optional<Provider> oidcProvider() {
        OAUTH2 oauth = applicationProperties.getSecurity().getOauth2();

        if (isOAuth2Disabled(oauth) || isClientInitialised(oauth)) {
            return Optional.empty();
        }

        String name = oauth.getProvider();
        String firstChar = String.valueOf(name.charAt(0));
        String clientName = name.replaceFirst(firstChar, firstChar.toUpperCase(Locale.ROOT));

        Provider oidcProvider =
                new Provider(
                        oauth.getIssuer(),
                        name,
                        clientName,
                        oauth.getClientId(),
                        oauth.getClientSecret(),
                        oauth.getScopes(),
                        UsernameAttribute.valueOf(
                                oauth.getUseAsUsername().toUpperCase(Locale.ROOT)),
                        null,
                        null,
                        null);

        boolean isValid =
                !isStringEmpty(oidcProvider.getIssuer()) || validateProvider(oidcProvider);
        if (isValid) {
            log.info(
                    "Initialised OIDC OAuth2 provider: registrationId='{}', issuer='{}', redirectUri='{}'",
                    name,
                    oauth.getIssuer(),
                    REDIRECT_URI_PATH + name);
        } else {
            log.warn("OIDC OAuth2 provider validation failed - provider will not be registered");
        }

        return isValid ? Optional.of(oidcProvider) : Optional.empty();
    }

    private boolean isOAuth2Disabled(OAUTH2 oAuth2) {
        return oAuth2 == null || !oAuth2.getEnabled();
    }

    private boolean isClientInitialised(OAUTH2 oauth2) {
        Client client = oauth2.getClient();
        return client == null;
    }
}
