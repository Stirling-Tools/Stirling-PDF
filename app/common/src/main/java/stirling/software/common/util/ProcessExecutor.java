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
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

import io.github.pixee.security.BoundedLineReader;

import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Slf4j
public class ProcessExecutor {

    // A document can make a tool print without end, so each run logs a bounded amount of output
    static final int MAX_LOGGED_LINES = 200;
    static final int MAX_LOGGED_LINE_LENGTH = 1_000;
    private static final Pattern CONTROL_CHARACTERS = Pattern.compile("[\\p{Cntrl}&&[^\\t]]");

    private static final Map<Processes, ProcessExecutor> instances = new ConcurrentHashMap<>();
    private static ApplicationProperties applicationProperties = new ApplicationProperties();

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
                                case PYTHON_OPENCV ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getPythonOpenCvSessionLimit();
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
                                case FFMPEG ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getSessionLimit()
                                                .getFfmpegSessionLimit();
                            };

                    long timeoutMinutes =
                            switch (key) {
                                case PYTHON_OPENCV ->
                                        applicationProperties
                                                .getProcessExecutor()
                                                .getTimeoutMinutes()
                                                .getPythonOpenCvTimeoutMinutes();
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

    public ProcessExecutorResult runCommandWithOutputHandling(List<String> command)
            throws IOException, InterruptedException {
        return runCommandWithOutputHandling(command, null);
    }

    public ProcessExecutorResult runCommandWithOutputHandling(
            List<String> command, File workingDirectory) throws IOException, InterruptedException {
        String messages = "";
        int exitCode = 1;
        semaphore.acquire();
        try {

            validateCommand(command);
            log.info("Running command: {}", String.join(" ", command));
            ProcessBuilder processBuilder = new ProcessBuilder(command);

            // Use the working directory if it's set
            if (workingDirectory != null) {
                processBuilder.directory(workingDirectory);
            }
            Process process = processBuilder.start();

            // Read the error stream and standard output stream concurrently
            List<String> errorLines = new ArrayList<>();
            List<String> outputLines = new ArrayList<>();
            AtomicInteger offeredLines = new AtomicInteger();

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
                                                if (liveUpdates) logLiveLine(line, offeredLines);
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
                                                if (liveUpdates) logLiveLine(line, offeredLines);
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

            boolean finished;
            try {
                finished = process.waitFor(timeoutDuration, TimeUnit.MINUTES);
            } catch (InterruptedException e) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
                throw e;
            }

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
            logUnloggedLiveLines(offeredLines.get());

            boolean isQpdf = command.getFirst().contains("qpdf");
            boolean qpdfWarnings = isQpdf && exitCode == 3;

            if (!outputLines.isEmpty()) {
                String outputMessage = String.join("\n", outputLines);
                messages += outputMessage;
                if (!liveUpdates) {
                    log.info("Command output:\n{}", forLog(outputLines, offeredLines));
                }
            }

            if (!errorLines.isEmpty()) {
                String errorMessage = String.join("\n", errorLines);
                messages += errorMessage;
                if (!liveUpdates) {
                    log.warn("Command error output:\n{}", forLog(errorLines, offeredLines));
                }
                if (exitCode != 0 && !qpdfWarnings) {
                    throw new IOException(
                            "Command process failed with exit code "
                                    + exitCode
                                    + ". Error message: "
                                    + forLog(errorLines));
                }
            }

            if (qpdfWarnings) {
                log.warn(
                        "qpdf succeeded with warnings: {}",
                        forLog(allLines(outputLines, errorLines), offeredLines));
            } else if (exitCode != 0) {
                throw new IOException(
                        "Command process failed with exit code "
                                + exitCode
                                + "\nLogs: "
                                + forLog(allLines(outputLines, errorLines)));
            }
        } finally {
            semaphore.release();
        }
        return new ProcessExecutorResult(exitCode, messages);
    }

    private void logLiveLine(String line, AtomicInteger seen) {
        if (seen.incrementAndGet() > MAX_LOGGED_LINES) {
            return;
        }
        log.info("{}", forLog(line));
    }

    private void logUnloggedLiveLines(int seen) {
        int unlogged = seen - MAX_LOGGED_LINES;
        if (unlogged <= 0) {
            return;
        }
        log.info("{} more output lines were not logged", unlogged);
    }

    private static List<String> allLines(List<String> outputLines, List<String> errorLines) {
        List<String> lines = new ArrayList<>(outputLines);
        lines.addAll(errorLines);
        return lines;
    }

    /** Uses what is left of the run's {@link #MAX_LOGGED_LINES}, counted in {@code offered}. */
    private static String forLog(List<String> lines, AtomicInteger offered) {
        int left = MAX_LOGGED_LINES - offered.getAndAdd(lines.size());
        return forLog(lines, Math.max(left, 0));
    }

    /** The first {@link #MAX_LOGGED_LINES} lines, each cut short and made printable. */
    static String forLog(List<String> lines) {
        return forLog(lines, MAX_LOGGED_LINES);
    }

    private static String forLog(List<String> lines, int allowance) {
        StringBuilder text = new StringBuilder();
        int shown = Math.min(lines.size(), allowance);
        for (int i = 0; i < shown; i++) {
            if (i > 0) {
                text.append('\n');
            }
            text.append(forLog(lines.get(i)));
        }
        if (lines.size() > shown) {
            if (shown > 0) {
                text.append('\n');
            }
            text.append("... ").append(lines.size() - shown).append(" more lines");
        }
        return text.toString();
    }

    static String forLog(String line) {
        boolean truncated = line.length() > MAX_LOGGED_LINE_LENGTH;
        String head = truncated ? line.substring(0, MAX_LOGGED_LINE_LENGTH) : line;
        String printable = CONTROL_CHARACTERS.matcher(head).replaceAll("?");
        return truncated ? printable + "..." : printable;
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

    public enum Processes {
        PYTHON_OPENCV,
        INSTALL_APP,
        TESSERACT,
        QPDF,
        GHOSTSCRIPT,
        OCR_MY_PDF,
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
