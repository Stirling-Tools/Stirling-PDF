package stirling.software.common.util;

import java.io.File;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;

import lombok.extern.slf4j.Slf4j;

/** Utility class to locate JAR files at runtime for restart operations */
@Slf4j
public class JarPathUtil {

    /**
     * Gets the path to the currently running JAR file
     *
     * @return Path to the current JAR, or null if not running from a JAR
     */
    public static Path currentJar() {
        try {
            Path jar =
                    Path.of(
                                    JarPathUtil.class
                                            .getProtectionDomain()
                                            .getCodeSource()
                                            .getLocation()
                                            .toURI())
                            .toAbsolutePath();

            // Check if we're actually running from a JAR (not from IDE/classes directory)
            if (jar.toString().endsWith(".jar")) {
                log.debug("Current JAR located at: {}", jar);
                return jar;
            } else {
                log.warn("Not running from JAR, current location: {}", jar);
                return null;
            }
        } catch (URISyntaxException e) {
            log.error("Failed to determine current JAR location", e);
            return null;
        }
    }

    /**
     * Gets the path to the restart-helper.jar file. Checks multiple possible locations: 1. Same
     * directory as the main JAR (production deployment) 2. ./build/libs/restart-helper.jar
     * (development build) 3. app/common/build/libs/restart-helper.jar (multi-module build)
     *
     * @return Path to restart-helper.jar, or null if not found
     */
    public static Path restartHelperJar() {
        Path appJar = currentJar();

        // Define possible locations to check (in order of preference)
        Path[] possibleLocations = new Path[4];

        // Location 1: Same directory as main JAR (production)
        if (appJar != null) {
            possibleLocations[0] = appJar.getParent().resolve("restart-helper.jar");
        }

        // Location 2: ./build/libs/ (development build)
        possibleLocations[1] = Path.of("build", "libs", "restart-helper.jar").toAbsolutePath();

        // Location 3: app/common/build/libs/ (multi-module build)
        possibleLocations[2] =
                Path.of("app", "common", "build", "libs", "restart-helper.jar").toAbsolutePath();

        // Location 4: Current working directory
        possibleLocations[3] = Path.of("restart-helper.jar").toAbsolutePath();

        // Check each location
        for (Path location : possibleLocations) {
            if (location != null && Files.isRegularFile(location)) {
                log.info("Restart helper JAR found at: {}", location);
                return location;
            } else if (location != null) {
                log.debug("Restart helper JAR not found at: {}", location);
            }
        }

        log.warn("Restart helper JAR not found in any expected location");
        return null;
    }

    private static volatile Boolean restartSupported;

    /**
     * Whether the running deployment can restart itself. Requires both a runnable application JAR
     * and the restart-helper.jar to be present on disk. Hosted/containerised deployments and
     * development runs (classes directory, no helper) can't self-restart, so callers can use this
     * to avoid offering a restart action that would always fail. The result is cached because the
     * deployment layout does not change at runtime.
     *
     * @return true if a self-restart can be performed
     */
    public static boolean restartSupported() {
        Boolean cached = restartSupported;
        if (cached == null) {
            cached = currentJar() != null && restartHelperJar() != null;
            restartSupported = cached;
        }
        return cached;
    }

    /**
     * Gets the java binary path for the current JVM
     *
     * @return Path to java executable
     */
    public static String javaExecutable() {
        String javaHome = System.getProperty("java.home");
        String javaBin = javaHome + File.separator + "bin" + File.separator + "java";

        // On Windows, add .exe extension
        if (System.getProperty("os.name").toLowerCase().contains("win")) {
            javaBin += ".exe";
        }

        return javaBin;
    }
}
