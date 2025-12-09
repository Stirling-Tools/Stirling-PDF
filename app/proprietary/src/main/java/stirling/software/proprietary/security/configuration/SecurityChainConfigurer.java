package stirling.software.proprietary.security.configuration;

import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Abstraction for building the application's SecurityFilterChain. Downstream builds can provide
 * their own implementation to replace the default OSS security chain without modifying core files.
 */
public interface SecurityChainConfigurer {
    SecurityFilterChain configure(HttpSecurity http) throws Exception;
}
