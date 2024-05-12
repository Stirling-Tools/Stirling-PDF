package stirling.software.SPDF.config.security.oauth2;

import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;

import stirling.software.SPDF.model.ApplicationProperties;

public class CustomOAuthUserService implements OAuth2UserService<OidcUserRequest, OidcUser> {

    private static final Logger logger = LoggerFactory.getLogger(CustomOAuthUserService.class);

    private final OidcUserService delegate = new OidcUserService();

    private ApplicationProperties applicationProperties;

    public CustomOAuthUserService(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    @Override
    public OidcUser loadUser(OidcUserRequest userRequest) throws OAuth2AuthenticationException {
        String usernameAttribute =
                applicationProperties.getSecurity().getOAUTH2().getUseAsUsername();
        try {

            OidcUser user = delegate.loadUser(userRequest);
            Map<String, Object> attributes = new HashMap<>(user.getAttributes());

            // Ensure the preferred username attribute is present
            if (!attributes.containsKey(usernameAttribute)) {
                attributes.put(usernameAttribute, attributes.getOrDefault("email", ""));
                usernameAttribute = "email";
                logger.info("Adjusted username attribute to use email");
            }

            // Return a new OidcUser with adjusted attributes
            return new DefaultOidcUser(
                    user.getAuthorities(),
                    userRequest.getIdToken(),
                    user.getUserInfo(),
                    usernameAttribute);
        } catch (java.lang.IllegalArgumentException e) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error(e.getMessage()), e.getMessage(), e);
        }
    }
}
