package stirling.software.proprietary.security.repository;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

@DataJpaTest(showSql = false)
class UsernameTakenDbTest {

    @Autowired private UserRepository userRepository;
    @PersistenceContext private EntityManager entityManager;

    @Test
    void matchesOtherAccountsInEitherCaseDirection() {
        User upper = user("STIRLING-PDF-BACKEND-API-USER");
        User lower = user("alice");

        assertThat(
                        userRepository.existsByUsernameIgnoreCaseAndIdNot(
                                "stirling-pdf-backend-api-user", lower.getId()))
                .isTrue();
        assertThat(userRepository.existsByUsernameIgnoreCaseAndIdNot("ALICE", upper.getId()))
                .isTrue();
        assertThat(userRepository.existsByUsernameIgnoreCaseAndIdNot("Alice", lower.getId()))
                .isFalse();
        assertThat(userRepository.existsByUsernameIgnoreCaseAndIdNot("nobody", lower.getId()))
                .isFalse();
    }

    @Test
    void existingCaseVariantDuplicatesStillReportTaken() {
        User caller = user("carol");
        user("Dup");
        user("dup");

        assertThat(userRepository.existsByUsernameIgnoreCaseAndIdNot("DUP", caller.getId()))
                .isTrue();
    }

    private User user(String username) {
        User user = new User();
        user.setUsername(username);
        user.setEnabled(true);
        entityManager.persist(user);
        entityManager.flush();
        return user;
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model"
            })
    @EnableJpaRepositories(
            basePackages = {
                "stirling.software.proprietary.security.database.repository",
                "stirling.software.proprietary.security.repository"
            })
    static class TestApp {}
}
