package stirling.software.proprietary.access.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import stirling.software.proprietary.access.service.DefaultPrincipalResolver;
import stirling.software.proprietary.access.service.DefaultTeamLeadLookup;
import stirling.software.proprietary.access.service.PrincipalResolver;
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

    /** USER/TEAM/ORG projection unless another bean is defined (saas ships USER/TEAM only). */
    @Bean
    @ConditionalOnMissingBean(PrincipalResolver.class)
    PrincipalResolver defaultPrincipalResolver(@Value("${security.org.id:1}") long orgId) {
        return new DefaultPrincipalResolver(orgId);
    }
}
