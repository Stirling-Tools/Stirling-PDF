package stirling.software.SPDF.utils;

import java.io.File;
import java.nio.file.FileSystems;
import java.nio.file.Path;

import stirling.software.SPDF.config.MemoryConfig;

public class memoryUtils {

    public static boolean shouldUseFileBasedStorage(MemoryConfig memoryconfig) {
        Runtime runtime = Runtime.getRuntime();
        long maxMemory = runtime.maxMemory();

        // Convert RAM threshold from GB to bytes
        long ramThresholdBytes = memoryconfig.getRamThresholdGB() * 1024L * 1024L * 1024L;

        // Check if the used memory exceeds the RAM threshold
        boolean useFileBasedOnMemory = maxMemory <= ramThresholdBytes;

        // Check free space on the default temporary directory
        Path tempDir = FileSystems.getDefault().getPath(System.getProperty("java.io.tmpdir"));
        File tempDirFile = tempDir.toFile();
        long freeSpace = tempDirFile.getUsableSpace(); // in bytes
        long totalSpace = tempDirFile.getTotalSpace(); // in bytes
        int freeSpacePercentage = (int) ((freeSpace * 100) / totalSpace);

        // Check if the free space percentage is less than the configured minimum
        boolean useFileBasedOnSpace =
                freeSpacePercentage < memoryconfig.getMinFreeSpacePercentage();

        return useFileBasedOnMemory || useFileBasedOnSpace;
    }
}
