package stirling.software.saas.service;

import java.util.List;

import io.quarkus.arc.profile.IfBuildProfile;
import io.quarkus.runtime.StartupEvent;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.transaction.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

/**
 * Startup observer that backfills user_credits table for existing users who don't have credit rows
 * yet. This prevents existing users from being hard-blocked when the credit system is enabled.
 *
 * <p>This runs once at application startup after the database schema is ready.
 */
@ApplicationScoped
@IfBuildProfile("saas")
// TODO: Migration required - @ConditionalOnProperty(credits.enabled, matchIfMissing=true) gating not
// translated; backfill always runs under the saas profile
@RequiredArgsConstructor
@Slf4j
public class CreditBackfillRunner {

    private final UserRepository userRepository;
    private final CreditService creditService;

    @Transactional
    void onStartup(@Observes StartupEvent ev) {
        try {
            backfillUserCredits();
        } catch (Exception e) {
            log.error("Failed to backfill user credits", e);
            // Don't throw; this shouldn't prevent app startup
        }
    }

    private void backfillUserCredits() {
        log.info("Starting user credits backfill for existing users...");

        List<User> usersNeedingCredits = userRepository.findUsersWithApiKeyButNoCredits();

        if (usersNeedingCredits.isEmpty()) {
            log.info(
                    "No users need credit backfill; all users with API keys already have credit rows");
            return;
        }

        log.info("Found {} users with API keys that need credit rows", usersNeedingCredits.size());

        int backfilled = 0;
        for (User user : usersNeedingCredits) {
            try {
                // Use the existing getOrCreateUserCredits method which handles proper allocation
                creditService.getOrCreateUserCredits(user);
                backfilled++;

                if (backfilled % 100 == 0) {
                    log.info("Backfilled credits for {} users so far...", backfilled);
                }
            } catch (Exception e) {
                log.warn(
                        "Failed to create credits for user {}: {}",
                        user.getUsername(),
                        e.getMessage());
            }
        }

        log.info("Successfully backfilled user_credits for {} existing users", backfilled);
    }
}
