package stirling.software.common.util;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

import lombok.extern.slf4j.Slf4j;

@Slf4j
final class CalibreSandboxPolicy {

    enum Mode {
        UNSUPPORTED,
        OFF,
        ENFORCE,
        REQUIRED
    }

    static final String LAUNCHER = "calibre_sandbox.py";
    static final String MODE_VARIABLE = "STIRLING_CALIBRE_SANDBOX";
    static final String LAUNCHER_PREFIX = "calibre-sandbox:";
    static final int LAUNCHER_REFUSED_EXIT_CODE = 125;
    static final String REFUSED_MESSAGE = "Calibre conversion refused: its sandbox is unavailable";

    private static final Path CALIBRE_CONVERT = Path.of("/opt/calibre/ebook-convert");

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

    private static final AtomicBoolean unsupportedReported = new AtomicBoolean();

    private CalibreSandboxPolicy() {}

    static Mode configuredMode() {
        return resolveMode(System.getenv(MODE_VARIABLE), Files.isExecutable(CALIBRE_CONVERT));
    }

    static Mode resolveMode(String configured, boolean sandboxExpected) {
        if (configured == null || configured.isBlank()) {
            return sandboxExpected ? Mode.ENFORCE : Mode.UNSUPPORTED;
        }
        return switch (configured.trim().toLowerCase(Locale.ROOT)) {
            case "off" -> Mode.OFF;
            case "required" -> Mode.REQUIRED;
            default -> Mode.ENFORCE;
        };
    }

    static List<String> confine(
            Mode mode, List<String> command, File workingDirectory, Map<String, String> env)
            throws IOException {
        switch (mode) {
            case UNSUPPORTED -> {
                if (unsupportedReported.compareAndSet(false, true)) {
                    log.warn(
                            "Calibre is not installed under {}, so it runs unconfined; set"
                                    + " {}=required to confine it anyway",
                            CALIBRE_CONVERT.getParent(),
                            MODE_VARIABLE);
                }
                return command;
            }
            case OFF -> {
                log.error("Calibre is running unconfined because {}=off", MODE_VARIABLE);
                return command;
            }
            default -> {
                return wrap(mode, command, workingDirectory, env);
            }
        }
    }

    private static List<String> wrap(
            Mode mode, List<String> command, File workingDirectory, Map<String, String> env)
            throws IOException {
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

    static void checkLauncherOutcome(int exitCode, List<String> errorLines) throws IOException {
        List<String> launcherLines =
                errorLines.stream().filter(line -> line.startsWith(LAUNCHER_PREFIX)).toList();
        if (launcherLines.isEmpty()) {
            return;
        }
        if (exitCode == LAUNCHER_REFUSED_EXIT_CODE) {
            log.error(
                    "Refusing to run Calibre: its sandbox is required but unavailable on this"
                            + " host: {}",
                    String.join("; ", launcherLines));
            throw new IOException(REFUSED_MESSAGE);
        }
        log.error(
                "Calibre ran without part of its sandbox: {}. Set {}=required to refuse such runs",
                String.join("; ", launcherLines),
                MODE_VARIABLE);
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
