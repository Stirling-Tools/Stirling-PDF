package stirling.software.proprietary.security.service;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.security.authentication.LockedException;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.OidcUserInfo;
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
        String registrationId = userRequest.getClientRegistration().getRegistrationId();
        boolean debugLogging = Boolean.TRUE.equals(oauth2Properties.getDebugLogging());
        // Resolved inside the try so a bad/null useAsUsername (IllegalArgumentException from
        // valueOf, or NPE on toUpperCase) is caught and wrapped as OAuth2AuthenticationException
        // by the existing handlers below, matching the pre-debugLogging behaviour.
        String usernameAttributeKey = null;
        OidcUser user = null;

        try {
            usernameAttributeKey =
                    UsernameAttribute.valueOf(oauth2Properties.getUseAsUsername().toUpperCase())
                            .getName();
            user = delegate.loadUser(userRequest);

            if (debugLogging) {
                logClaimDump(
                        "OAuth2/OIDC login claims received",
                        registrationId,
                        usernameAttributeKey,
                        user.getIdToken(),
                        user.getUserInfo(),
                        false);
            }

            // Extract SSO provider information
            String ssoProviderId = user.getSubject(); // Standard OIDC 'sub' claim
            String username = user.getAttribute(usernameAttributeKey);

            log.debug(
                    "OAuth2 login - Provider: {}, ProviderId: {}, Username: {}",
                    registrationId,
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
            // Only emit the claim dump if we successfully resolved usernameAttributeKey. A null
            // value here means UsernameAttribute.valueOf rejected the configured useAsUsername
            // before delegate.loadUser ran — that error message is self-explanatory and a claim
            // dump would have no resolved-key to compare against.
            if (debugLogging && usernameAttributeKey != null) {
                logClaimDump(
                        "OAuth2/OIDC login FAILED - dumping received claims",
                        registrationId,
                        usernameAttributeKey,
                        userRequest.getIdToken(),
                        user != null ? user.getUserInfo() : fetchUserInfo(userRequest),
                        true);
            }
            throw new OAuth2AuthenticationException(new OAuth2Error(e.getMessage()), e);
        } catch (Exception e) {
            log.error("Unexpected error loading OIDC user", e);
            if (debugLogging && usernameAttributeKey != null) {
                logClaimDump(
                        "OAuth2/OIDC login FAILED (unexpected error) - dumping received claims",
                        registrationId,
                        usernameAttributeKey,
                        userRequest.getIdToken(),
                        user != null ? user.getUserInfo() : fetchUserInfo(userRequest),
                        true);
            }
            throw new OAuth2AuthenticationException("Unexpected error during authentication");
        }
    }

    private OidcUserInfo fetchUserInfo(OidcUserRequest userRequest) {
        DefaultOAuth2UserService fetcher = newUserInfoFetcher();
        AtomicReference<Map<String, Object>> attributes = new AtomicReference<>();
        fetcher.setAttributesConverter(
                request ->
                        response -> {
                            attributes.set(response);
                            return response;
                        });
        try {
            fetcher.loadUser(userRequest);
        } catch (RuntimeException e) {
            log.debug("UserInfo fetch for the failure dump did not complete: {}", e.getMessage());
        }
        Map<String, Object> claims = attributes.get();
        return (claims == null || claims.isEmpty()) ? null : new OidcUserInfo(claims);
    }

    DefaultOAuth2UserService newUserInfoFetcher() {
        return new DefaultOAuth2UserService();
    }

    /**
     * Emits a multi-line diagnostic dump of the claims returned by the OAuth2/OIDC provider. Only
     * invoked when {@code security.oauth2.debugLogging=true}.
     *
     * @param banner short title for the log block
     * @param registrationId Spring client registration id (e.g. "demarest", "keycloak")
     * @param usernameAttributeKey the claim key the application is configured to use as username
     * @param idToken the decoded ID token, may be null on unexpected failures
     * @param userInfo the decoded UserInfo response, may be null if the provider returned none
     * @param failure true if logging in the error path (uses ERROR level), false for INFO
     */
    private void logClaimDump(
            String banner,
            String registrationId,
            String usernameAttributeKey,
            OidcIdToken idToken,
            OidcUserInfo userInfo,
            boolean failure) {
        Map<String, Object> mergedAttributes = mergeClaims(userInfo, idToken);
        StringBuilder sb = new StringBuilder();
        sb.append("\n========== [OAUTH2 DEBUG] ").append(banner).append(" ==========\n");
        sb.append("Provider registrationId : ").append(registrationId).append('\n');
        sb.append("Configured useAsUsername: ")
                .append(oauth2Properties.getUseAsUsername())
                .append(" (looks up claim key '")
                .append(usernameAttributeKey)
                .append("')\n");

        if (idToken != null) {
            Map<String, Object> idClaims = idToken.getClaims();
            sb.append("\n-- ID token claims (")
                    .append(idClaims == null ? 0 : idClaims.size())
                    .append(") --\n");
            appendClaims(sb, idClaims);
            sb.append("ID token issued at : ").append(idToken.getIssuedAt()).append('\n');
            sb.append("ID token expires at: ").append(idToken.getExpiresAt()).append('\n');
        } else {
            sb.append("\n-- ID token: <null> --\n");
        }

        if (userInfo != null && userInfo.getClaims() != null) {
            sb.append("\n-- UserInfo endpoint claims (")
                    .append(userInfo.getClaims().size())
                    .append(") --\n");
            appendClaims(sb, userInfo.getClaims());
        } else {
            sb.append("\n-- UserInfo endpoint: not retrieved --\n");
        }

        if (mergedAttributes != null) {
            sb.append("\n-- Merged attribute keys available to useAsUsername: ")
                    .append(new TreeSet<>(mergedAttributes.keySet()))
                    .append("\n");
            Object resolved = mergedAttributes.get(usernameAttributeKey);
            sb.append("-- Value at '")
                    .append(usernameAttributeKey)
                    .append("' : ")
                    .append(resolved == null ? "<NULL — this is why login fails>" : resolved)
                    .append('\n');

            if (resolved == null) {
                Set<String> hints = suggestUsernameClaims(mergedAttributes.keySet());
                if (!hints.isEmpty()) {
                    sb.append(
                                    "-- Hint: the following claim(s) are present and map to a"
                                            + " known UsernameAttribute value — try setting"
                                            + " security.oauth2.useAsUsername to one of: ")
                            .append(hints)
                            .append('\n');
                }
            }
        }

        sb.append(
                """

                WARNING: this block contains PII. Set security.oauth2.debugLogging=false once\
                 troubleshooting is complete.
                """);
        sb.append("========== [/OAUTH2 DEBUG] ==========");

        if (failure) {
            log.error(sb.toString());
        } else {
            log.info(sb.toString());
        }
    }

    private static Map<String, Object> mergeClaims(OidcUserInfo userInfo, OidcIdToken idToken) {
        Map<String, Object> claims = new HashMap<>();
        if (userInfo != null && userInfo.getClaims() != null) {
            claims.putAll(userInfo.getClaims());
        }
        if (idToken != null && idToken.getClaims() != null) {
            claims.putAll(idToken.getClaims());
        }
        return claims;
    }

    private static void appendClaims(StringBuilder sb, Map<String, Object> claims) {
        if (claims == null || claims.isEmpty()) {
            sb.append("  (no claims)\n");
            return;
        }
        // Sort for stable, scannable output
        new TreeSet<>(claims.keySet())
                .forEach(
                        key -> {
                            Object value = claims.get(key);
                            sb.append("  ").append(key).append(" = ").append(value).append('\n');
                        });
    }

    /**
     * Returns the intersection of the claim keys the provider actually returned and the keys that
     * {@link UsernameAttribute} accepts — i.e. valid values the operator could put in {@code
     * security.oauth2.useAsUsername} to make this login work.
     */
    private static Set<String> suggestUsernameClaims(Set<String> availableClaimKeys) {
        Set<String> supported = new TreeSet<>();
        for (UsernameAttribute attr : UsernameAttribute.values()) {
            if (availableClaimKeys.contains(attr.getName())) {
                supported.add(attr.getName());
            }
        }
        return supported;
    }
}
