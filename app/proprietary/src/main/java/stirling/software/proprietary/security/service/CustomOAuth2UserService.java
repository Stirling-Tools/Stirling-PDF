package stirling.software.proprietary.security.service;

import java.util.Optional;

import org.springframework.security.authentication.LockedException;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.UsernameAttribute;
import stirling.software.proprietary.security.model.User;

@Slf4j
public class CustomOAuth2UserService implements OAuth2UserService<OidcUserRequest, OidcUser> {

    private final OidcUserService delegate = new OidcUserService();

    private final UserService userService;

    private final LoginAttemptService loginAttemptService;

    private final ApplicationProperties.Security.OAUTH2 oauth2Properties;

    public CustomOAuth2UserService(
            ApplicationProperties.Security.OAUTH2 oauth2Properties,
            UserService userService,
            LoginAttemptService loginAttemptService) {
        this.oauth2Properties = oauth2Properties;
        this.userService = userService;
        this.loginAttemptService = loginAttemptService;
    }

    @Override
    public OidcUser loadUser(OidcUserRequest userRequest) throws OAuth2AuthenticationException {
        try {
            OidcUser user = delegate.loadUser(userRequest);
            String usernameAttributeKey =
                    UsernameAttribute.valueOf(oauth2Properties.getUseAsUsername().toUpperCase())
                            .getName();

            // Extract SSO provider information
            String ssoProviderId = user.getSubject(); // Standard OIDC 'sub' claim
            String ssoProvider = userRequest.getClientRegistration().getRegistrationId();
            String username = user.getAttribute(usernameAttributeKey);

            log.debug(
                    "OAuth2 login - Provider: {}, ProviderId: {}, Username: {}",
                    ssoProvider,
                    ssoProviderId,
                    username);

            Optional<User> internalUser = userService.findByUsernameIgnoreCase(username);

            if (internalUser.isPresent()) {
                String internalUsername = internalUser.get().getUsername();
                if (loginAttemptService.isBlocked(internalUsername)) {
                    throw new LockedException(
                            "The account "
                                    + internalUsername
                                    + " has been locked due to too many failed login attempts.");
                }
                if (userService.hasPassword(usernameAttributeKey)) {
                    throw new IllegalArgumentException("Password must not be null");
                }
            }

            // Return a new OidcUser with adjusted attributes
            return new DefaultOidcUser(
                    user.getAuthorities(),
                    userRequest.getIdToken(),
                    user.getUserInfo(),
                    usernameAttributeKey);
        } catch (IllegalArgumentException e) {
            log.error("Error loading OIDC user: {}", e.getMessage());
            throw new OAuth2AuthenticationException(new OAuth2Error(e.getMessage()), e);
        } catch (Exception e) {
            log.error("Unexpected error loading OIDC user", e);
            throw new OAuth2AuthenticationException("Unexpected error during authentication");
        }
    }
}
