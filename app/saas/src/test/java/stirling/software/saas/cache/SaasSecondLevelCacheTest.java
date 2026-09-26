package stirling.software.saas.cache;

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

import stirling.software.saas.legal.LegalConsent;
import stirling.software.saas.legal.LegalConsentRepository;

/**
 * Boots the SaaS entities under the same fail-fast cache strategy production uses. A typo in a SaaS
 * {@code @Cache} region would otherwise pass the proprietary suite and fail only in a SaaS runtime,
 * and an uncached SaaS entity would silently skip the second-level cache.
 */
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
class SaasSecondLevelCacheTest {

    @Autowired private LegalConsentRepository consentRepository;

    @Autowired private EntityManagerFactory entityManagerFactory;

    @Autowired private PlatformTransactionManager transactionManager;

    private Statistics statistics;
    private TransactionTemplate txTemplate;

    @BeforeEach
    void setUp() {
        statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        txTemplate = new TransactionTemplate(transactionManager);
        statistics.clear();
    }

    @Test
    void saasConsentRegionCachesAcrossTransactions() {
        AtomicReference<Long> consentIdRef = new AtomicReference<>();

        txTemplate.executeWithoutResult(
                status -> {
                    LegalConsent consent = new LegalConsent();
                    consent.setTeamId(7L);
                    consent.setUserId(42L);
                    consent.setDocumentId("eula");
                    consent.setDocumentVersion("2026.09");
                    consent.setContext("trial");
                    consentIdRef.set(consentRepository.save(consent).getConsentId());
                });

        txTemplate.executeWithoutResult(
                status -> {
                    LegalConsent loaded =
                            consentRepository.findById(consentIdRef.get()).orElseThrow();
                    assertThat(loaded.getDocumentId()).isEqualTo("eula");
                });

        long hitsBefore = statistics.getSecondLevelCacheHitCount();

        txTemplate.executeWithoutResult(
                status -> {
                    LegalConsent loaded =
                            consentRepository.findById(consentIdRef.get()).orElseThrow();
                    assertThat(loaded.getDocumentVersion()).isEqualTo("2026.09");
                });

        assertThat(statistics.getSecondLevelCacheHitCount()).isGreaterThan(hitsBefore);
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    // SaaS entities associate back to proprietary ones (e.g. TeamInvitation.inviteeUser), so
    // both packages join one persistence unit exactly like the SaaS runtime.
    @EntityScan(basePackages = {"stirling.software.saas", "stirling.software.proprietary"})
    @EnableJpaRepositories(basePackages = "stirling.software.saas.legal")
    static class TestApp {}
}
