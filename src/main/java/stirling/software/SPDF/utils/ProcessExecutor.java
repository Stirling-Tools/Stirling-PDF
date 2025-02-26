package stirling.software.SPDF.utils;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

import io.github.pixee.security.BoundedLineReader;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;

@Slf4j
public class ProcessExecutor {

    private static final Map<Processes, ProcessExecutor> instances = new ConcurrentHashMap<>();
    private static ApplicationProperties applicationProperties = new ApplicationProperties();
    private final Semaphore semaphore;
    private final boolean liveUpdates;
    private long timeoutDuration;

    private ProcessExecutor(int semaphoreLimit, boolean liveUpdates, long timeout) {
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
                            };
                    return new ProcessExecutor(semaphoreLimit, liveUpdates, timeoutMinutes);
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

            log.info("Running command: " + String.join(" ", command));
            ProcessBuilder processBuilder = new ProcessBuilder(command);

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
                    command != null && !command.isEmpty() && command.get(0).contains("qpdf");

            if (!outputLines.isEmpty()) {
                String outputMessage = String.join("\n", outputLines);
                messages += outputMessage;
                if (!liveUpdates) {
                    log.info("Command output:\n" + outputMessage);
                }
            }

            if (!errorLines.isEmpty()) {
                String errorMessage = String.join("\n", errorLines);
                messages += errorMessage;
                if (!liveUpdates) {
                    log.warn("Command error output:\n" + errorMessage);
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
            semaphore.release();
        }
        return new ProcessExecutorResult(exitCode, messages);
    }

    public enum Processes {
        LIBRE_OFFICE,
        PDFTOHTML,
        PYTHON_OPENCV,
        WEASYPRINT,
        INSTALL_APP,
        CALIBRE,
        TESSERACT,
        QPDF
    }

    public class ProcessExecutorResult {
        int rc;
        String messages;

        public ProcessExecutorResult(int rc, String messages) {
            this.rc = rc;
            this.messages = messages;
        }

        public int getRc() {
            return rc;
        }

        public void setRc(int rc) {
            this.rc = rc;
        }

        public String getMessages() {
            return messages;
        }

        public void setMessages(String messages) {
            this.messages = messages;
        }
    }
}
