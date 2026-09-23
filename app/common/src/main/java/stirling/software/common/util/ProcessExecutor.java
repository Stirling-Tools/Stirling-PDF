package stirling.software.common.util;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import io.github.pixee.security.BoundedLineReader;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Slf4j
public class ProcessExecutor {

    private static final Map<Processes, ProcessExecutor> instances = new ConcurrentHashMap<>();
    private static ApplicationProperties applicationProperties = new ApplicationProperties();
    private static volatile UnoServerPool unoServerPool;
    private final Semaphore semaphore;
    private final boolean liveUpdates;
    private long timeoutDuration;
    private final Processes processType;

    private ProcessExecutor(
            Processes processType, int semaphoreLimit, boolean liveUpdates, long timeout) {
        this.processType = processType;
        this.semaphore = new Semaphore(semaphoreLimit);
        this.liveUpdates = liveUpdates;
        this.timeoutDuration = timeout;
    }

    public static ProcessExecutor getInstance(Processes processType) {
        return getInstance(processType, true);
    }

    public static ProcessExecutor getInstance(Processes processType, boolean liveUpdates) {
        return instances.computeIfAbsent(
                processType,
                key -> {
                    int semaphoreLimit =
                            switch (key) {
                                case LIBRE_OFFICE ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getLibreOfficeSessionLimit();
                                case PDFTOHTML ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getPdfToHtmlSessionLimit();
                                case PYTHON_OPENCV ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getPythonOpenCvSessionLimit();
                                case WEASYPRINT ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getWeasyPrintSessionLimit();
                                case INSTALL_APP ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getInstallAppSessionLimit();
                                case TESSERACT ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getTesseractSessionLimit();
                                case QPDF ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getQpdfSessionLimit();
                                case CALIBRE ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getCalibreSessionLimit();
                                case IMAGEMAGICK ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getImageMagickSessionLimit();
                                case GHOSTSCRIPT ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getGhostscriptSessionLimit();
                                case OCR_MY_PDF ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getOcrMyPdfSessionLimit();
                                case CFF_CONVERTER -> 1;
                                case FFMPEG ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getFfmpegSessionLimit();
                            };

                    long timeoutMinutes =
                            switch (key) {
                                case LIBRE_OFFICE ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getTimeoutMinutes()
                                                .getLibreOfficeTimeoutMinutes();
                                case PDFTOHTML ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getTimeoutMinutes()
                                                .getPdfToHtmlTimeoutMinutes();
                                case PYTHON_OPENCV ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getTimeoutMinutes()
                                                .getPythonOpenCvTimeoutMinutes();
                                case WEASYPRINT ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getTimeoutMinutes()
                                                .getWeasyPrintTimeoutMinutes();
                                case INSTALL_APP ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getTimeoutMinutes()
                                                .getInstallAppTimeoutMinutes();
                                case TESSERACT ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getTimeoutMinutes()
                                                .getTesseractTimeoutMinutes();
                                case QPDF ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getTimeoutMinutes()
                                                .getQpdfTimeoutMinutes();
                                case CALIBRE ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getTimeoutMinutes()
                                                .getCalibreTimeoutMinutes();
                                case IMAGEMAGICK ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getTimeoutMinutes()
                                                .getImageMagickTimeoutMinutes();
                                case GHOSTSCRIPT ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getTimeoutMinutes()
                                                .getGhostscriptTimeoutMinutes();
                                case OCR_MY_PDF ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getTimeoutMinutes()
                                                .getOcrMyPdfTimeoutMinutes();
                                case CFF_CONVERTER -> 5L;
                                case FFMPEG ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getTimeoutMinutes()
                                                .getFfmpegTimeoutMinutes();
                            };
                    return new ProcessExecutor(
                            processType, semaphoreLimit, liveUpdates, timeoutMinutes);
                });
    }

    public static void setUnoServerPool(UnoServerPool pool) {
        unoServerPool = pool;
    }

    public ProcessExecutorResult runCommandWithOutputHandling(List<String> command)
            throws IOException, InterruptedException {
        return runCommandWithOutputHandling(command, null);
    }

    public ProcessExecutorResult runCommandWithOutputHandling(
            List<String> command, File workingDirectory) throws IOException, InterruptedException {
        RunOutcome outcome = new RunOutcome();
        try {
            return runOnce(command, workingDirectory, outcome);
        } catch (IOException e) {
            // A fresh profile makes soffice relaunch under the IPC pipe it could not unlink; the
            // pipe is cleared and the profile initialised now, so one more run does not relaunch.
            // freshProfile is this job's own state, not the shared /tmp sweep, so parallel jobs
            // garbage-collecting each other's dead pipes never trigger a spurious retry here.
            if (!outcome.freshProfile || !outcome.stalePipeRemoved || outcome.timedOut) {
                throw e;
            }
            log.info("Retrying LibreOffice after clearing its leftover IPC pipe");
            return runOnce(command, workingDirectory, new RunOutcome());
        }
    }

    private static final class RunOutcome {
        boolean freshProfile;
        boolean stalePipeRemoved;
        boolean timedOut;
    }

    private ProcessExecutorResult runOnce(
            List<String> command, File workingDirectory, RunOutcome outcome)
            throws IOException, InterruptedException {
        String messages = "";
        int exitCode = 1;
        UnoServerPool.UnoServerLease unoLease = null;
        boolean useSemaphore = true;
        List<String> commandToRun = command;
        Set<Path> ipcPipesBefore = null;
        LibreOfficeSandboxPolicy.JobPolicy jobPolicy = null;

        boolean useUnoServerPool = shouldUseUnoServerPool(command);

        if (useUnoServerPool) {
            // Signal the on-demand manager to start unoserver if needed, then
            // wait on the leased endpoint itself: probing every endpoint and
            // leasing one afterwards could pick an endpoint that never became
            // ready. A direct soffice command never signals: it does not call
            // an endpoint, and its demand would wake a server nobody uses.
            signalUnoServerDemand();
            try {
                unoLease = unoServerPool.acquireEndpoint(timeoutDuration, TimeUnit.MINUTES);
            } catch (TimeoutException e) {
                throw new IOException(
                        "All unoserver endpoints busy; request timed out after "
                                + timeoutDuration
                                + " minutes",
                        e);
            }
            if (!unoServerPool.waitForEndpoint(
                    unoLease.getEndpoint(), UNO_SERVER_READY_WAIT_SECONDS, TimeUnit.SECONDS)) {
                log.warn(
                        "No local unoserver endpoint accepted connections within {}s; continuing",
                        UNO_SERVER_READY_WAIT_SECONDS);
            }
            commandToRun = applyUnoServerEndpoint(command, unoLease.getEndpoint());
            useSemaphore = false;
        }
        if (useSemaphore) {
            semaphore.acquire();
        }
        try {

            validateCommand(commandToRun);
            log.info("Running command: {}", String.join(" ", commandToRun));
            ProcessBuilder processBuilder = new ProcessBuilder(commandToRun);
            scrubEnvironment(processBuilder);
            if (processType == Processes.LIBRE_OFFICE) {
                jobPolicy = LibreOfficeSandboxPolicy.forCommand(commandToRun).orElse(null);
                if (jobPolicy != null) {
                    processBuilder.environment().putAll(jobPolicy.env());
                    LibreOfficeSandboxPolicy.seedProfile(jobPolicy.profile());
                    outcome.freshProfile =
                            LibreOfficeSandboxPolicy.isProfileUninitialised(jobPolicy.profile());
                    ipcPipesBefore =
                            LibreOfficeSandboxPolicy.snapshotIpcPipes(
                                    Path.of(LibreOfficeSandboxPolicy.IPC_PIPE_DIR));
                }
            }

            // Use the working directory if it's set
            if (workingDirectory != null) {
                processBuilder.directory(workingDirectory);
            }
            if (useUnoServerPool) {
                signalUnoServerDemand();
            }
            Process process = processBuilder.start();

            // Read the error stream and standard output stream concurrently
            List<String> errorLines = new ArrayList<>();
            List<String> outputLines = new ArrayList<>();

            Thread errorReaderThread =
                    Thread.ofVirtual()
                            .unstarted(
                                    () -> {
                                        try (BufferedReader errorReader =
                                                new BufferedReader(
                                                        new InputStreamReader(
                                                                process.getErrorStream(),
                                                                StandardCharsets.UTF_8))) {
                                            String line;
                                            while ((line =
                                                            BoundedLineReader.readLine(
                                                                    errorReader, 5_000_000))
                                                    != null) {
                                                errorLines.add(line);
                                                if (liveUpdates) log.info(line);
                                            }
                                        } catch (InterruptedIOException e) {
                                            log.warn(
                                                    "Error reader thread was interrupted due to timeout.");
                                        } catch (IOException e) {
                                            log.error("exception", e);
                                        }
                                    });

            Thread outputReaderThread =
                    Thread.ofVirtual()
                            .unstarted(
                                    () -> {
                                        try (BufferedReader outputReader =
                                                new BufferedReader(
                                                        new InputStreamReader(
                                                                process.getInputStream(),
                                                                StandardCharsets.UTF_8))) {
                                            String line;
                                            while ((line =
                                                            BoundedLineReader.readLine(
                                                                    outputReader, 5_000_000))
                                                    != null) {
                                                outputLines.add(line);
                                                if (liveUpdates) log.info(line);
                                            }
                                        } catch (InterruptedIOException e) {
                                            log.warn(
                                                    "Error reader thread was interrupted due to timeout.");
                                        } catch (IOException e) {
                                            log.error("exception", e);
                                        }
                                    });

            errorReaderThread.start();
            outputReaderThread.start();

            Thread unoHeartbeat = null;
            if (useUnoServerPool) {
                unoHeartbeat =
                        Thread.ofVirtual()
                                .unstarted(
                                        () -> {
                                            while (!Thread.currentThread().isInterrupted()
                                                    && process.isAlive()) {
                                                try {
                                                    Thread.sleep(30_000);
                                                } catch (InterruptedException e) {
                                                    Thread.currentThread().interrupt();
                                                    break;
                                                }
                                                signalUnoServerDemand();
                                            }
                                        });
                unoHeartbeat.start();
            }

            // Wait for the conversion process to complete. The heartbeat must be
            // stopped on every exit path, and a cancelled request must not leave
            // the child alive still refreshing demand.
            boolean finished;
            try {
                finished = process.waitFor(timeoutDuration, TimeUnit.MINUTES);
            } catch (InterruptedException e) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
                throw e;
            } finally {
                if (unoHeartbeat != null) {
                    unoHeartbeat.interrupt();
                }
            }

            if (!finished) {
                // Kill the entire process tree (descendants first, then the process itself)
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
                // Interrupt the reader threads
                errorReaderThread.interrupt();
                outputReaderThread.interrupt();
                outcome.timedOut = true;
                throw new IOException("Process timeout exceeded.");
            }
            exitCode = process.exitValue();
            // Wait for the reader threads to finish
            errorReaderThread.join();
            outputReaderThread.join();

            boolean isQpdf =
                    commandToRun != null
                            && !commandToRun.isEmpty()
                            && commandToRun.getFirst().contains("qpdf");

            if (!outputLines.isEmpty()) {
                String outputMessage = String.join("\n", outputLines);
                messages += outputMessage;
                if (!liveUpdates) {
                    log.info("Command output:\n{}", outputMessage);
                }
            }

            if (!errorLines.isEmpty()) {
                String errorMessage = String.join("\n", errorLines);
                messages += errorMessage;
                if (!liveUpdates) {
                    log.warn("Command error output:\n{}", errorMessage);
                }
                if (exitCode != 0) {
                    if (isQpdf && exitCode == 3) {
                        log.warn("qpdf succeeded with warnings: {}", messages);
                    } else {
                        throw new IOException(
                                "Command process failed with exit code "
                                        + exitCode
                                        + ". Error message: "
                                        + errorMessage);
                    }
                }
            }

            if (exitCode != 0) {
                if (isQpdf && exitCode == 3) {
                    log.warn("qpdf succeeded with warnings: {}", messages);
                } else {
                    throw new IOException(
                            "Command process failed with exit code "
                                    + exitCode
                                    + "\nLogs: "
                                    + messages);
                }
            }
        } finally {
            if (ipcPipesBefore != null) {
                outcome.stalePipeRemoved =
                        LibreOfficeSandboxPolicy.removeLeftoverIpcPipes(
                                Path.of(LibreOfficeSandboxPolicy.IPC_PIPE_DIR), ipcPipesBefore);
                if (exitCode == 0) {
                    Path profile = jobPolicy.profile();
                    LibreOfficeSandboxPolicy.rememberProfile(profile, profile.getParent());
                }
            }
            if (useSemaphore) {
                semaphore.release();
            }
            if (unoLease != null) {
                unoLease.close();
            }
        }
        return new ProcessExecutorResult(exitCode, messages);
    }

    private static final Set<String> LIBRE_OFFICE_ENV_ALLOWLIST =
            Set.of(
                    "HOME",
                    "USER",
                    "LOGNAME",
                    "PATH",
                    "SHELL",
                    "PWD",
                    "TMPDIR",
                    "TMP",
                    "LANG",
                    "LANGUAGE",
                    "TZ",
                    "TERM",
                    "HOSTNAME",
                    "DISPLAY",
                    "XDG_RUNTIME_DIR",
                    "XDG_CACHE_HOME",
                    "XDG_CONFIG_HOME",
                    "XDG_DATA_HOME",
                    "LD_LIBRARY_PATH",
                    "JAVA_HOME",
                    "FONTCONFIG_PATH",
                    "FONTCONFIG_FILE",
                    "DBUS_SESSION_BUS_ADDRESS",
                    "MALLOC_ARENA_MAX",
                    "PYTHONIOENCODING",
                    "PYTHONUNBUFFERED");

    private static final List<String> LIBRE_OFFICE_ENV_ALLOWED_PREFIXES =
            List.of("LC_", "SAL_", "OOO_", "UNO_", "URE_", "OFFICE_", "STIRLING_LO_");

    private static boolean isLoopbackHost(String host) {
        if (host == null) {
            return false;
        }
        String normalized = host.trim().toLowerCase(java.util.Locale.ROOT);
        return "127.0.0.1".equals(normalized)
                || "localhost".equals(normalized)
                || "::1".equals(normalized)
                || "[::1]".equals(normalized);
    }

    private void scrubEnvironment(ProcessBuilder processBuilder) {
        if (processType != Processes.LIBRE_OFFICE) {
            return;
        }
        processBuilder.environment().keySet().removeIf(name -> !isLibreOfficeEnvAllowed(name));
    }

    private static boolean isLibreOfficeEnvAllowed(String name) {
        if (name == null) {
            return false;
        }
        if (LIBRE_OFFICE_ENV_ALLOWLIST.contains(name)) {
            return true;
        }
        for (String prefix : LIBRE_OFFICE_ENV_ALLOWED_PREFIXES) {
            if (name.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    private boolean shouldUseUnoServerPool(List<String> command) {
        if (processType != Processes.LIBRE_OFFICE || unoServerPool == null) {
            return false;
        }
        if (unoServerPool.isEmpty()) {
            return false;
        }
        if (command == null || command.isEmpty()) {
            return false;
        }

        // Check if this is a UNO conversion by looking for unoconvert executable
        String executable = command.getFirst();
        if (executable != null) {
            // Extract basename from path for matching
            String basename = executable;
            int lastSlash = Math.max(executable.lastIndexOf('/'), executable.lastIndexOf('\\'));
            if (lastSlash >= 0) {
                basename = executable.substring(lastSlash + 1);
            }
            // Strip .exe extension on Windows
            if (basename.toLowerCase(java.util.Locale.ROOT).endsWith(".exe")) {
                basename = basename.substring(0, basename.length() - 4);
            }
            // Match common unoconvert variants (but NOT soffice)
            String lowerBasename = basename.toLowerCase(java.util.Locale.ROOT);
            if (lowerBasename.contains("unoconvert") || "unoconv".equals(lowerBasename)) {
                return true;
            }
        }

        return false;
    }

    private List<String> applyUnoServerEndpoint(
            List<String> command,
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint) {
        if (endpoint == null || command == null || command.isEmpty()) {
            return command;
        }
        List<String> updated = stripUnoEndpointArgs(command);
        String host = endpoint.getHost();
        int port = endpoint.getPort();
        String hostLocation = endpoint.getHostLocation();
        String protocol = endpoint.getProtocol();

        // Normalize and validate host
        if (host == null || host.isBlank()) {
            host = "127.0.0.1";
        }

        // Normalize and validate port
        if (port <= 0) {
            port = 2003;
        }

        // Normalize and validate hostLocation (only auto|local|remote allowed)
        if (hostLocation == null
                || hostLocation.isBlank()
                || "auto".equalsIgnoreCase(hostLocation)) {
            hostLocation = isLoopbackHost(host) ? "remote" : "auto";
        } else {
            hostLocation = hostLocation.trim().toLowerCase(java.util.Locale.ROOT);
            if (!Set.of("auto", "local", "remote").contains(hostLocation)) {
                log.warn(
                        "Invalid hostLocation '{}' for endpoint {}:{}, defaulting to 'auto'",
                        hostLocation,
                        host,
                        port);
                hostLocation = "auto";
            }
        }

        // Normalize and validate protocol (only http|https allowed)
        if (protocol == null) {
            protocol = "http";
        } else {
            protocol = protocol.trim().toLowerCase(java.util.Locale.ROOT);
            if (!Set.of("http", "https").contains(protocol)) {
                log.warn(
                        "Invalid protocol '{}' for endpoint {}:{}, defaulting to 'http'",
                        protocol,
                        host,
                        port);
                protocol = "http";
            }
        }

        int insertIndex = Math.min(1, updated.size());
        updated.add(insertIndex++, "--host");
        updated.add(insertIndex++, host);
        updated.add(insertIndex++, "--port");
        updated.add(insertIndex++, String.valueOf(port));

        // Only inject --host-location if non-default (for compatibility with older unoconvert)
        if (!"auto".equals(hostLocation)) {
            updated.add(insertIndex++, "--host-location");
            updated.add(insertIndex++, hostLocation);
        }

        // Only inject --protocol if non-default (for compatibility with older unoconvert)
        if (!"http".equals(protocol)) {
            updated.add(insertIndex++, "--protocol");
            updated.add(insertIndex, protocol);
        }

        return updated;
    }

    private List<String> stripUnoEndpointArgs(List<String> command) {
        List<String> stripped = new ArrayList<>(command.size());
        for (int i = 0; i < command.size(); i++) {
            String arg = command.get(i);
            if ("--host".equals(arg)
                    || "--port".equals(arg)
                    || "--host-location".equals(arg)
                    || "--protocol".equals(arg)) {
                i++;
                continue;
            }
            if (arg != null
                    && (arg.startsWith("--host=")
                            || arg.startsWith("--port=")
                            || arg.startsWith("--host-location=")
                            || arg.startsWith("--protocol="))) {
                continue;
            }
            stripped.add(arg);
        }
        return stripped;
    }

    private void validateCommand(List<String> command) {
        if (command == null || command.isEmpty()) {
            throw new IllegalArgumentException("Command must not be empty");
        }

        // Validate all arguments for null bytes and newlines (actual security concerns)
        for (String arg : command) {
            if (arg == null) {
                throw new IllegalArgumentException("Command contains null argument");
            }
            if (arg.indexOf('\0') >= 0 || arg.indexOf('\n') >= 0 || arg.indexOf('\r') >= 0) {
                throw new IllegalArgumentException("Command contains invalid characters");
            }
        }

        // Validate executable (first argument)
        String executable = command.getFirst();
        if (executable == null || executable.isBlank()) {
            throw new IllegalArgumentException("Command executable must not be empty");
        }

        // Check for path traversal in executable
        if (executable.contains("..")) {
            throw new IllegalArgumentException(
                    "Command executable contains path traversal: " + executable);
        }

        // For absolute paths, verify the file exists and is executable
        if (executable.contains("/") || executable.contains("\\")) {
            Path execPath;
            try {
                execPath = Path.of(executable);
            } catch (Exception e) {
                throw new IllegalArgumentException("Invalid executable path: " + executable, e);
            }

            if (!Files.exists(execPath)) {
                throw new IllegalArgumentException(
                        "Command executable does not exist: " + executable);
            }

            if (!Files.isRegularFile(execPath)) {
                throw new IllegalArgumentException(
                        "Command executable is not a regular file: " + executable);
            }
        }
        // For relative paths, trust that PATH resolution will work or fail appropriately
    }

    /**
     * How long a conversion waits for a local unoserver endpoint to accept connections after
     * signalling demand. The manager notices the demand file on its own schedule and then starts
     * soffice, which takes a few seconds; the wait is bounded so a broken setup still reaches the
     * soffice fallback quickly.
     */
    private static final long UNO_SERVER_READY_WAIT_SECONDS = 15;

    /**
     * Signal the on-demand unoserver manager that a conversion is needed. Writes the current epoch
     * timestamp to /tmp/uno-last-used. The demand manager watches this file. Skips writing when
     * configured purely with remoteunoserver endpoints.
     */
    private static void signalUnoServerDemand() {
        if (unoServerPool != null && !unoServerPool.hasLocalEndpoints()) {
            return;
        }
        try {
            Path demandFile = Path.of("/tmp/uno-last-used");
            String epoch = String.valueOf(System.currentTimeMillis() / 1000);
            Files.writeString(demandFile, epoch);
        } catch (IOException e) {
            log.debug("Could not write unoserver demand file: {}", e.getMessage());
        }
    }

    public enum Processes {
        LIBRE_OFFICE,
        PDFTOHTML,
        PYTHON_OPENCV,
        WEASYPRINT,
        INSTALL_APP,
        CALIBRE,
        IMAGEMAGICK,
        TESSERACT,
        QPDF,
        GHOSTSCRIPT,
        OCR_MY_PDF,
        CFF_CONVERTER,
        FFMPEG
    }

    @Setter
    @Getter
    public class ProcessExecutorResult {
        int rc;
        String messages;

        public ProcessExecutorResult(int rc, String messages) {
            this.rc = rc;
            this.messages = messages;
        }
    }
}
