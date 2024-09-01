package stirling.software.SPDF.utils;

import java.io.File;
import java.nio.file.FileSystems;
import java.nio.file.Path;

import stirling.software.SPDF.config.memoryConfig;

public class memoryUtils {

    public static boolean shouldUseFileBasedStorage(memoryConfig memoryConfig) {
        Runtime runtime = Runtime.getRuntime();
        long usedMemory = runtime.totalMemory() - runtime.freeMemory();
        long maxMemory = runtime.maxMemory();

        boolean useFileBasedOnMemory =
                usedMemory > (memoryConfig.getMemory().getRamThresholdGB() * 1024L * 1024L * 1024L);

        // Check free space on the default temporary directory
        Path tempDir = FileSystems.getDefault().getPath(System.getProperty("java.io.tmpdir"));
        File tempDirFile = tempDir.toFile();
        long freeSpace = tempDirFile.getUsableSpace(); // in bytes
        long totalSpace = tempDirFile.getTotalSpace(); // in bytes
        int freeSpacePercentage = (int) ((freeSpace * 100) / totalSpace);

        boolean useFileBasedOnSpace =
                freeSpacePercentage < memoryConfig.getMemory().getMinFreeSpacePercentage();

        return useFileBasedOnMemory || useFileBasedOnSpace;
    }
}
