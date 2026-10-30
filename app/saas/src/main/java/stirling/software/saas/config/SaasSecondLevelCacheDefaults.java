package stirling.software.saas.config;

import java.util.Map;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import stirling.software.common.model.ApplicationProperties.SecondLevelCache.Region;
import stirling.software.proprietary.security.configuration.SecondLevelCacheRegionDefaults;

@Configuration
@Profile("saas")
public class SaasSecondLevelCacheDefaults {

    @Bean
    SecondLevelCacheRegionDefaults saasSecondLevelCacheRegionDefaults() {
        return new SecondLevelCacheRegionDefaults(
                Map.of(
                        "users", maxEntries(200_000L),
                        "usersNaturalId", maxEntries(50_000L),
                        "teams", maxEntries(50_000L)));
    }

    private static Region maxEntries(long maxEntries) {
        Region region = new Region();
        region.setMaxEntries(maxEntries);
        return region;
    }
}
