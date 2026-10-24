package stirling.software.saas.model;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;
import stirling.software.saas.repository.SaasTeamExtensionsRepository;
import stirling.software.saas.repository.SaasUserExtensionsRepository;

/**
 * The sidecars are removed by the database's {@code ON DELETE CASCADE}, which Hibernate does not
 * see as an entity-delete: with a second-level cache a primary-key lookup would serve the deleted
 * row until the region expired. Pins the lifecycle so re-enabling caching requires delete-path
 * eviction.
 */
@DataJpaTest(
        properties = {
            "spring.jpa.properties.hibernate.cache.use_second_level_cache=true",
            "spring.jpa.properties.hibernate.cache.use_query_cache=false",
            "spring.jpa.properties.hibernate.cache.region.factory_class=org.hibernate.cache.jcache.internal.JCacheRegionFactory",
            "spring.jpa.properties.hibernate.javax.cache.provider=com.github.benmanes.caffeine.jcache.spi.CaffeineCachingProvider",
            "spring.jpa.properties.jakarta.persistence.sharedCache.mode=ENABLE_SELECTIVE"
        })
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class SaasSidecarDeleteTest {

    @Autowired private UserRepository userRepository;
    @Autowired private TeamRepository teamRepository;
    @Autowired private SaasUserExtensionsRepository userExtensionsRepository;
    @Autowired private SaasTeamExtensionsRepository teamExtensionsRepository;
    @Autowired private EntityManagerFactory entityManagerFactory;
    @Autowired private EntityManager entityManager;
    @Autowired private PlatformTransactionManager transactionManager;

    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        tx = new TransactionTemplate(transactionManager);
    }

    @Test
    void deletedUserSidecarIsNotReadable() {
        AtomicLong userId = new AtomicLong();
        tx.executeWithoutResult(
                status -> {
                    User user = new User();
                    user.setUsername("cascade-delete-user");
                    user.setPassword("x");
                    user = userRepository.save(user);
                    userId.set(user.getId());
                    userExtensionsRepository.save(new SaasUserExtensions(user));
                    entityManager.flush();
                });

        tx.executeWithoutResult(
                status -> userExtensionsRepository.findById(userId.get()).orElseThrow());

        // The real deletion path: UserService.deleteUser ends in userRepository.delete(user).
        tx.executeWithoutResult(
                status ->
                        userRepository.delete(userRepository.findById(userId.get()).orElseThrow()));

        tx.executeWithoutResult(
                status ->
                        assertThat(userExtensionsRepository.findById(userId.get()))
                                .as(
                                        "a cascade-deleted sidecar must not be resolved after the parent"
                                                + " delete commits")
                                .isEmpty());
        assertThat(entityManagerFactory.getCache().contains(SaasUserExtensions.class, userId.get()))
                .isFalse();
    }

    @Test
    void deletedTeamSidecarIsNotReadable() {
        AtomicLong teamId = new AtomicLong();
        tx.executeWithoutResult(
                status -> {
                    Team team = new Team();
                    team.setName("cascade-delete-team");
                    team = teamRepository.save(team);
                    teamId.set(team.getId());
                    SaasTeamExtensions extensions = new SaasTeamExtensions();
                    extensions.setTeam(team);
                    teamExtensionsRepository.save(extensions);
                    entityManager.flush();
                });

        tx.executeWithoutResult(
                status -> teamExtensionsRepository.findById(teamId.get()).orElseThrow());

        // The real deletion path: TeamController deletes the row through the repository.
        tx.executeWithoutResult(
                status ->
                        teamRepository.delete(teamRepository.findById(teamId.get()).orElseThrow()));

        tx.executeWithoutResult(
                status ->
                        assertThat(teamExtensionsRepository.findById(teamId.get()))
                                .as(
                                        "a cascade-deleted sidecar must not be resolved after the parent"
                                                + " delete commits")
                                .isEmpty());
        assertThat(entityManagerFactory.getCache().contains(SaasTeamExtensions.class, teamId.get()))
                .isFalse();
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    @EntityScan(
            basePackages = {
                "stirling.software.saas",
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model"
            })
    @EnableJpaRepositories(
            basePackages = {
                "stirling.software.saas",
                "stirling.software.proprietary.security.database.repository",
                "stirling.software.proprietary.security.repository"
            })
    static class TestApp {}
}
