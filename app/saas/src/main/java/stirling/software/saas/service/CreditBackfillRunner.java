package stirling.software.saas.service;

import java.util.List;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

/**
 * ApplicationRunner that backfills user_credits table for existing users who don't have credit rows
 * yet. This prevents existing users from being hard-blocked when the credit system is enabled.
 *
 * <p>This runs once at application startup after the database schema is ready.
 */
@Component
@Profile("saas")
@ConditionalOnProperty(name = "credits.enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class CreditBackfillRunner implements ApplicationRunner {

    private final UserRepository userRepository;
    private final CreditService creditService;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
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
