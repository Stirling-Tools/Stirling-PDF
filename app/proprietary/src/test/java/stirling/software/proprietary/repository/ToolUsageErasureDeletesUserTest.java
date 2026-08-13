package stirling.software.proprietary.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import jakarta.persistence.EntityManager;

import stirling.software.proprietary.model.ToolChainStat;
import stirling.software.proprietary.model.ToolRecommendationDismissal;
import stirling.software.proprietary.model.ToolUsageStat;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;

/**
 * Replays the statement order of {@code UserService.deleteUser}: the two erasure queries run first,
 * then the same {@code User} instance is deleted. A persistence-context clear inside either erasure
 * would detach that instance and turn the delete into a merge, so this guards the whole sequence.
 */
@DataJpaTest
class ToolUsageErasureDeletesUserTest {

    private static final long DAY = 20_000;
    private static final String NONE = ToolUsageStat.NO_PREVIOUS_TOOL;

    @Autowired private UserRepository userRepository;
    @Autowired private ToolUsageStatRepository usageRepository;
    @Autowired private ToolChainStatRepository chainRepository;
    @Autowired private ToolRecommendationDismissalRepository dismissalRepository;
    @Autowired private EntityManager entityManager;

    private Long seedUser(String username) {
        User user = new User();
        user.setUsername(username);
        user.setPassword("x");
        new Authority("ROLE_USER", user);
        user.getSettings().put("theme", "dark");
        entityManager.persist(user);

        usageRepository.save(new ToolUsageStat(username, NONE, "ocr", DAY, 1));
        usageRepository.save(new ToolUsageStat(username, "compare", "merge", DAY - 5, 2));
        chainRepository.save(new ToolChainStat(username, "compare>merge", DAY, 2, 2));
        dismissalRepository.save(new ToolRecommendationDismissal(username, "compare", "ocr"));
        entityManager.flush();
        entityManager.clear();
        return user.getId();
    }

    private long countSettings(Long userId) {
        return ((Number)
                        entityManager
                                .createNativeQuery(
                                        "SELECT COUNT(*) FROM user_settings WHERE user_id = :id")
                                .setParameter("id", userId)
                                .getSingleResult())
                .longValue();
    }

    @Test
    @DisplayName("erasing tool usage then deleting the user removes the user and all its rows")
    void erasureThenDeleteRemovesEverything() {
        Long deletedId = seedUser("tracked");
        Long keptId = seedUser("bystander");

        User user = userRepository.findByUsernameIgnoreCase("tracked").orElseThrow();

        usageRepository.deleteByPrincipal("tracked");
        chainRepository.deleteByPrincipal("tracked");
        dismissalRepository.deleteByPrincipal("tracked");

        // The erasures must leave the user managed, or delete() merges (and cascades) instead
        assertThat(entityManager.contains(user)).isTrue();

        userRepository.delete(user);
        entityManager.flush();
        entityManager.clear();

        assertThat(userRepository.findByUsernameIgnoreCase("tracked")).isEmpty();
        assertThat(
                        entityManager
                                .createQuery(
                                        "SELECT a FROM Authority a WHERE a.user.id = :id",
                                        Authority.class)
                                .setParameter("id", deletedId)
                                .getResultList())
                .isEmpty();
        assertThat(countSettings(deletedId)).isZero();
        assertThat(usageRepository.findAll())
                .extracting(ToolUsageStat::getPrincipal)
                .containsOnly("bystander");
        assertThat(chainRepository.findAll())
                .extracting(ToolChainStat::getPrincipal)
                .containsOnly("bystander");
        assertThat(dismissalRepository.findByPrincipal("tracked")).isEmpty();

        // The bystander is untouched by any of it
        assertThat(userRepository.findByUsernameIgnoreCase("bystander")).isPresent();
        assertThat(dismissalRepository.findByPrincipal("bystander")).hasSize(1);
        assertThat(countSettings(keptId)).isEqualTo(1);
    }

    @Test
    @DisplayName("erasure does not detach unrelated entities loaded earlier in the transaction")
    void erasureLeavesTheContextIntact() {
        seedUser("tracked");

        User user = userRepository.findByUsernameIgnoreCase("tracked").orElseThrow();
        List<ToolUsageStat> before = usageRepository.findAll();

        usageRepository.deleteByPrincipal("tracked");
        chainRepository.deleteByPrincipal("tracked");
        dismissalRepository.deleteByPrincipal("tracked");

        assertThat(entityManager.contains(user)).isTrue();
        assertThat(before).isNotEmpty();
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model",
                "stirling.software.proprietary.access.model"
            })
    @EnableJpaRepositories(
            basePackages = {
                "stirling.software.proprietary.repository",
                "stirling.software.proprietary.security.database.repository"
            })
    static class TestApp {}
}
