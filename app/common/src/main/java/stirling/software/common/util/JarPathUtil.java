package stirling.software.common.util;

import java.io.File;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

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
                    Paths.get(
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
     * Gets the path to the restart-helper.jar file Expected to be in the same directory as the main
     * JAR
     *
     * @return Path to restart-helper.jar, or null if not found
     */
    public static Path restartHelperJar() {
        Path appJar = currentJar();
        if (appJar == null) {
            return null;
        }

        Path helperJar = appJar.getParent().resolve("restart-helper.jar");

        if (Files.isRegularFile(helperJar)) {
            log.debug("Restart helper JAR located at: {}", helperJar);
            return helperJar;
        } else {
            log.warn("Restart helper JAR not found at: {}", helperJar);
            return null;
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
