package stirling.software.SPDF.config.security.oauth2;

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

import stirling.software.SPDF.config.security.LoginAttemptService;
import stirling.software.SPDF.config.security.UserService;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.SPDF.model.User;
import stirling.software.SPDF.model.UsernameAttribute;

@Slf4j
public class CustomOAuth2UserService implements OAuth2UserService<OidcUserRequest, OidcUser> {

    private final OidcUserService delegate = new OidcUserService();

    private final UserService userService;

    private final LoginAttemptService loginAttemptService;

    private final ApplicationProperties applicationProperties;

    public CustomOAuth2UserService(
            ApplicationProperties applicationProperties,
            UserService userService,
            LoginAttemptService loginAttemptService) {
        this.applicationProperties = applicationProperties;
        this.userService = userService;
        this.loginAttemptService = loginAttemptService;
    }

    @Override
    public OidcUser loadUser(OidcUserRequest userRequest) throws OAuth2AuthenticationException {
        try {
            OidcUser user = delegate.loadUser(userRequest);
            OAUTH2 oauth2 = applicationProperties.getSecurity().getOauth2();
            UsernameAttribute usernameAttribute =
                    UsernameAttribute.valueOf(oauth2.getUseAsUsername().toUpperCase());
            String usernameAttributeKey = usernameAttribute.getName();

            // todo: save user by OIDC ID instead of username
            Optional<User> internalUser =
                    userService.findByUsernameIgnoreCase(user.getAttribute(usernameAttributeKey));

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
