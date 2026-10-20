package stirling.software.proprietary.cache;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
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
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.AuthorityRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.repository.TeamRepository;

@DataJpaTest(
        properties = {
            "spring.jpa.properties.hibernate.cache.use_second_level_cache=true",
            "spring.jpa.properties.hibernate.cache.use_query_cache=false",
            "spring.jpa.properties.hibernate.cache.region.factory_class=org.hibernate.cache.jcache.internal.JCacheRegionFactory",
            "spring.jpa.properties.hibernate.javax.cache.provider=com.github.benmanes.caffeine.jcache.spi.CaffeineCachingProvider",
            "spring.jpa.properties.hibernate.javax.cache.missing_cache_strategy=fail",
            "spring.jpa.properties.hibernate.generate_statistics=true",
            "spring.jpa.properties.jakarta.persistence.sharedCache.mode=ENABLE_SELECTIVE"
        })
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class SecondLevelCacheEvictionTest {

    private static final String USER = User.class.getName();
    private static final String AUTHORITIES = USER + ".authorities";

    @Autowired private UserRepository userRepository;
    @Autowired private AuthorityRepository authorityRepository;
    @Autowired private TeamRepository teamRepository;
    @Autowired private EntityManagerFactory entityManagerFactory;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private SecondLevelCacheEvictor evictor;
    @Autowired private RecordingBroadcaster broadcaster;
    @Autowired private ExternalWriteEvictionService externalWrites;

    private Statistics statistics;
    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        tx = new TransactionTemplate(transactionManager);
        evictor.evictAll();
        broadcaster.clear();
    }

    @Test
    void entityEvictionMakesTheNextReadMissTheCache() {
        Long id = saveUser("evict-entity");
        warm(id);

        evictor.apply(List.of(CacheEviction.entity(USER, id.toString())));

        long missesBefore = statistics.getSecondLevelCacheMissCount();
        warm(id);
        assertThat(statistics.getSecondLevelCacheMissCount()).isGreaterThan(missesBefore);
    }

    @Test
    void loadThatStartedBeforeTheEvictionCannotRepopulateTheCache() {
        Long id = saveUser("evict-race");
        warm(id);

        EntityManager startedBeforeEviction = entityManagerFactory.createEntityManager();
        try {
            evictor.apply(List.of(CacheEviction.entity(USER, id.toString())));

            long putsBefore = statistics.getEntityStatistics(USER).getCachePutCount();
            assertThat(startedBeforeEviction.find(User.class, id)).isNotNull();
            assertThat(statistics.getEntityStatistics(USER).getCachePutCount())
                    .as("a session older than the eviction must not write its load back")
                    .isEqualTo(putsBefore);
        } finally {
            startedBeforeEviction.close();
        }

        long putsBefore = statistics.getEntityStatistics(USER).getCachePutCount();
        warm(id);
        assertThat(statistics.getEntityStatistics(USER).getCachePutCount())
                .as("a session opened after the eviction caches normally")
                .isGreaterThan(putsBefore);
    }

    @Test
    void entityWithCollectionsAlsoDropsTheCachedRoles() {
        Long id = saveUser("evict-graph");
        warmWithAuthorities(id);
        insertAuthorityBehindHibernatesBack(id, "ROLE_EXTERNAL");

        assertThat(roles(id)).doesNotContain("ROLE_EXTERNAL");

        evictor.apply(List.of(CacheEviction.entityWithCollections(USER, id.toString())));

        assertThat(roles(id)).contains("ROLE_EXTERNAL");
    }

    @Test
    void externalRoleUpdateStaysFixedOnEveryReadAfterTheEndpointEvicts() {
        Long id = saveUser("evict-role-in-place");
        warmWithAuthorities(id);
        updateRolesBehindHibernatesBack(id, "ROLE_ADMIN");
        assertThat(roles(id)).containsExactly("ROLE_USER");

        externalWrites.evict(
                new ExternalWriteEvictionService.Request(null, List.of(id), null, null));

        for (int i = 0; i < 3; i++) {
            assertThat(roles(id)).containsExactly("ROLE_ADMIN");
        }
    }

    @Test
    void naturalIdEvictionForgetsTheUsernameMapping() {
        Long id = saveUser("evict-natural");
        assertThat(userRepository.findByUsernameNatural("evict-natural")).isPresent();
        deleteUserBehindHibernatesBack(id);

        evictor.apply(
                List.of(
                        CacheEviction.naturalId(USER, "evict-natural"),
                        CacheEviction.entityWithCollections(USER, id.toString())));

        assertThat(userRepository.findByUsernameNatural("evict-natural")).isEmpty();
    }

    @Test
    void entityRegionEvictionDropsEveryUser() {
        Long first = saveUser("region-a");
        Long second = saveUser("region-b");
        warm(first);
        warm(second);

        evictor.apply(List.of(CacheEviction.entityRegion(USER)));

        long missesBefore = statistics.getSecondLevelCacheMissCount();
        warm(first);
        warm(second);
        assertThat(statistics.getSecondLevelCacheMissCount())
                .isGreaterThanOrEqualTo(missesBefore + 2);
    }

    @Test
    void committedUpdateIsBroadcastToPeers() {
        Long id = saveUser("listener-update");
        broadcaster.clear();

        tx.executeWithoutResult(
                status -> userRepository.findById(id).orElseThrow().setEnabled(false));

        assertThat(broadcaster.peers).contains(CacheEviction.entity(USER, id.toString()));
        assertThat(broadcaster.peers)
                .as("the username did not change")
                .noneMatch(e -> e.kind() == CacheEviction.Kind.NATURAL_ID);
    }

    @Test
    void renameBroadcastsTheRetiredUsername() {
        Long id = saveUser("listener-old-name");
        broadcaster.clear();

        tx.executeWithoutResult(
                status ->
                        userRepository.findById(id).orElseThrow().setUsername("listener-new-name"));

        assertThat(broadcaster.peers).contains(CacheEviction.naturalId(USER, "listener-old-name"));
    }

    @Test
    void rolledBackWriteBroadcastsNothing() {
        Long id = saveUser("listener-rollback");
        broadcaster.clear();

        tx.executeWithoutResult(
                status -> {
                    userRepository.findById(id).orElseThrow().setEnabled(false);
                    userRepository.flush();
                    status.setRollbackOnly();
                });

        assertThat(broadcaster.peers).isEmpty();
        assertThat(broadcaster.everywhere).isEmpty();
    }

    @Test
    void authoritySavedWithoutTheOwnersSetIsEvictedEverywhere() {
        Long id = saveUser("listener-authority");
        warmWithAuthorities(id);
        broadcaster.clear();

        tx.executeWithoutResult(
                status -> {
                    Authority authority = new Authority();
                    authority.setAuthority("ROLE_ADDED");
                    authority.setUser(userRepository.getReferenceById(id));
                    authorityRepository.save(authority);
                });

        assertThat(broadcaster.everywhere)
                .contains(CacheEviction.collection(AUTHORITIES, id.toString()));
        assertThat(roles(id))
                .as("this node's own cached role set is refreshed, not just the peers'")
                .contains("ROLE_ADDED");
    }

    @Test
    void bulkTeamUpdateIsBroadcastToPeersAfterCommit() {
        Long id = saveUser("listener-bulk");
        Long teamId =
                tx.execute(
                        status -> {
                            Team team = new Team();
                            team.setName("bulk-team");
                            return teamRepository.save(team).getId();
                        });
        broadcaster.clear();

        tx.executeWithoutResult(
                status -> {
                    userRepository.updateUserTeamId(id, teamId);
                    assertThat(broadcaster.peers).as("nothing before the commit").isEmpty();
                });

        assertThat(broadcaster.peers).contains(CacheEviction.entity(USER, id.toString()));
    }

    private Long saveUser(String username) {
        AtomicReference<Long> id = new AtomicReference<>();
        tx.executeWithoutResult(
                status -> {
                    User user = new User();
                    user.setUsername(username);
                    user.setPassword("secret123");
                    User saved = userRepository.save(user);
                    new Authority("ROLE_USER", saved);
                    id.set(saved.getId());
                });
        return id.get();
    }

    private void warm(Long id) {
        tx.executeWithoutResult(status -> userRepository.findById(id).orElseThrow());
    }

    private void warmWithAuthorities(Long id) {
        roles(id);
        roles(id);
    }

    private List<String> roles(Long id) {
        return tx.execute(
                status ->
                        userRepository.findById(id).orElseThrow().getAuthorities().stream()
                                .map(Authority::getAuthority)
                                .toList());
    }

    private void insertAuthorityBehindHibernatesBack(Long userId, String role) {
        tx.executeWithoutResult(
                status ->
                        entityManagerFactory
                                .createEntityManager()
                                .unwrap(org.hibernate.Session.class)
                                .doWork(
                                        connection -> {
                                            try (var statement =
                                                    connection.prepareStatement(
                                                            "insert into authorities (authority,"
                                                                    + " user_id) values (?, ?)")) {
                                                statement.setString(1, role);
                                                statement.setLong(2, userId);
                                                statement.executeUpdate();
                                            }
                                        }));
    }

    private void updateRolesBehindHibernatesBack(Long userId, String role) {
        entityManagerFactory
                .createEntityManager()
                .unwrap(org.hibernate.Session.class)
                .doWork(
                        connection -> {
                            try (var statement =
                                    connection.prepareStatement(
                                            "update authorities set authority = ? where user_id = ?")) {
                                statement.setString(1, role);
                                statement.setLong(2, userId);
                                statement.executeUpdate();
                            }
                        });
    }

    private void deleteUserBehindHibernatesBack(Long userId) {
        EntityManager em = entityManagerFactory.createEntityManager();
        try {
            em.getTransaction().begin();
            em.createNativeQuery("delete from authorities where user_id = :id")
                    .setParameter("id", userId)
                    .executeUpdate();
            em.createNativeQuery("delete from user_settings where user_id = :id")
                    .setParameter("id", userId)
                    .executeUpdate();
            em.createNativeQuery("delete from users where user_id = :id")
                    .setParameter("id", userId)
                    .executeUpdate();
            em.getTransaction().commit();
        } finally {
            em.close();
        }
    }

    static class RecordingBroadcaster implements CacheEvictionBroadcaster {
        private final SecondLevelCacheEvictor evictor;
        final List<CacheEviction> peers = new ArrayList<>();
        final List<CacheEviction> everywhere = new ArrayList<>();

        RecordingBroadcaster(SecondLevelCacheEvictor evictor) {
            this.evictor = evictor;
        }

        @Override
        public synchronized void broadcast(Collection<CacheEviction> evictions) {
            everywhere.addAll(evictions);
            evictor.apply(evictions);
        }

        @Override
        public synchronized void broadcastToPeers(Collection<CacheEviction> evictions) {
            peers.addAll(evictions);
        }

        synchronized void clear() {
            peers.clear();
            everywhere.clear();
        }
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    @EntityScan(basePackages = "stirling.software.proprietary")
    @EnableJpaRepositories(basePackages = "stirling.software.proprietary")
    @Import({
        SecondLevelCacheEvictor.class,
        SecondLevelCacheEvictionListener.class,
        ExternalWriteEvictionService.class
    })
    static class TestApp {
        @Bean
        RecordingBroadcaster recordingBroadcaster(SecondLevelCacheEvictor evictor) {
            return new RecordingBroadcaster(evictor);
        }
    }
}
