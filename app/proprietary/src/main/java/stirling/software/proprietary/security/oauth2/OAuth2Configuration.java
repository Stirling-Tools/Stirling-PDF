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

// TODO: Migration required - OAuth2 client/login is a Spring Security feature
// (org.springframework.security.oauth2.client.*) with NO direct Quarkus equivalent. In Quarkus the
// OIDC/OAuth2 client is configured declaratively via quarkus-oidc (quarkus.oidc.* and named tenants
// quarkus.oidc.<tenant>.* in application.properties), not by programmatically building a
// ClientRegistrationRepository. This class previously @Produces'd a ClientRegistrationRepository and
// a GrantedAuthoritiesMapper. Those producer beans have been removed because the Spring types they
// returned do not exist on the Quarkus classpath. The provider-resolution logic (reading
// ApplicationProperties and validating each provider via validateProvider/isStringEmpty) is
// preserved below so the migration to quarkus-oidc can reuse it to emit per-tenant config. The
// authorities mapping (database role lookup via UserService) must be re-implemented as a
// io.quarkus.security.identity.SecurityIdentityAugmentor. The original
// @ConditionalOnProperty(security.oauth2.enabled=true) guard maps to quarkus.oidc.enabled /
// build-profile gating; the bean is now always created and callers must consult
// applicationProperties.getSecurity().getOauth2().getEnabled() at runtime.
@Slf4j
@ApplicationScoped
public class OAuth2Configuration {

    public static final String REDIRECT_URI_PATH = "{baseUrl}/login/oauth2/code/";

    private final ApplicationProperties applicationProperties;

    // TODO: Migration required - @Lazy has no Quarkus equivalent; CDI proxies break the original
    // lazy cycle. UserService is injected eagerly. If a genuine lazy/circular dependency exists,
    // switch to jakarta.enterprise.inject.Instance<UserService> and resolve at call time.
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
     *
     * <p>TODO: Migration required - the return type was
     * org.springframework.security.oauth2.client.registration.ClientRegistrationRepository, produced
     * via Spring @Bean. quarkus-oidc does not consume a ClientRegistrationRepository; instead each
     * validated Provider below must be emitted as a named OIDC tenant config
     * (quarkus.oidc.&lt;name&gt;.auth-server-url / client-id / credentials.secret /
     * authentication.scopes / authentication.redirect-path, etc.). The validated providers are
     * returned here so the wiring layer can register them; this method no longer produces a CDI bean.
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

        // TODO: Migration required - the original built a ClientRegistration via
        // ClientRegistrations.fromIssuerLocation(issuer) (OIDC discovery). Under quarkus-oidc this
        // maps to quarkus.oidc.<name>.auth-server-url=<issuer> with discovery enabled, plus
        // client-id/credentials.secret/authentication.scopes/token-state username attribute.
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

        // TODO: Migration required - the original built a ClientRegistration with explicit
        // authorizationUri/tokenUri/userInfoUri + redirectUri(REDIRECT_URI_PATH + name) +
        // AUTHORIZATION_CODE grant. Under quarkus-oidc this maps to a named tenant
        // quarkus.oidc.google.* (authorization-path/token-path/user-info-path or auth-server-url,
        // authentication.redirect-path, application-type=web-app). Google's endpoints come from the
        // GoogleProvider getters below.
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

        // TODO: Migration required - the original built a ClientRegistration with explicit
        // authorizationUri/tokenUri/userInfoUri + redirectUri(REDIRECT_URI_PATH + name) +
        // AUTHORIZATION_CODE grant. Map to quarkus.oidc.github.* tenant config (GitHub is a plain
        // OAuth2, not OIDC, provider - quarkus-oidc may require provider=github or explicit
        // *-path settings).
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

        // TODO: Migration required - the original built a ClientRegistration via
        // ClientRegistrations.fromIssuerLocation(issuer) (OIDC discovery) with
        // redirectUri(REDIRECT_URI_PATH + name) + AUTHORIZATION_CODE grant. Map to a named tenant
        // quarkus.oidc.<name>.auth-server-url=<issuer> (discovery on),
        // client-id/credentials.secret/authentication.scopes, authentication.redirect-path.
        return isValid ? Optional.of(oidcProvider) : Optional.empty();
    }

    private boolean isOAuth2Disabled(OAUTH2 oAuth2) {
        return oAuth2 == null || !oAuth2.getEnabled();
    }

    private boolean isClientInitialised(OAUTH2 oauth2) {
        Client client = oauth2.getClient();
        return client == null;
    }

    /*
    This following function granted Authorities to the OAUTH2 user from the values stored in the
    database. This was required for the internal 'hasRole()' function to give out the correct role.

    TODO: Migration required - this was a Spring Security
    org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper @Bean (guarded by
    @ConditionalOnProperty security.oauth2.enabled=true). Quarkus has no GrantedAuthoritiesMapper.
    Re-implement as an io.quarkus.security.identity.SecurityIdentityAugmentor (a CDI
    @ApplicationScoped bean): after quarkus-oidc authenticates, read the configured username claim
    (applicationProperties.getSecurity().getOauth2().getUseAsUsername()) from the SecurityIdentity
    attributes, load the User via userService.findByUsernameIgnoreCase(...), and add
    userService.findRole(user).getAuthority() as a role on the augmented identity. The preserved
    logic to port:

        String useAsUsername = applicationProperties.getSecurity().getOauth2().getUseAsUsername();
        Optional<User> userOpt =
                userService.findByUsernameIgnoreCase((String) attributes.get(useAsUsername));
        userOpt.ifPresent(user -> addRole(userService.findRole(user).getAuthority()));

    The original also re-added the existing OAuth2 authorities (SimpleGrantedAuthority) untouched;
    under quarkus-oidc the token roles are already present on the SecurityIdentity, so only the
    database-derived role needs to be added.
    */
}
