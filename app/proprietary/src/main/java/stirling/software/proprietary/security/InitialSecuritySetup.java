package stirling.software.proprietary.security;

import java.sql.SQLException;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.common.model.exception.UnsupportedProviderException;
import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.DatabaseServiceInterface;
import stirling.software.proprietary.security.service.SaveUserRequest;
import stirling.software.proprietary.security.service.TeamMembershipService;
import stirling.software.proprietary.security.service.TeamService;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.UserLicenseSettingsService;

@Slf4j
@Component
@RequiredArgsConstructor
public class InitialSecuritySetup {

    @Value("${v2:false}")
    private boolean v2Enabled = false;

    private final UserService userService;
    private final TeamService teamService;
    private final ApplicationProperties applicationProperties;
    private final DatabaseServiceInterface databaseService;
    private final UserLicenseSettingsService licenseSettingsService;
    private final Environment environment;
    private final TeamMembershipService teamMembershipService;

    /**
     * SaaS skips the self-host bootstrap: full-table backfills stall startup at SaaS scale, and
     * team assignment happens per-user in SupabaseAuthenticationFilter instead.
     */
    private boolean isSaas() {
        return Arrays.asList(environment.getActiveProfiles()).contains("saas");
    }

    // Peers racing a cold shared DB collide on a different row each pass, and each collision means
    // a peer committed that row - so a bounded loop converges; one retry is not enough.
    private static final int BOOTSTRAP_RACE_ATTEMPTS = 6;

    @PostConstruct
    public void init() {
        try {
            boolean restoredFromBackup = importBackupIfNeeded();
            for (int attempt = 1; ; attempt++) {
                try {
                    runBootstrap(restoredFromBackup);
                    return;
                } catch (DataAccessException e) {
                    if (attempt >= BOOTSTRAP_RACE_ATTEMPTS) {
                        throw e;
                    }
                    log.info(
                            "Security bootstrap lost a race to a peer node (attempt {}/{});"
                                    + " re-running against its committed rows.",
                            attempt,
                            BOOTSTRAP_RACE_ATTEMPTS);
                }
            }
        } catch (IllegalArgumentException
                | SQLException
                | UnsupportedProviderException
                | DataAccessException e) {
            // Widened for diagnosis, not recovery: unrecoverable cases such as duplicate team rows
            // (tracked separately) still just exhaust the attempts and exit here.
            log.error("Failed to initialize security setup.", e);
            System.exit(1);
        }
    }

    // Restoring a backup replays the whole schema, so it must run outside the retry loop.
    private boolean importBackupIfNeeded() {
        if (userService.hasUsers() || !databaseService.hasBackup()) {
            return false;
        }
        databaseService.importDatabase();
        return true;
    }

    private void runBootstrap(boolean restoredFromBackup)
            throws IllegalArgumentException, SQLException, UnsupportedProviderException {
        if (!restoredFromBackup && !userService.hasUsers()) {
            initializeAdminUser();
        }

        configureJWTSettings();
        initializeInternalApiUser();
        if (isSaas()) {
            log.info(
                    "SaaS profile active - skipping self-host user-table bootstrap"
                            + " (default-team backfill, seat-license grandfathering).");
        } else {
            assignUsersToDefaultTeamIfMissing();
            initializeUserLicenseSettings();
        }
    }

    private void initializeUserLicenseSettings() {
        licenseSettingsService.initializeGrandfatheredCount();
        licenseSettingsService.updateLicenseMaxUsers();
        licenseSettingsService.grandfatherExistingOAuthUsers();
    }

    private void configureJWTSettings() {
        ApplicationProperties.Security.Jwt jwtProperties =
                applicationProperties.getSecurity().getJwt();

        boolean jwtEnabled = jwtProperties.isEnableKeystore();
        if (!v2Enabled || !jwtEnabled) {
            log.debug(
                    "V2 enabled: {}, JWT enabled: {} - disabling all JWT features",
                    v2Enabled,
                    jwtEnabled);

            jwtProperties.setEnableKeyCleanup(false);
        }
    }

    private void assignUsersToDefaultTeamIfMissing() {
        Team defaultTeam = teamService.getOrCreateDefaultTeam();
        Team internalTeam = teamService.getOrCreateInternalTeam();
        List<User> usersWithoutTeam = userService.getUsersWithoutTeam();

        for (User user : usersWithoutTeam) {
            if (user.getUsername().equalsIgnoreCase(Role.INTERNAL_API_USER.getRoleId())) {
                user.setTeam(internalTeam);
            } else {
                user.setTeam(defaultTeam);
            }
        }

        // A null team_id is the retry guard, so commit it last: syncMembership is idempotent and
        // only needs the already-persisted team id, so a half-done pass is re-found and finished.
        usersWithoutTeam.forEach(teamMembershipService::syncMembership);
        userService.saveAll(usersWithoutTeam); // batch save
        if (usersWithoutTeam != null && !usersWithoutTeam.isEmpty()) {
            log.info(
                    "Assigned {} user(s) without a team to the default team.",
                    usersWithoutTeam.size());
        }
    }

    private void initializeAdminUser() throws SQLException, UnsupportedProviderException {
        String initialUsername =
                applicationProperties.getSecurity().getInitialLogin().getUsername();
        String initialPassword =
                applicationProperties.getSecurity().getInitialLogin().getPassword();
        if (initialUsername != null
                && !initialUsername.isEmpty()
                && initialPassword != null
                && !initialPassword.isEmpty()
                && userService.findByUsernameIgnoreCase(initialUsername).isEmpty()) {

            Team team = teamService.getOrCreateDefaultTeam();
            SaveUserRequest.Builder builder =
                    SaveUserRequest.builder()
                            .username(initialUsername)
                            .password(initialPassword)
                            .team(team)
                            .role(Role.ADMIN.getRoleId())
                            .firstLogin(false);
            userService.saveUserCore(builder.build());
            log.info("Admin user created: {}", initialUsername);
        } else {
            createDefaultAdminUser();
        }
    }

    private void createDefaultAdminUser() throws SQLException, UnsupportedProviderException {
        String defaultUsername = "admin";
        String defaultPassword = "stirling";

        if (userService.findByUsernameIgnoreCase(defaultUsername).isEmpty()) {
            Team team = teamService.getOrCreateDefaultTeam();
            SaveUserRequest.Builder builder =
                    SaveUserRequest.builder()
                            .username(defaultUsername)
                            .password(defaultPassword)
                            .team(team)
                            .role(Role.ADMIN.getRoleId())
                            .firstLogin(true);
            userService.saveUserCore(builder.build());
            log.info("Default admin user created: {}", defaultUsername);
        }
    }

    private void initializeInternalApiUser()
            throws IllegalArgumentException, SQLException, UnsupportedProviderException {
        if (!userService.usernameExistsIgnoreCase(Role.INTERNAL_API_USER.getRoleId())) {
            Team team = teamService.getOrCreateInternalTeam();
            SaveUserRequest.Builder builder =
                    SaveUserRequest.builder()
                            .username(Role.INTERNAL_API_USER.getRoleId())
                            .password(UUID.randomUUID().toString())
                            .team(team)
                            .role(Role.INTERNAL_API_USER.getRoleId())
                            .firstLogin(false);
            userService.saveUserCore(builder.build());
            userService.addApiKeyToUser(Role.INTERNAL_API_USER.getRoleId());
            log.info("Internal API user created: {}", Role.INTERNAL_API_USER.getRoleId());
        } else {
            Optional<User> internalApiUserOpt =
                    userService.findByUsernameIgnoreCase(Role.INTERNAL_API_USER.getRoleId());
            if (internalApiUserOpt.isPresent()) {
                User internalApiUser = internalApiUserOpt.get();
                // move to team internal API user
                if (!TeamService.INTERNAL_TEAM_NAME.equals(internalApiUser.getTeam().getName())) {
                    log.info(
                            "Moving internal API user to team: {}", TeamService.INTERNAL_TEAM_NAME);
                    Team internalTeam = teamService.getOrCreateInternalTeam();

                    userService.changeUserTeam(internalApiUser, internalTeam);
                }
            }
        }
        userService.syncCustomApiUser(applicationProperties.getSecurity().getCustomGlobalAPIKey());
    }
}
