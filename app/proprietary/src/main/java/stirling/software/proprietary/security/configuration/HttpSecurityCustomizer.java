package stirling.software.proprietary.security.configuration;

import org.springframework.security.config.annotation.web.builders.HttpSecurity;

/**
 * Extension point to customize the core HttpSecurity configuration without modifying the
 * SecurityConfiguration class. Override the security configuration by implementing this interface
 * to add filters, configure providers, or tweak authorization rules.
 */
public interface HttpSecurityCustomizer {
    void customize(HttpSecurity http) throws Exception;
}
