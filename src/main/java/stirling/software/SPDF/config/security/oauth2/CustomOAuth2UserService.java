package stirling.software.SPDF.config.security.oauth2;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

import stirling.software.SPDF.config.security.LoginAttemptService;
import stirling.software.SPDF.config.security.UserService;
import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2;
import stirling.software.SPDF.model.ApplicationProperties.Security.OAUTH2.Client;
import stirling.software.SPDF.model.User;

public class CustomOAuth2UserService implements OAuth2UserService<OidcUserRequest, OidcUser> {

    private final OidcUserService delegate = new OidcUserService();

    private UserService userService;

    private LoginAttemptService loginAttemptService;

    private ApplicationProperties applicationProperties;

    private static final Logger logger = LoggerFactory.getLogger(CustomOAuth2UserService.class);

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
        OAUTH2 oauth2 = applicationProperties.getSecurity().getOAUTH2();
        String usernameAttribute = oauth2.getUseAsUsername();
        if (usernameAttribute == null || usernameAttribute.trim().isEmpty()) {
            Client client = oauth2.getClient();
            if (client != null && client.getKeycloak() != null) {
                usernameAttribute = client.getKeycloak().getUseAsUsername();
            } else {
                usernameAttribute = "email";
            }
        }

        try {
            OidcUser user = delegate.loadUser(userRequest);
            String username = user.getUserInfo().getClaimAsString(usernameAttribute);

            // Check if the username claim is null or empty
            if (username == null || username.trim().isEmpty()) {
                throw new IllegalArgumentException(
                        "Claim '" + usernameAttribute + "' cannot be null or empty");
            }

            Optional<User> duser = userService.findByUsernameIgnoreCase(username);
            if (duser.isPresent()) {
                if (loginAttemptService.isBlocked(username)) {
                    throw new LockedException(
                            "Your account has been locked due to too many failed login attempts.");
                }
                if (userService.hasPassword(username)) {
                    throw new IllegalArgumentException("Password must not be null");
                }
            }

            // Return a new OidcUser with adjusted attributes
            return new DefaultOidcUser(
                    user.getAuthorities(),
                    userRequest.getIdToken(),
                    user.getUserInfo(),
                    usernameAttribute);
        } catch (IllegalArgumentException e) {
            logger.error("Error loading OIDC user: {}", e.getMessage());
            throw new OAuth2AuthenticationException(new OAuth2Error(e.getMessage()), e);
        } catch (Exception e) {
            logger.error("Unexpected error loading OIDC user", e);
            throw new OAuth2AuthenticationException("Unexpected error during authentication");
        }
    }
}
