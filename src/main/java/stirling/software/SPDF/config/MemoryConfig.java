package stirling.software.SPDF.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Getter;
import lombok.Setter;

@Setter
@Getter
@Component
@ConfigurationProperties(prefix = "memory")
public class MemoryConfig {
    // Getters and Setters
    private int minFreeSpacePercentage;
    private int ramThresholdGB;
}
