package stirling.software.SPDF.utils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import stirling.software.SPDF.config.MemoryConfig;
import stirling.software.SPDF.model.ApplicationProperties;

import java.io.File;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;

@Component
public class memoryUtils {
    private static final Logger logger = LoggerFactory.getLogger(memoryUtils.class);

//        private final ApplicationProperties applicationProperties;
//        @Autowired
//        public memoryUtils(ApplicationProperties applicationProperties) {
//            this.applicationProperties = applicationProperties;
//        }
    public boolean shouldUseFileBasedStorage() {
        MemoryConfig settings = ApplicationProperties.memorySettings.getMemorySettings();
        File tempDir = new File(System.getProperty("java.io.tmpdir"));

        long freeSpace = tempDir.getUsableSpace();

        long totalMemory = getTotalMemory();
        int ramThresholdGB = settings.getRamThresholdGB();
        int minFreeSpacePercentage = settings.getMinFreeSpacePercentage();

        // Check if RAM is below threshold
        if (totalMemory / (1024 * 1024 * 1024) < ramThresholdGB) {
            logger.info("Using file-based storage due to low RAM.");
            return true;
        }

        // Check if free space is below minimum percentage
        long totalDiskSpace = tempDir.getTotalSpace();
        long freeSpacePercentage = (freeSpace * 100) / totalDiskSpace;
        if (freeSpacePercentage < minFreeSpacePercentage) {
            logger.info("Using file-based storage due to low free disk space.");
            return true;
        }

        logger.info("Using in-memory storage.");
        return false;
    }

    private static long getTotalMemory() {
        MemoryMXBean memoryMXBean = ManagementFactory.getMemoryMXBean();
        return memoryMXBean.getHeapMemoryUsage().getMax();
    }
}
