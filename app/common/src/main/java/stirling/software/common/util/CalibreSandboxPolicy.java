package stirling.software.common.util;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import lombok.extern.slf4j.Slf4j;

/**
 * Calibre runs inside the launcher's Landlock and seccomp sandbox, confined to its job directory
 * with a scrubbed environment. Under the default {@link Mode#REQUIRED} a host that cannot provide
 * that sandbox gets no Calibre: the startup probe disables its endpoint group, and a job whose
 * launcher reports a gap is refused. {@code STIRLING_CALIBRE_SANDBOX} selects the other modes.
 */
@Slf4j
final class CalibreSandboxPolicy {

    /**
     * {@code REQUIRED}, the default: confined, or not at all. {@code ENFORCE}: confined where the
     * host allows, otherwise Calibre runs unconfined and every such run is logged. {@code OFF}:
     * never confined.
     */
    enum Mode {
        OFF,
        ENFORCE,
        REQUIRED
    }

    /** What one launcher run showed about this host. */
    enum Probe {
        ACTIVE,
        REFUSED,
        UNKNOWN
    }

    static final String LAUNCHER = "calibre_sandbox.py";
    static final String MODE_VARIABLE = "STIRLING_CALIBRE_SANDBOX";
    static final String LAUNCHER_PREFIX = "calibre-sandbox:";
    static final int LAUNCHER_REFUSED_EXIT_CODE = 125;
    static final String REFUSED_MESSAGE = "Calibre conversion refused: its sandbox is unavailable";

    private static final String HOME_DIR = ".calibre";

    private static final Set<String> ENV_ALLOWLIST =
            Set.of(
                    "USER",
                    "LOGNAME",
                    "PATH",
                    "LANG",
                    "LANGUAGE",
                    "TZ",
                    "LD_LIBRARY_PATH",
                    "FONTCONFIG_PATH",
                    "FONTCONFIG_FILE",
                    "MALLOC_ARENA_MAX",
                    MODE_VARIABLE);

    private static final List<String> ENV_ALLOWED_PREFIXES = List.of("LC_", "QT_", "QTWEBENGINE_");

    private static final String PROBE_STDERR = "probe.err";
    private static final long PROBE_TIMEOUT_SECONDS = 60;

    private CalibreSandboxPolicy() {}

    static Mode configuredMode() {
        return resolveMode(System.getenv(MODE_VARIABLE));
    }

    /** Unset, blank and unrecognised values all mean {@code REQUIRED}. */
    static Mode resolveMode(String configured) {
        if (configured == null || configured.isBlank()) {
            return Mode.REQUIRED;
        }
        return switch (configured.trim().toLowerCase(Locale.ROOT)) {
            case "off" -> Mode.OFF;
            case "enforce" -> Mode.ENFORCE;
            default -> Mode.REQUIRED;
        };
    }

    /**
     * {@code command} wrapped in the launcher and confined to {@code workingDirectory}, with {@code
     * env} cut down to what Calibre needs and pointed into that directory. Without a working
     * directory the job is refused in every mode; without Python to run the launcher it is refused
     * under {@code REQUIRED} and runs unconfined under {@code ENFORCE}. {@code OFF} returns the
     * command unchanged.
     */
    static List<String> confine(
            Mode mode, List<String> command, File workingDirectory, Map<String, String> env)
            throws IOException {
        if (mode == Mode.OFF) {
            log.error("Calibre is running unconfined because {}=off", MODE_VARIABLE);
            return command;
        }
        if (workingDirectory == null) {
            throw new IOException("Calibre needs a working directory to be confined to");
        }
        String python = CheckProgramInstall.getAvailablePythonCommand();
        if (python == null) {
            if (mode == Mode.REQUIRED) {
                log.error("Refusing to run Calibre: its sandbox needs Python, which is missing");
                throw new IOException(REFUSED_MESSAGE);
            }
            log.error("Calibre is running unconfined because Python is not installed");
            return command;
        }
        Path workDir = workingDirectory.toPath().toAbsolutePath().normalize();
        Path home = Files.createDirectories(workDir.resolve(HOME_DIR));

        env.keySet().removeIf(name -> !isEnvAllowed(name));
        env.put(MODE_VARIABLE, mode.name().toLowerCase(Locale.ROOT));
        env.put("HOME", home.toString());
        for (String name : List.of("TMPDIR", "TMP", "TEMP", "XDG_RUNTIME_DIR")) {
            env.put(name, home.toString());
        }

        List<String> confined = new ArrayList<>();
        confined.add(python);
        confined.add("-I");
        confined.add(GeneralUtils.extractScript(LAUNCHER).toAbsolutePath().toString());
        confined.add(workDir.toString());
        confined.addAll(command);
        return confined;
    }

    /**
     * Runs {@code probeCommand} (Calibre's own version check, so its install path is covered by the
     * launcher's allowlist) confined, and logs what the launcher reports, so a host whose kernel
     * lacks Landlock or seccomp is visible at startup rather than in the first job's log. Whether
     * Calibre may be offered: under {@code REQUIRED} only when the run was fully confined; the
     * other modes always offer it and only log. stderr goes to a file so a stalled launcher cannot
     * outlive the timeout.
     */
    static boolean probeAtStartup(Mode mode, List<String> probeCommand) {
        if (mode == Mode.OFF) {
            log.error("Calibre sandbox is off ({}=off); Calibre runs unconfined", MODE_VARIABLE);
            return true;
        }
        Path workDir;
        try {
            workDir = Files.createTempDirectory("calibre-sandbox-probe");
        } catch (IOException e) {
            log.debug("Cannot create a dir for the Calibre sandbox probe: {}", e.getMessage());
            return report(mode, Probe.UNKNOWN, List.of());
        }
        Path stderr = workDir.resolve(PROBE_STDERR);
        try {
            ProcessBuilder builder = new ProcessBuilder(probeCommand);
            List<String> confined =
                    confine(mode, probeCommand, workDir.toFile(), builder.environment());
            if (confined.equals(probeCommand)) {
                return report(mode, Probe.UNKNOWN, List.of());
            }
            builder.command(confined);
            builder.directory(workDir.toFile());
            builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
            builder.redirectError(stderr.toFile());
            Process process = builder.start();
            if (!process.waitFor(PROBE_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                return report(mode, Probe.UNKNOWN, List.of());
            }
            List<String> errorLines =
                    Files.exists(stderr)
                            ? Files.readAllLines(stderr, StandardCharsets.UTF_8)
                            : List.of();
            return report(mode, classifyProbe(process.exitValue(), errorLines), errorLines);
        } catch (IOException e) {
            log.debug("Calibre sandbox probe could not run: {}", e.getMessage());
            return report(mode, Probe.UNKNOWN, List.of());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } finally {
            deleteTree(workDir);
        }
    }

    private static void deleteTree(Path root) {
        try (var paths = Files.walk(root)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        } catch (IOException e) {
            log.debug("Cannot remove {}: {}", root, e.getMessage());
        }
    }

    /**
     * A clean exit with nothing from the launcher is the only active outcome; the launcher exits
     * with {@link #LAUNCHER_REFUSED_EXIT_CODE} when it cannot confine, and any other failure says
     * nothing about the sandbox.
     */
    static Probe classifyProbe(int exitCode, List<String> errorLines) {
        if (exitCode == LAUNCHER_REFUSED_EXIT_CODE || !launcherLines(errorLines).isEmpty()) {
            return Probe.REFUSED;
        }
        return exitCode == 0 ? Probe.ACTIVE : Probe.UNKNOWN;
    }

    private static boolean report(Mode mode, Probe probe, List<String> errorLines) {
        if (probe == Probe.ACTIVE) {
            log.info("Calibre sandbox active");
            return true;
        }
        String detail =
                probe == Probe.REFUSED
                        ? String.join("; ", launcherLines(errorLines))
                        : "the probe could not run";
        if (mode == Mode.REQUIRED) {
            log.error(
                    "Calibre sandbox is unavailable on this host ({}), so ebook conversion is"
                            + " disabled; it needs Linux 5.13+ with Landlock and seccomp, and"
                            + " Python 3",
                    detail);
            return false;
        }
        log.warn(
                "Calibre sandbox is unavailable on this host ({}); Calibre runs unconfined because"
                        + " {}=enforce",
                detail,
                MODE_VARIABLE);
        return true;
    }

    /**
     * Fails a job whose launcher refused to run it. Under {@code ENFORCE} the launcher runs the job
     * anyway and only reports the gap, which is logged.
     */
    static void checkLauncherOutcome(int exitCode, List<String> errorLines) throws IOException {
        List<String> launcherLines = launcherLines(errorLines);
        if (launcherLines.isEmpty()) {
            return;
        }
        if (exitCode == LAUNCHER_REFUSED_EXIT_CODE) {
            log.error(
                    "Refusing to run Calibre: its sandbox is unavailable on this host: {}",
                    String.join("; ", launcherLines));
            throw new IOException(REFUSED_MESSAGE);
        }
        log.error(
                "Calibre ran without part of its sandbox: {}. Set {}=required to refuse such runs",
                String.join("; ", launcherLines),
                MODE_VARIABLE);
    }

    private static List<String> launcherLines(List<String> errorLines) {
        return errorLines.stream().filter(line -> line.startsWith(LAUNCHER_PREFIX)).toList();
    }

    private static boolean isEnvAllowed(String name) {
        if (name == null) {
            return false;
        }
        if (ENV_ALLOWLIST.contains(name)) {
            return true;
        }
        for (String prefix : ENV_ALLOWED_PREFIXES) {
            if (name.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }
}
