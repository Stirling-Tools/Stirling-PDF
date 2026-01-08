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
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

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
    private static final Set<String> ALLOWED_EXECUTABLES = initAllowedExecutables();
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
            unoLease = unoServerPool.acquireEndpoint();
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

            // Use the working directory if it's set
            if (workingDirectory != null) {
                processBuilder.directory(workingDirectory);
            }
            Process process = processBuilder.start();

            // Read the error stream and standard output stream concurrently
            List<String> errorLines = new ArrayList<>();
            List<String> outputLines = new ArrayList<>();

            Thread errorReaderThread =
                    new Thread(
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
                                    log.warn("Error reader thread was interrupted due to timeout.");
                                } catch (IOException e) {
                                    log.error("exception", e);
                                }
                            });

            Thread outputReaderThread =
                    new Thread(
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
                                    log.warn("Error reader thread was interrupted due to timeout.");
                                } catch (IOException e) {
                                    log.error("exception", e);
                                }
                            });

            errorReaderThread.start();
            outputReaderThread.start();

            // Wait for the conversion process to complete
            boolean finished = process.waitFor(timeoutDuration, TimeUnit.MINUTES);

            if (!finished) {
                // Terminate the process
                process.destroy();
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
                            && commandToRun.get(0).contains("qpdf");

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
        if (command == null || command.isEmpty()) {
            return false;
        }
        String executable = command.get(0);
        return executable != null && executable.toLowerCase().contains("unoconvert");
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
        String executable = command.get(0);
        if (executable == null || executable.isBlank()) {
            throw new IllegalArgumentException("Command executable must not be empty");
        }

        // Check for path traversal in executable
        if (executable.contains("..")) {
            throw new IllegalArgumentException(
                    "Command executable contains path traversal: " + executable);
        }

        // Handle absolute paths
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

            // For absolute paths, verify the filename is in allowlist
            Path fileNamePath = execPath.getFileName();
            if (fileNamePath == null) {
                throw new IllegalArgumentException(
                        "Command executable has no filename component: " + executable);
            }
            String filename = fileNamePath.toString();

            // Strip .exe extension on Windows for allowlist matching
            if (filename.toLowerCase(java.util.Locale.ROOT).endsWith(".exe")) {
                filename = filename.substring(0, filename.length() - 4);
            }

            if (!ALLOWED_EXECUTABLES.contains(filename)) {
                throw new IllegalArgumentException(
                        "Command executable filename not in allowlist: " + filename);
            }
            return;
        }

        // Relative executable name - must be in allowlist
        if (!ALLOWED_EXECUTABLES.contains(executable)) {
            throw new IllegalArgumentException(
                    "Command executable is not in allowlist: " + executable);
        }
    }

    private static Set<String> initAllowedExecutables() {
        Set<String> allowed = new HashSet<>();
        Collections.addAll(
                allowed,
                "unoconvert",
                "soffice",
                "weasyprint",
                "ocrmypdf",
                "qpdf",
                "tesseract",
                "gs",
                "ghostscript",
                "pdftohtml",
                "python3",
                "python",
                "java",
                "ebook-convert",
                "ffmpeg",
                "magick",
                "convert");
        return Collections.unmodifiableSet(allowed);
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
