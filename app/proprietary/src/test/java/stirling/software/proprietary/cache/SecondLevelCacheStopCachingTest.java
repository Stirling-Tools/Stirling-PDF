package stirling.software.proprietary.cache;

import static org.assertj.core.api.Assertions.assertThat;

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.Import;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import jakarta.persistence.EntityManagerFactory;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;

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
@DirtiesContext
class SecondLevelCacheStopCachingTest {

    @Autowired private UserRepository userRepository;
    @Autowired private EntityManagerFactory entityManagerFactory;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private SecondLevelCacheEvictor evictor;

    @Test
    void stoppedCacheServesNothingFromMemory() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        Statistics statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        Long id =
                tx.execute(
                        status -> {
                            User user = new User();
                            user.setUsername("stop-caching");
                            user.setPassword("secret123");
                            return userRepository.save(user).getId();
                        });
        tx.executeWithoutResult(status -> userRepository.findById(id).orElseThrow());

        evictor.stopCaching();

        long hitsBefore = statistics.getSecondLevelCacheHitCount();
        for (int i = 0; i < 3; i++) {
            tx.executeWithoutResult(status -> userRepository.findById(id).orElseThrow());
        }
        assertThat(statistics.getSecondLevelCacheHitCount()).isEqualTo(hitsBefore);
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    @EntityScan(basePackages = "stirling.software.proprietary")
    @EnableJpaRepositories(basePackages = "stirling.software.proprietary")
    @Import(SecondLevelCacheEvictor.class)
    static class TestApp {}
}
