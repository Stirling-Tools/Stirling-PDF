package stirling.software.proprietary.cache;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
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

import jakarta.persistence.EntityManagerFactory;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.policy.store.PolicyEntity;
import stirling.software.proprietary.policy.store.PolicyRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;

@DataJpaTest(
        properties = {
            "spring.jpa.properties.hibernate.cache.use_second_level_cache=true",
            "spring.jpa.properties.hibernate.cache.use_query_cache=false",
            "spring.jpa.properties.hibernate.cache.region.factory_class=org.hibernate.cache.jcache.internal.JCacheRegionFactory",
            "spring.jpa.properties.hibernate.javax.cache.provider=com.github.benmanes.caffeine.jcache.spi.CaffeineCachingProvider",
            "spring.jpa.properties.hibernate.generate_statistics=true",
            "spring.jpa.properties.jakarta.persistence.sharedCache.mode=ENABLE_SELECTIVE"
        })
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class HibernateSecondLevelCacheTest {

    @Autowired private PolicyRepository policyRepository;

    @Autowired private UserRepository userRepository;

    @Autowired private TeamRepository teamRepository;

    @Autowired private EntityManagerFactory entityManagerFactory;

    @Autowired private PlatformTransactionManager transactionManager;

    private SessionFactory sessionFactory;
    private Statistics statistics;
    private TransactionTemplate txTemplate;

    @BeforeEach
    void setUp() {
        sessionFactory = entityManagerFactory.unwrap(SessionFactory.class);
        statistics = sessionFactory.getStatistics();
        statistics.setStatisticsEnabled(true);
        txTemplate = new TransactionTemplate(transactionManager);
        statistics.clear();
    }

    @Test
    void testSecondLevelCacheHitOnEntityFind() {
        // Step 1: Save entity in Transaction 1 (commits and puts into L2 cache)
        txTemplate.executeWithoutResult(
                status -> {
                    PolicyEntity policy = new PolicyEntity();
                    policy.setId("cache-test-policy-1");
                    policy.setName("Cache Test Policy");
                    policy.setEnabled(true);
                    policy.setOwner("admin");
                    policyRepository.save(policy);
                });

        long hitsBefore = statistics.getSecondLevelCacheHitCount();

        // Step 2: Read entity in Transaction 2 (should hit L2 cache)
        txTemplate.executeWithoutResult(
                status -> {
                    PolicyEntity loaded =
                            policyRepository.findById("cache-test-policy-1").orElseThrow();
                    assertThat(loaded.getName()).isEqualTo("Cache Test Policy");
                });

        long hitsAfter = statistics.getSecondLevelCacheHitCount();
        assertThat(hitsAfter).isGreaterThan(hitsBefore);
    }

    @Test
    void testSecondLevelCacheEvictionOnEntityUpdate() {
        // Step 1: Save entity in Transaction 1
        txTemplate.executeWithoutResult(
                status -> {
                    PolicyEntity policy = new PolicyEntity();
                    policy.setId("cache-test-policy-2");
                    policy.setName("Initial Name");
                    policy.setEnabled(true);
                    policy.setOwner("admin");
                    policyRepository.save(policy);
                });

        // Step 2: Read in Transaction 2 (populates/hits L2 cache)
        txTemplate.executeWithoutResult(
                status -> {
                    PolicyEntity loaded =
                            policyRepository.findById("cache-test-policy-2").orElseThrow();
                    assertThat(loaded.getName()).isEqualTo("Initial Name");
                });

        // Step 3: Update entity in Transaction 3 (evicts/updates L2 cache on commit)
        txTemplate.executeWithoutResult(
                status -> {
                    PolicyEntity toUpdate =
                            policyRepository.findById("cache-test-policy-2").orElseThrow();
                    toUpdate.setName("Updated Name");
                    policyRepository.save(toUpdate);
                });

        // Step 4: Read after update in Transaction 4 (reflects updated state)
        txTemplate.executeWithoutResult(
                status -> {
                    PolicyEntity reloaded =
                            policyRepository.findById("cache-test-policy-2").orElseThrow();
                    assertThat(reloaded.getName()).isEqualTo("Updated Name");
                });
    }

    @Test
    void testUserAndTeamSecondLevelCacheAndEviction() {
        AtomicReference<Long> userIdRef = new AtomicReference<>();
        AtomicReference<Long> teamIdRef = new AtomicReference<>();

        // Save Team and User in Transaction 1
        txTemplate.executeWithoutResult(
                status -> {
                    Team team = new Team();
                    team.setName("Cache Team");
                    team = teamRepository.save(team);
                    teamIdRef.set(team.getId());

                    User user = new User();
                    user.setUsername("cacheuser");
                    user.setPassword("secret123");
                    user.setTeam(team);
                    user = userRepository.save(user);
                    userIdRef.set(user.getId());
                });

        // Read user by ID in Transaction 2 (loads and populates L2 cache)
        txTemplate.executeWithoutResult(
                status -> {
                    User loaded = userRepository.findById(userIdRef.get()).orElseThrow();
                    assertThat(loaded.getUsername()).isEqualTo("cacheuser");
                });

        long hitsBefore = statistics.getSecondLevelCacheHitCount();

        // Read user by ID in Transaction 3 (must HIT L2 cache)
        txTemplate.executeWithoutResult(
                status -> {
                    User loaded = userRepository.findById(userIdRef.get()).orElseThrow();
                    assertThat(loaded.getUsername()).isEqualTo("cacheuser");
                });

        long hitsAfter = statistics.getSecondLevelCacheHitCount();
        assertThat(hitsAfter).isGreaterThan(hitsBefore);

        // Explicit eviction test
        entityManagerFactory.getCache().evict(User.class, userIdRef.get());

        // Check cache does not contain user after explicit eviction
        assertThat(entityManagerFactory.getCache().contains(User.class, userIdRef.get())).isFalse();
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    @EntityScan(basePackages = "stirling.software.proprietary")
    @EnableJpaRepositories(basePackages = "stirling.software.proprietary")
    static class TestApp {}
}
