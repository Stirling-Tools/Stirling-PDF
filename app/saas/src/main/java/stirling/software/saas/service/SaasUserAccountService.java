package stirling.software.saas.service;

import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.saas.model.SupabaseUser;
import stirling.software.saas.util.LogRedactionUtils;

/** Saas user lifecycle operations driven by Stripe/Supabase webhooks. */
@Service
@Profile("saas")
@RequiredArgsConstructor
@Slf4j
public class SaasUserAccountService {

    private final UserService userService;
    private final UserRepository userRepository;
    private final UserRoleService userRoleService;
    private final SupabaseUserService supabaseUserService;
    private final SaasUserExtensionService saasUserExtensionService;
    private final SaasTeamExtensionService saasTeamExtensionService;
    private final SaasTeamService saasTeamService;

    /**
     * Resolve a local {@link User} from a Supabase UUID string. Throws if the ID format is invalid
     * or no matching local user row exists.
     */
    public User getUserBySupabaseId(String supabaseId) {
        UUID supabaseUserId;
        try {
            supabaseUserId = UUID.fromString(supabaseId);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid Supabase ID format: " + supabaseId, e);
        }
        return userService
                .findBySupabaseId(supabaseUserId)
                .orElseThrow(
                        () ->
                                new IllegalArgumentException(
                                        "User not found for Supabase ID: " + supabaseId));
    }

    /**
     * Promote a user from {@code ROLE_USER} (free) to {@code ROLE_PRO_USER} (paid). Called by the
     * Stripe-webhook {@code UserRoleWebhookController} after a successful subscription.
     *
     * @return true if a promotion happened, false if the user was already on PRO or higher
     */
    @Transactional
    public boolean handleUpgrade(String supabaseId) {
        User user = getUserBySupabaseId(supabaseId);
        String currentRole = user.getRolesAsString();

        if (Role.USER.getRoleId().equals(currentRole)) {
            userRoleService.upgradeToPro(user);
            return true;
        }
        log.info(
                "User {} already has role {}, no upgrade needed",
                LogRedactionUtils.redactEmail(user.getUsername()),
                currentRole);
        return false;
    }

    /**
     * Demote a user from PRO back to FREE. Multi-member teams keep their PRO access via team
     * membership even if the personal subscription cancels, so users on non-personal teams are left
     * at PRO.
     *
     * @return true if a downgrade happened, false if user was already FREE or kept PRO via team
     */
    @Transactional
    public boolean handleDowngrade(String supabaseId) {
        User user = getUserBySupabaseId(supabaseId);
        String currentRole = user.getRolesAsString();

        if (Role.PRO_USER.getRoleId().equals(currentRole)) {
            Team userTeam = user.getTeam();
            if (userTeam != null && !saasTeamExtensionService.isPersonal(userTeam)) {
                log.info(
                        "User {} is on team {} - keeping PRO access through team membership",
                        LogRedactionUtils.redactEmail(user.getUsername()),
                        userTeam.getName());
                return false;
            }
            userRoleService.downgradeToFree(user);
            return true;
        }
        log.info(
                "User {} has role {}, no downgrade needed",
                LogRedactionUtils.redactEmail(user.getUsername()),
                currentRole);
        return false;
    }

    /**
     * Turn on metered billing so the user can pay for overage. Compatible with PRO (a PRO user
     * still uses credits via the metered fallback for API usage above the cycle pool).
     */
    @Transactional
    public boolean enableMeteredBilling(String supabaseId) {
        User user = getUserBySupabaseId(supabaseId);
        if (saasUserExtensionService.isMeteredBillingEnabled(user)) {
            log.info(
                    "User {} already has metered billing enabled",
                    LogRedactionUtils.redactEmail(user.getUsername()));
            return false;
        }
        saasUserExtensionService.setMeteredBillingEnabled(user, true);
        log.info(
                "Enabled metered billing for user {}",
                LogRedactionUtils.redactEmail(user.getUsername()));
        return true;
    }

    /** Turn off metered billing. Called when the metered subscription is canceled in Stripe. */
    @Transactional
    public boolean disableMeteredBilling(String supabaseId) {
        User user = getUserBySupabaseId(supabaseId);
        if (!saasUserExtensionService.isMeteredBillingEnabled(user)) {
            log.info(
                    "User {} does not have metered billing enabled",
                    LogRedactionUtils.redactEmail(user.getUsername()));
            return false;
        }
        saasUserExtensionService.setMeteredBillingEnabled(user, false);
        log.info(
                "Disabled metered billing for user {}",
                LogRedactionUtils.redactEmail(user.getUsername()));
        return true;
    }

    /** Anonymous -> authenticated upgrade triggered from the frontend after Supabase accepts it. */
    @Transactional
    public User synchronizeUserUpgrade(SupabaseUser supabaseUser, String email, String authMethod) {
        log.debug(
                "Synchronizing user upgrade for SupabaseId: {}, Email: {}",
                LogRedactionUtils.redactSupabaseId(supabaseUser.getId()),
                LogRedactionUtils.redactEmail(email));

        User user =
                userService
                        .findBySupabaseId(supabaseUser.getId())
                        .orElseThrow(
                                () ->
                                        new IllegalStateException(
                                                "No local user linked to Supabase ID "
                                                        + supabaseUser.getId()));

        // Flip is_anonymous on the auth.users mirror.
        if (supabaseUser.isAnonymous()) {
            supabaseUser.setAnonymous(false);
            supabaseUserService.save(supabaseUser);
        }

        // Promote the local row's auth type and email if currently anonymous.
        if (AuthenticationType.ANONYMOUS.name().equalsIgnoreCase(user.getAuthenticationType())) {
            AuthenticationType newType = mapAuthMethodToType(authMethod);
            user.setAuthenticationType(newType);
            if (email != null && !email.isBlank()) {
                user.setEmail(email);
                user.setUsername(email);
            }
            user = userService.saveUser(user);
            // Give the upgraded user their own team rather than the shared Default team.
            user.setTeam(saasTeamService.ensurePersonalTeam(user));
            log.info(
                    "Upgraded anonymous user {} to {} ({})",
                    user.getId(),
                    newType,
                    LogRedactionUtils.redactEmail(email));
        }
        return user;
    }

    private static AuthenticationType mapAuthMethodToType(String authMethod) {
        if (authMethod == null) {
            return AuthenticationType.WEB;
        }
        return switch (authMethod) {
            case "google", "github", "apple", "azure", "linkedin_oidc", "oauth" ->
                    AuthenticationType.OAUTH2;
            default -> AuthenticationType.WEB;
        };
    }
}
