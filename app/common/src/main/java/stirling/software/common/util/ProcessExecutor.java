package stirling.software.common.util;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Predicate;
import java.util.function.UnaryOperator;

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

    private static final OfficeNetworkGuard OFFICE_NETWORK_GUARD =
            OfficeNetworkGuard.resolveAndReport();

    private static String executableBaseName(List<String> command) {
        if (command == null || command.isEmpty()) {
            return null;
        }
        String executable = command.getFirst();
        if (executable == null || executable.isBlank()) {
            return null;
        }
        int slash = Math.max(executable.lastIndexOf('/'), executable.lastIndexOf('\\'));
        String base =
                (slash >= 0 ? executable.substring(slash + 1) : executable)
                        .toLowerCase(Locale.ROOT);
        return base.endsWith(".exe") ? base.substring(0, base.length() - 4) : base;
    }

    static boolean isUnoClientCommand(List<String> command) {
        String base = executableBaseName(command);
        return base != null && (base.contains("unoconvert") || "unoconv".equals(base));
    }

    /**
     * Whether a {@link Processes#LIBRE_OFFICE} command is an office engine that must not be allowed
     * out to the network. Fail-closed: the process type launches only the engine or the unoserver
     * client, so everything that is not the client is treated as the engine — {@code
     * system.customPaths.operations.soffice} takes any path, and {@code /usr/bin/libreoffice} is a
     * symlink to the same wrapper as {@code /usr/bin/soffice}.
     */
    static boolean shouldGuardOfficeCommand(List<String> command) {
        return executableBaseName(command) != null && !isUnoClientCommand(command);
    }

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
        String messages = "";
        int exitCode = 1;
        UnoServerPool.UnoServerLease unoLease = null;
        boolean useSemaphore = true;
        List<String> commandToRun = command;
        if (shouldUseUnoServerPool(command)) {
            try {
                unoLease = unoServerPool.acquireEndpoint(timeoutDuration, TimeUnit.MINUTES);
            } catch (TimeoutException e) {
                throw new IOException(
                        "All unoserver endpoints busy; request timed out after "
                                + timeoutDuration
                                + " minutes",
                        e);
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

            if (processType == Processes.LIBRE_OFFICE) {
                OFFICE_NETWORK_GUARD.apply(processBuilder, commandToRun);
            }

            // Use the working directory if it's set
            if (workingDirectory != null) {
                processBuilder.directory(workingDirectory);
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

            // Wait for the conversion process to complete
            boolean finished = process.waitFor(timeoutDuration, TimeUnit.MINUTES);

            if (!finished) {
                // Kill the entire process tree (descendants first, then the process itself)
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
                // Interrupt the reader threads
                errorReaderThread.interrupt();
                outputReaderThread.interrupt();
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
            if (useSemaphore) {
                semaphore.release();
            }
            if (unoLease != null) {
                unoLease.close();
            }
        }
        return new ProcessExecutorResult(exitCode, messages);
    }

    private boolean shouldUseUnoServerPool(List<String> command) {
        if (processType != Processes.LIBRE_OFFICE || unoServerPool == null) {
            return false;
        }
        if (unoServerPool.isEmpty()) {
            return false;
        }
        return isUnoClientCommand(command);
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
        if (hostLocation == null) {
            hostLocation = "auto";
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
     * Resolves, and then applies, the {@code LD_PRELOAD} shim that stops a locally launched
     * LibreOffice engine opening non-loopback sockets.
     *
     * <p>Resolution is fail-open on purpose — a missing shim must not stop conversions — so every
     * path that leaves the engine unguarded carries a reason and is logged rather than returning a
     * bare null. Linux only: the shim interposes glibc {@code connect}, which macOS ignores for
     * {@code LD_PRELOAD} entirely and which {@code DYLD_INSERT_LIBRARIES} would need a {@code
     * __DATA,__interpose} section to reach.
     */
    static final class OfficeNetworkGuard {

        static final String DEFAULT_LIBRARY_PATH = "/usr/local/lib/stirling/soffice_no_network.so";

        private static final Set<String> ALLOW_NETWORK_TRUTHY = Set.of("1", "true", "yes", "on");

        private final String libraryPath;
        private final String unavailableReason;
        private final Set<String> warnedExecutables = ConcurrentHashMap.newKeySet();

        private OfficeNetworkGuard(String libraryPath, String unavailableReason) {
            this.libraryPath = libraryPath;
            this.unavailableReason = unavailableReason;
        }

        static OfficeNetworkGuard resolve(
                UnaryOperator<String> env, String osName, Predicate<Path> libraryExists) {
            String allow = env.apply("LIBREOFFICE_ALLOW_NETWORK");
            if (allow != null
                    && ALLOW_NETWORK_TRUTHY.contains(allow.trim().toLowerCase(Locale.ROOT))) {
                return unavailable("LIBREOFFICE_ALLOW_NETWORK=" + allow.trim() + " turned it off");
            }
            if (osName == null || !osName.toLowerCase(Locale.ROOT).startsWith("linux")) {
                return unavailable(
                        "LD_PRELOAD interposition needs Linux, this host reports " + osName);
            }
            String override = env.apply("LIBREOFFICE_NETWORK_GUARD_LIB");
            String path =
                    (override != null && !override.isBlank())
                            ? override.trim()
                            : DEFAULT_LIBRARY_PATH;
            Path libraryPath;
            try {
                libraryPath = Path.of(path);
            } catch (InvalidPathException e) {
                return unavailable(path + " is not a usable path: " + e.getMessage());
            }
            if (!libraryExists.test(libraryPath)) {
                return unavailable(path + " is missing from this install");
            }
            return new OfficeNetworkGuard(path, null);
        }

        private static OfficeNetworkGuard unavailable(String reason) {
            return new OfficeNetworkGuard(null, reason);
        }

        static OfficeNetworkGuard resolveAndReport() {
            OfficeNetworkGuard guard =
                    resolve(System::getenv, System.getProperty("os.name"), Files::exists);
            if (guard.isActive()) {
                log.info("LibreOffice network guard active: {}", guard.libraryPath);
            } else {
                log.info(
                        "LibreOffice network guard inactive: {}. Office conversion has no egress"
                                + " control on this install.",
                        guard.unavailableReason);
            }
            return guard;
        }

        boolean isActive() {
            return libraryPath != null;
        }

        String getLibraryPath() {
            return libraryPath;
        }

        String getUnavailableReason() {
            return unavailableReason;
        }

        /**
         * Preloads the shim for an office engine command, or warns once per executable that the
         * engine is running without it. The unoserver client is left alone deliberately: remote-UNO
         * mode is the client dialling out to another host, which the shim would block.
         */
        void apply(ProcessBuilder processBuilder, List<String> command) {
            if (!shouldGuardOfficeCommand(command)) {
                return;
            }
            if (!isActive()) {
                warnUnguarded(command.getFirst());
                return;
            }
            Map<String, String> env = processBuilder.environment();
            String existing = env.get("LD_PRELOAD");
            env.put(
                    "LD_PRELOAD",
                    (existing == null || existing.isBlank())
                            ? libraryPath
                            : libraryPath + " " + existing);
        }

        private void warnUnguarded(String executable) {
            if (warnedExecutables.add(executable)) {
                log.warn(
                        "LibreOffice engine {} is running with no network guard: {}. A converted"
                                + " document can make it reach the network.",
                        executable,
                        unavailableReason);
            }
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
