package stirling.software.common.util;

import java.io.File;
import java.io.IOException;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.jar.JarFile;

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

            // Check if this is the executable Stirling JAR, rather than a dependency JAR such as
            // common-*-plain.jar that is present on the bootRun classpath.
            if (jar.toString().endsWith(".jar") && isApplicationJar(jar)) {
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

    private static boolean isApplicationJar(Path jar) {
        try (JarFile jarFile = new JarFile(jar.toFile())) {
            return jarFile.getEntry("stirling/software/SPDF/SPDFApplication.class") != null
                    || jarFile.getEntry(
                                    "BOOT-INF/classes/stirling/software/SPDF/SPDFApplication.class")
                            != null;
        } catch (IOException e) {
            log.debug("Could not inspect JAR while identifying the application", e);
            return false;
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
        List<Path> possibleLocations = new ArrayList<>();

        // Location 1: Same directory as main JAR (production)
        if (appJar != null) {
            possibleLocations.add(appJar.getParent().resolve("restart-helper.jar"));
        }

        // In development, Gradle may set the JVM working directory to a module directory.
        // Walk both the working directory and the compiled classes directory upwards so the
        // root project's build/libs/restart-helper.jar is found regardless of the launch task.
        addAncestorLocations(possibleLocations, Path.of(System.getProperty("user.dir")));
        try {
            Path codeSource =
                    Path.of(
                            JarPathUtil.class
                                    .getProtectionDomain()
                                    .getCodeSource()
                                    .getLocation()
                                    .toURI());
            addAncestorLocations(possibleLocations, codeSource);
        } catch (URISyntaxException e) {
            log.debug("Could not inspect code source while locating restart helper", e);
        }

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

    private static void addAncestorLocations(List<Path> locations, Path start) {
        Path current = start.toAbsolutePath().normalize();
        while (current != null) {
            locations.add(current.resolve(Path.of("build", "libs", "restart-helper.jar")));
            locations.add(current.resolve("restart-helper.jar"));
            current = current.getParent();
        }
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
