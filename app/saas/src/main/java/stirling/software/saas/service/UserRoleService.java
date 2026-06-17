package stirling.software.saas.service;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.database.repository.AuthorityRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.util.LogRedactionUtils;

/** Changes user roles (and the matching authority grant/revoke). */
@Service
@Profile("saas")
@RequiredArgsConstructor
@Slf4j
public class UserRoleService {

    private final UserRepository userRepository;
    private final AuthorityRepository authorityRepository;

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
        authorityRepository.save(userAuthority);

        // Update denormalized roleName column in User table
        user.setRoleName(newRole);
        userRepository.save(user);

        log.info(
                "Changed role for user {} to {}",
                LogRedactionUtils.redactEmail(user.getUsername()),
                newRole);
    }

    /**
     * Downgrade a user to FREE tier (ROLE_USER)
     *
     * <p>Revokes ROLE_PRO_USER by changing the role/authority from PRO_USER to USER.
     *
     * @param user the user to downgrade
     */
    @Transactional
    public void downgradeToFree(User user) {
        log.info(
                "Downgrading user {} to FREE tier",
                LogRedactionUtils.redactEmail(user.getUsername()));

        changeRole(user, Role.USER.getRoleId());

        log.info(
                "Successfully downgraded user {} to FREE",
                LogRedactionUtils.redactEmail(user.getUsername()));
    }

    /**
     * Upgrade a user to PRO tier (ROLE_PRO_USER)
     *
     * <p>Grants ROLE_PRO_USER by changing the role/authority from USER to PRO_USER.
     *
     * @param user the user to upgrade
     */
    @Transactional
    public void upgradeToPro(User user) {
        log.info(
                "Upgrading user {} to PRO tier", LogRedactionUtils.redactEmail(user.getUsername()));

        changeRole(user, Role.PRO_USER.getRoleId());

        log.info(
                "Successfully upgraded user {} to PRO",
                LogRedactionUtils.redactEmail(user.getUsername()));
    }
}
