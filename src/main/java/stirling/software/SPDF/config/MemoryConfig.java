package stirling.software.SPDF.config;

import lombok.Getter;
import lombok.Setter;

@Setter
@Getter
public class MemoryConfig {
    // Getters and Setters
    private int minFreeSpacePercentage;
    private int ramThresholdGB;
}
