package stirling.software.SPDF.utils;

import java.io.File;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryMXBean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import stirling.software.SPDF.config.MemoryConfig;
import stirling.software.SPDF.model.ApplicationProperties;

@Component
public class memoryUtils {

    //    public static boolean shouldUseFileBasedStorage(MemoryConfig memoryconfig) {
    //        Runtime runtime = Runtime.getRuntime();
    //        long maxMemory = runtime.maxMemory();
    //
    //        // Convert RAM threshold from GB to bytes
    //        long ramThresholdBytes = memoryconfig.getRamThresholdGB() * 1024L * 1024L * 1024L;
    //
    //        // Check if the used memory exceeds the RAM threshold
    //        boolean useFileBasedOnMemory = maxMemory <= ramThresholdBytes;
    //
    //        // Check free space on the default temporary directory
    //        Path tempDir = FileSystems.getDefault().getPath(System.getProperty("java.io.tmpdir"));
    //        File tempDirFile = tempDir.toFile();
    //        long freeSpace = tempDirFile.getUsableSpace(); // in bytes
    //        long totalSpace = tempDirFile.getTotalSpace(); // in bytes
    //        int freeSpacePercentage = (int) ((freeSpace * 100) / totalSpace);
    //
    //        // Check if the free space percentage is less than the configured minimum
    //        boolean useFileBasedOnSpace =
    //                freeSpacePercentage < memoryconfig.getMinFreeSpacePercentage();
    //
    //        return useFileBasedOnMemory || useFileBasedOnSpace;
    //    }
    private static final Logger logger =
            LoggerFactory.getLogger(org.eclipse.jetty.util.MemoryUtils.class);

    @Autowired private ApplicationProperties applicationProperties;

    public static boolean shouldUseFileBasedStorage() {
        MemoryConfig settings = ApplicationProperties.memorySettings.getMemorySettings();
        long freeSpace = new File("/").getFreeSpace();
        long totalMemory = getTotalMemory();
        int ramThresholdGB = settings.getRamThresholdGB();
        int minFreeSpacePercentage = settings.getMinFreeSpacePercentage();

        // Check if RAM is below threshold
        if (totalMemory / (1024 * 1024 * 1024) < ramThresholdGB) {
            logger.info("Using file-based storage due to low RAM.");
            return true;
        }

        // Check if free space is below minimum percentage
        long totalDiskSpace = new File("/").getTotalSpace();
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
