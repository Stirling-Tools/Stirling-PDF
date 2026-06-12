package stirling.software.proprietary.security.service;

import java.util.Collections;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.UsernameAttribute;
import stirling.software.proprietary.security.model.User;

// TODO: Migration required - quarkus-oidc has no equivalent of Spring's
// OAuth2UserService<OidcUserRequest, OidcUser> / OidcUserService delegate. Under quarkus-oidc the
// OIDC flow is handled by the extension (quarkus.oidc.* config); per-login user mapping and the
// "useAsUsername" claim selection should be re-implemented in a
// io.quarkus.security.identity.SecurityIdentityAugmentor (inject the @io.quarkus.oidc.IdToken
// JsonWebToken / OidcSession), and the blocked-account / hasPassword checks below should run there
// before the SecurityIdentity is finalized. The claim-dump diagnostics (logClaimDump,
// appendClaims, suggestUsernameClaims) and the username-resolution + LockedException logic are
// preserved unchanged so they can be reused by the augmentor.
// The previous Spring types map roughly to:
//   OidcUserRequest.getClientRegistration().getRegistrationId() -> the OIDC tenant id
//   OidcUserService.loadUser(...)        -> handled by quarkus-oidc (UserInfo via
//                                           quarkus.oidc.authentication.user-info-required=true)
//   OidcUser.getAttribute(key)/getSubject()/getIdToken()/getUserInfo() -> JsonWebToken claims +
//                                           io.quarkus.oidc.UserInfo
//   DefaultOidcUser(...)                 -> the augmented SecurityIdentity
//   OAuth2AuthenticationException        -> io.quarkus.security.AuthenticationFailedException
@Slf4j
@ApplicationScoped
public class CustomOAuth2UserService {

    private final UserService userService;

    private final LoginAttemptService loginAttemptService;

    private final ApplicationProperties.Security.OAUTH2 oauth2Properties;

    @Inject
    public CustomOAuth2UserService(
            ApplicationProperties.Security.OAUTH2 oauth2Properties,
            UserService userService,
            LoginAttemptService loginAttemptService) {
        this.oauth2Properties = oauth2Properties;
        this.userService = userService;
        this.loginAttemptService = loginAttemptService;
    }

    /**
     * Resolves and validates the local user for an OIDC login.
     *
     * <p>TODO: Migration required - this method previously implemented Spring's {@code
     * OAuth2UserService<OidcUserRequest, OidcUser>.loadUser}. Under quarkus-oidc there is no
     * user-request object handed to application code; instead call this logic from a {@code
     * SecurityIdentityAugmentor} once quarkus-oidc has produced the {@code SecurityIdentity}.
     * Provide the registration/tenant id, the merged claim map and the ID-token claim map from the
     * augmentor's {@code AuthenticationRequestContext} / injected {@code JsonWebToken}.
     *
     * @param registrationId the OIDC tenant/registration id
     * @param subject the standard OIDC {@code sub} claim
     * @param attributes the merged claim/attribute map (ID token + UserInfo)
     * @param idTokenClaims the raw ID-token claims (may be null on unexpected failures)
     * @return the resolved username claim key configured via {@code security.oauth2.useAsUsername}
     */
    public String resolveUser(
            String registrationId,
            String subject,
            Map<String, Object> attributes,
            Map<String, Object> idTokenClaims) {
        boolean debugLogging = Boolean.TRUE.equals(oauth2Properties.getDebugLogging());
        // Resolved inside the try so a bad/null useAsUsername (IllegalArgumentException from
        // valueOf, or NPE on toUpperCase) is caught and wrapped, matching the pre-debugLogging
        // behaviour.
        String usernameAttributeKey = null;

        try {
            usernameAttributeKey =
                    UsernameAttribute.valueOf(oauth2Properties.getUseAsUsername().toUpperCase())
                            .getName();

            if (debugLogging) {
                logClaimDump(
                        "OAuth2/OIDC login claims received",
                        registrationId,
                        usernameAttributeKey,
                        idTokenClaims,
                        attributes,
                        attributes,
                        false);
            }

            // Extract SSO provider information
            String ssoProviderId = subject; // Standard OIDC 'sub' claim
            String username =
                    attributes == null ? null : (String) attributes.get(usernameAttributeKey);

            log.debug(
                    "OAuth2 login - Provider: {}, ProviderId: {}, Username: {}",
                    registrationId,
                    ssoProviderId,
                    username);

            Optional<User> internalUser = userService.findByUsernameIgnoreCase(username);

            if (internalUser.isPresent()) {
                String internalUsername = internalUser.get().getUsername();
                if (loginAttemptService.isBlocked(internalUsername)) {
                    // TODO: Migration required - was org.springframework.security.authentication
                    // .LockedException; surface this as io.quarkus.security.AuthenticationFailedException
                    // (or a custom locked-account exception) from the SecurityIdentityAugmentor.
                    throw new IllegalStateException(
                            "The account "
                                    + internalUsername
                                    + " has been locked due to too many failed login attempts.");
                }
                if (userService.hasPassword(usernameAttributeKey)) {
                    throw new IllegalArgumentException("Password must not be null");
                }
            }

            return usernameAttributeKey;
        } catch (IllegalArgumentException e) {
            log.error("Error loading OIDC user: {}", e.getMessage());
            // Only emit the claim dump if we successfully resolved usernameAttributeKey. A null
            // value here means UsernameAttribute.valueOf rejected the configured useAsUsername
            // before the claims were processed - that error message is self-explanatory and a
            // claim dump would have no resolved-key to compare against.
            if (debugLogging && usernameAttributeKey != null) {
                // The chosen username attribute was rejected. Dump the claims we DID receive so the
                // operator can pick a different value for security.oauth2.useAsUsername.
                logClaimDump(
                        "OAuth2/OIDC login FAILED - dumping received claims",
                        registrationId,
                        usernameAttributeKey,
                        idTokenClaims,
                        null,
                        idTokenClaims == null ? Collections.emptyMap() : idTokenClaims,
                        true);
            }
            // TODO: Migration required - was wrapped as
            // org.springframework.security.oauth2.core.OAuth2AuthenticationException(OAuth2Error);
            // rethrow as io.quarkus.security.AuthenticationFailedException from the augmentor.
            throw e;
        } catch (Exception e) {
            log.error("Unexpected error loading OIDC user", e);
            if (debugLogging && usernameAttributeKey != null && idTokenClaims != null) {
                logClaimDump(
                        "OAuth2/OIDC login FAILED (unexpected error) - dumping ID token claims",
                        registrationId,
                        usernameAttributeKey,
                        idTokenClaims,
                        null,
                        idTokenClaims,
                        true);
            }
            // TODO: Migration required - was OAuth2AuthenticationException("Unexpected error during
            // authentication"); rethrow as io.quarkus.security.AuthenticationFailedException.
            throw new IllegalStateException("Unexpected error during authentication", e);
        }
    }

    /**
     * Emits a multi-line diagnostic dump of the claims returned by the OAuth2/OIDC provider. Only
     * invoked when {@code security.oauth2.debugLogging=true}.
     *
     * @param banner short title for the log block
     * @param registrationId client registration / tenant id (e.g. "demarest", "keycloak")
     * @param usernameAttributeKey the claim key the application is configured to use as username
     * @param idTokenClaims the ID-token claims, may be null on unexpected failures
     * @param userInfoClaims the UserInfo response claims, may be null if the provider returned none
     * @param mergedAttributes the merged attribute map used for {@code getAttribute()}
     * @param failure true if logging in the error path (uses ERROR level), false for INFO
     */
    private void logClaimDump(
            String banner,
            String registrationId,
            String usernameAttributeKey,
            Map<String, Object> idTokenClaims,
            Map<String, Object> userInfoClaims,
            Map<String, Object> mergedAttributes,
            boolean failure) {
        StringBuilder sb = new StringBuilder();
        sb.append("\n========== [OAUTH2 DEBUG] ").append(banner).append(" ==========\n");
        sb.append("Provider registrationId : ").append(registrationId).append('\n');
        sb.append("Configured useAsUsername: ")
                .append(oauth2Properties.getUseAsUsername())
                .append(" (looks up claim key '")
                .append(usernameAttributeKey)
                .append("')\n");

        if (idTokenClaims != null) {
            sb.append("\n-- ID token claims (").append(idTokenClaims.size()).append(") --\n");
            appendClaims(sb, idTokenClaims);
        } else {
            sb.append("\n-- ID token: <null> --\n");
        }

        if (userInfoClaims != null) {
            sb.append("\n-- UserInfo endpoint claims (")
                    .append(userInfoClaims.size())
                    .append(") --\n");
            appendClaims(sb, userInfoClaims);
        } else {
            sb.append("\n-- UserInfo endpoint claims: none returned --\n");
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
                "\nWARNING: this block contains PII. Set security.oauth2.debugLogging=false once"
                        + " troubleshooting is complete.\n");
        sb.append("========== [/OAUTH2 DEBUG] ==========");

        if (failure) {
            log.error(sb.toString());
        } else {
            log.info(sb.toString());
        }
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
