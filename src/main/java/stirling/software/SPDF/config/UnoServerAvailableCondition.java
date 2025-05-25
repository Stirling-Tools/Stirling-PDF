package stirling.software.SPDF.config;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

import lombok.extern.slf4j.Slf4j;

/**
 * Condition that checks if UnoServer is available on the system. This condition will pass if: 1.
 * The unoserver executable is found via RuntimePathConfig (from unoConvertPath) 2. The unoserver
 * executable is found at /opt/venv/bin/unoserver (Docker path) 3. The unoserver executable is found
 * in PATH 4. The unoserver executable is found in any common installation directories
 */
@Slf4j
public class UnoServerAvailableCondition implements Condition {

    // Common installation paths to check
    private static final String[] COMMON_UNOSERVER_PATHS = {
        "/opt/venv/bin/unoserver", // Docker path
        "/usr/bin/unoserver", // Linux system path
        "/usr/local/bin/unoserver", // Linux local path
        "/opt/homebrew/bin/unoserver", // Mac Homebrew path
        "/opt/libreoffice/program/unoserver" // Custom LibreOffice path
    };

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        log.info("Checking if UnoServer is available on the system...");

        // Collect all paths to check
        List<String> pathsToCheck = new ArrayList<>();

        // Check for Docker environment
        boolean isDocker = Files.exists(Path.of("/.dockerenv"));
        log.debug("Docker environment detected: {}", isDocker);

        // Try to get unoserver path from RuntimePathConfig first (highest priority)
        String unoserverFromRuntimeConfig = getUnoServerPathFromRuntimeConfig(context);
        if (unoserverFromRuntimeConfig != null) {
            pathsToCheck.add(unoserverFromRuntimeConfig);
        }

        // Add common installation paths
        for (String path : COMMON_UNOSERVER_PATHS) {
            pathsToCheck.add(path);
        }

        // Add "unoserver" to check in PATH
        pathsToCheck.add("unoserver");

        // Try all paths one by one
        for (String path : pathsToCheck) {
            log.debug("Checking for UnoServer at: {}", path);

            if (isExecutableAvailable(path)) {
                log.info("UnoServer found at: {}, enabling UnoServerManager", path);
                return true;
            }
        }

        // If we get here, we didn't find unoserver anywhere
        log.warn(
                "UnoServer not found in any of the expected locations. UnoServerManager will be disabled.");
        log.info(
                "To enable Office document conversions, please install UnoServer or use the 'fat' Docker image variant.");

        return false;
    }

    /**
     * Attempts to get the unoserver path from RuntimePathConfig by checking the parent directory of
     * unoConvertPath.
     *
     * @param context The condition context
     * @return The unoserver path if found, null otherwise
     */
    private String getUnoServerPathFromRuntimeConfig(ConditionContext context) {
        try {
            RuntimePathConfig runtimePathConfig =
                    context.getBeanFactory().getBean(RuntimePathConfig.class);
            if (runtimePathConfig != null) {
                String unoConvertPath = runtimePathConfig.getUnoConvertPath();
                log.debug("UnoConvert path from RuntimePathConfig: {}", unoConvertPath);

                if (unoConvertPath != null && !unoConvertPath.isEmpty()) {
                    // First check if unoConvertPath itself exists
                    File unoConvertFile = new File(unoConvertPath);
                    if (!unoConvertFile.exists() || !unoConvertFile.canExecute()) {
                        log.info("UnoConvert not found at path: {}", unoConvertPath);
                        return null;
                    }

                    // If unoConvertPath exists, check for unoserver in the same directory
                    Path unoConvertDir = Paths.get(unoConvertPath).getParent();
                    if (unoConvertDir != null) {
                        Path potentialUnoServerPath = unoConvertDir.resolve("unoserver");
                        File unoServerFile = potentialUnoServerPath.toFile();

                        if (unoServerFile.exists() && unoServerFile.canExecute()) {
                            log.debug("UnoServer found at: {}", potentialUnoServerPath);
                            return potentialUnoServerPath.toString();
                        } else {
                            log.debug(
                                    "UnoServer not found at expected path: {}",
                                    potentialUnoServerPath);
                            // Continue checking other paths
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.debug(
                    "RuntimePathConfig not available yet, falling back to default checks: {}",
                    e.getMessage());
        }

        return null;
    }

    /**
     * Comprehensive check if an executable is available in the system
     *
     * @param executableName The name or path of the executable to check
     * @return true if the executable is found and executable, false otherwise
     */
    private boolean isExecutableAvailable(String executableName) {
        // First, check if it's an absolute path and the file exists
        if (executableName.startsWith("/") || executableName.contains(":\\")) {
            File file = new File(executableName);
            boolean exists = file.exists() && file.canExecute();
            log.debug(
                    "Checking executable at absolute path {}: {}",
                    executableName,
                    exists ? "Found" : "Not found");
            return exists;
        }

        // Next, try to execute the command with --version to verify it works
        try {
            ProcessBuilder pb = new ProcessBuilder(executableName, "--version");
            pb.redirectError(ProcessBuilder.Redirect.DISCARD);
            Process process = pb.start();
            int exitCode = process.waitFor();

            if (exitCode == 0) {
                log.debug("Executable {} exists in PATH (--version returned 0)", executableName);
                return true;
            } else {
                // Try with --help as a fallback
                pb = new ProcessBuilder(executableName, "--help");
                pb.redirectError(ProcessBuilder.Redirect.DISCARD);
                process = pb.start();
                exitCode = process.waitFor();

                if (exitCode == 0) {
                    log.debug("Executable {} exists in PATH (--help returned 0)", executableName);
                    return true;
                }
            }
        } catch (Exception e) {
            log.debug("Error checking for executable {}: {}", executableName, e.getMessage());
        }

        // Finally, check each directory in PATH for the executable file
        if (!executableName.contains("/") && !executableName.contains("\\")) {
            String pathEnv = System.getenv("PATH");
            if (pathEnv != null) {
                String[] pathDirs = pathEnv.split(File.pathSeparator);
                for (String pathDir : pathDirs) {
                    File file = new File(pathDir, executableName);
                    if (file.exists() && file.canExecute()) {
                        log.debug(
                                "Found executable {} in PATH directory {}",
                                executableName,
                                pathDir);
                        return true;
                    }
                }
            }
        }

        log.debug("Executable {} not found", executableName);
        return false;
    }
}
