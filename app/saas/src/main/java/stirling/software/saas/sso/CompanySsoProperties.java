package stirling.software.saas.sso;

import java.util.HashMap;
import java.util.Map;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

/** Server-only provider credentials, rollout control and verified discovery domains. */
@Component
@Profile("saas")
@ConfigurationProperties("app.company-sso")
@Getter
@Setter
public class CompanySsoProperties {
    private boolean enabled;
    private String serviceRoleKey = "";
    private Map<String, Long> verifiedDomains = new HashMap<>();
}
