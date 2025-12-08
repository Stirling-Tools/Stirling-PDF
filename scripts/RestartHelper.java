import java.io.*;
import java.nio.file.*;
import java.util.*;

/**
 * RestartHelper - Lightweight utility to restart Stirling-PDF
 *
 * This helper waits for the old process to exit, then starts the app again
 * with the same arguments. It's only active during restart and then exits.
 *
 * Usage:
 *   java -jar restart-helper.jar --pid 1234 --app /path/app.jar
 *     [--java /path/to/java] [--argsFile /path/args.txt]
 *     [--backoffMs 1000]
 */
public class RestartHelper {
    public static void main(String[] args) {
        try {
            Map<String, String> cli = parseArgs(args);

            long pid = Long.parseLong(req(cli, "pid"));
            Path appJar = Paths.get(req(cli, "app")).toAbsolutePath().normalize();
            String javaBin = cli.getOrDefault("java", "java");
            Path argsFile = cli.containsKey("argsFile") ? Paths.get(cli.get("argsFile")) : null;
            long backoffMs = Long.parseLong(cli.getOrDefault("backoffMs", "1000"));

            if (!Files.isRegularFile(appJar)) {
                fail("App jar not found: " + appJar);
            }

            System.out.println("[restart-helper] Waiting for PID " + pid + " to exit...");
            waitForPidToExit(pid);

            // Brief pause to allow ports/files to release
            if (backoffMs > 0) {
                Thread.sleep(backoffMs);
            }

            List<String> cmd = new ArrayList<>();
            cmd.add(javaBin);
            cmd.add("-jar");
            cmd.add(appJar.toString());

            // Load application arguments from file if provided
            if (argsFile != null && Files.isRegularFile(argsFile)) {
                for (String line : Files.readAllLines(argsFile)) {
                    if (!line.isBlank()) {
                        cmd.add(line.trim());
                    }
                }
                // Clean up args file after reading
                try {
                    Files.deleteIfExists(argsFile);
                } catch (IOException ignored) {
                    // Best effort cleanup
                }
            }

            System.out.println("[restart-helper] Starting app: " + String.join(" ", cmd));
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.inheritIO(); // Forward logs to same console/service logs
            pb.start();

            // Exit immediately - leave app running
            System.out.println("[restart-helper] App restarted successfully. Helper exiting.");
            System.exit(0);

        } catch (Exception e) {
            System.err.println("[restart-helper] ERROR: " + e.getMessage());
            e.printStackTrace();
            System.exit(2);
        }
    }

    /**
     * Wait for the specified PID to exit
     */
    private static void waitForPidToExit(long pid) throws InterruptedException {
        try {
            // Java 9+: ProcessHandle API
            Optional<ProcessHandle> ph = ProcessHandle.of(pid);
            while (ph.isPresent() && ph.get().isAlive()) {
                Thread.sleep(300);
                ph = ProcessHandle.of(pid);
            }
        } catch (Throwable t) {
            // Fallback for older JDKs or if ProcessHandle isn't available
            // Just sleep a bit - by the time main exits, socket should be freed
            System.out.println("[restart-helper] ProcessHandle not available, using fallback wait");
            Thread.sleep(2000);
        }
    }

    /**
     * Parse command-line arguments in --key value format
     */
    private static Map<String, String> parseArgs(String[] args) {
        Map<String, String> map = new HashMap<>();
        for (int i = 0; i < args.length; i++) {
            if (args[i].startsWith("--")) {
                String key = args[i].substring(2);
                String val = (i + 1 < args.length && !args[i + 1].startsWith("--"))
                    ? args[++i]
                    : "true";
                map.put(key, val);
            }
        }
        return map;
    }

    /**
     * Get required parameter or fail
     */
    private static String req(Map<String, String> map, String key) {
        String val = map.get(key);
        if (val == null || val.isBlank()) {
            fail("Missing required parameter: --" + key);
        }
        return val;
    }

    /**
     * Print error and exit
     */
    private static void fail(String message) {
        System.err.println("[restart-helper] ERROR: " + message);
        System.exit(2);
    }
}
