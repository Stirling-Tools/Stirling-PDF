package stirling.software.proprietary.serverregistration;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

/** Independent rollout switch; enabling reporting never enables migration or Team billing. */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "stirling.server-registration")
public class ServerRegistrationProperties {
    private boolean enabled = false;
    private Duration syncInterval = Duration.ofHours(24);
}
