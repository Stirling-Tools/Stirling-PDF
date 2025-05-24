package stirling.software.SPDF.config.security;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;

import stirling.software.SPDF.config.security.saml2.CustomSaml2AuthenticatedPrincipal;

public class UserUtils {
    public static String getUsernameFromPrincipal(Object principal) {
        if (principal instanceof UserDetails detailsUser) {
            return detailsUser.getUsername();
        } else if (principal instanceof stirling.software.SPDF.model.User domainUser) {
            return domainUser.getUsername();
        } else if (principal instanceof OAuth2User oAuth2User) {
            return oAuth2User.getName();
        } else if (principal instanceof CustomSaml2AuthenticatedPrincipal saml2User) {
            return saml2User.name();
        } else if (principal instanceof String stringUser) {
            return stringUser;
        } else {
            return null;
        }
    }
}
