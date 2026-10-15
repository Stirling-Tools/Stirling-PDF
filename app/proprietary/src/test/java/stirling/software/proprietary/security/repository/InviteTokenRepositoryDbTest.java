package stirling.software.proprietary.security.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import stirling.software.proprietary.security.model.InviteToken;

/**
 * Exercises the conditional consume against a real (H2) database, so the {@code used = false}
 * predicate that makes a single-use link single-use is actually run rather than mocked.
 */
@DataJpaTest
class InviteTokenRepositoryDbTest {

    @Autowired private InviteTokenRepository repository;

    private InviteToken storedInvite() {
        InviteToken invite = new InviteToken();
        invite.setToken("tok");
        invite.setEmail("invitee@example.com");
        invite.setRole("ROLE_USER");
        invite.setExpiresAt(LocalDateTime.now().plusHours(24));
        invite.setCreatedBy("admin");
        return repository.saveAndFlush(invite);
    }

    @Test
    void consumeIfUnusedSucceedsOnceAndThenReportsNothingToConsume() {
        InviteToken invite = storedInvite();
        LocalDateTime now = LocalDateTime.now();

        assertEquals(1, repository.consumeIfUnused(invite.getId(), now));
        assertEquals(0, repository.consumeIfUnused(invite.getId(), now));
    }

    @Test
    void consumeIfUnusedMarksTheTokenUsed() {
        InviteToken invite = storedInvite();
        // Truncated: H2 stores fewer sub-second digits than LocalDateTime.now() carries.
        LocalDateTime consumedAt = LocalDateTime.now().truncatedTo(ChronoUnit.MILLIS);

        repository.consumeIfUnused(invite.getId(), consumedAt);

        InviteToken reloaded = repository.findByToken("tok").orElseThrow();
        assertTrue(reloaded.isUsed());
        assertEquals(consumedAt, reloaded.getUsedAt());
    }

    @Test
    void consumeIfUnusedReportsNothingForAnUnknownToken() {
        assertEquals(0, repository.consumeIfUnused(999_999L, LocalDateTime.now()));
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model",
                "stirling.software.proprietary.access.model"
            })
    @EnableJpaRepositories(basePackageClasses = InviteTokenRepository.class)
    static class TestApp {}
}
