package stirling.software.proprietary.access.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import stirling.software.proprietary.access.service.DefaultTeamLeadLookup;
import stirling.software.proprietary.access.service.TeamLeadLookup;

/** Access-layer bean wiring. */
@Configuration
public class AccessConfig {

    /** No-op {@link TeamLeadLookup} unless another bean is defined. */
    @Bean
    @ConditionalOnMissingBean(TeamLeadLookup.class)
    TeamLeadLookup defaultTeamLeadLookup() {
        return new DefaultTeamLeadLookup();
    }
}
