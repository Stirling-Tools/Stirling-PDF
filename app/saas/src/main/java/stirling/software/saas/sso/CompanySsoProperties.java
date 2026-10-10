package stirling.software.saas.sso;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

/**
 * Operator-owned enterprise entitlement and verified discovery domains; never customer supplied.
 */
@Component
@Profile("saas")
@ConfigurationProperties("app.company-sso")
@Getter
@Setter
public class CompanySsoProperties {
    private boolean enabled;
    private String serviceRoleKey = "";
    private Set<Long> eligibleTeamIds = new HashSet<>();
    private Map<String, Long> verifiedDomains = new HashMap<>();
}
