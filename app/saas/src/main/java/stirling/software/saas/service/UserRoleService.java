package stirling.software.saas.service;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.database.repository.AuthorityRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.config.CreditsProperties;
import stirling.software.saas.util.LogRedactionUtils;

/** Changes user roles and refreshes their credit allocation. */
@ApplicationScoped
@IfBuildProfile("saas")
@RequiredArgsConstructor
@Slf4j
public class UserRoleService {

    private final UserRepository userRepository;
    private final AuthorityRepository authorityRepository;
    private final CreditService creditService;
    private final CreditsProperties creditsProperties;

    /**
     * Change a user's role
     *
     * @param user the user to change
     * @param newRole the new role ID (e.g., "ROLE_USER", "ROLE_PRO_USER")
     */
    @Transactional
    public void changeRole(User user, String newRole) {
        log.debug(
                "Changing role for user {} from {} to {}",
                user.getUsername(),
                user.getRolesAsString(),
                newRole);

        Authority userAuthority = authorityRepository.findByUserId(user.getId());
        userAuthority.setAuthority(newRole);
        authorityRepository.persist(userAuthority);

        // Update denormalized roleName column in User table
        user.setRoleName(newRole);
        userRepository.persist(user);

        log.info(
                "Changed role for user {} to {}",
                LogRedactionUtils.redactEmail(user.getUsername()),
                newRole);
    }

    /**
     * Downgrade a user to FREE tier (ROLE_USER)
     *
     * <p>Changes role from PRO_USER to USER and resets cycle credit allocation to FREE tier.
     *
     * @param user the user to downgrade
     */
    @Transactional
    public void downgradeToFree(User user) {
        log.info(
                "Downgrading user {} to FREE tier",
                LogRedactionUtils.redactEmail(user.getUsername()));

        changeRole(user, Role.USER.getRoleId());

        // Reset credits to FREE tier allocation
        int freeAllocation =
                creditsProperties
                        .getCycle()
                        .getAllocations()
                        .getOrDefault(Role.USER.getRoleId(), 25);
        creditService.resetCycleAllocationForRoleChange(user.getId(), freeAllocation);

        log.info(
                "Successfully downgraded user {} to FREE with {} cycle credits",
                LogRedactionUtils.redactEmail(user.getUsername()),
                freeAllocation);
    }

    /**
     * Upgrade a user to PRO tier (ROLE_PRO_USER)
     *
     * <p>Changes role from USER to PRO_USER and resets cycle credit allocation to PRO tier.
     *
     * @param user the user to upgrade
     */
    @Transactional
    public void upgradeToPro(User user) {
        log.info(
                "Upgrading user {} to PRO tier", LogRedactionUtils.redactEmail(user.getUsername()));

        changeRole(user, Role.PRO_USER.getRoleId());

        // Reset credits to PRO tier allocation
        int proAllocation =
                creditsProperties
                        .getCycle()
                        .getAllocations()
                        .getOrDefault(Role.PRO_USER.getRoleId(), 100);
        creditService.resetCycleAllocationForRoleChange(user.getId(), proAllocation);

        log.info(
                "Successfully upgraded user {} to PRO with {} cycle credits",
                LogRedactionUtils.redactEmail(user.getUsername()),
                proAllocation);
    }

    /**
     * Get credit allocation for a specific role
     *
     * @param roleId the role ID (e.g., "ROLE_USER", "ROLE_PRO_USER")
     * @return the cycle credit allocation for that role
     */
    public int getCreditAllocationForRole(String roleId) {
        return creditsProperties
                .getCycle()
                .getAllocations()
                .getOrDefault(roleId, Role.USER.getRoleId().equals(roleId) ? 25 : 100);
    }
}
