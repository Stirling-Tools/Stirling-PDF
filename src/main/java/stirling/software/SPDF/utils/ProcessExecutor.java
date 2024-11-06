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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.github.pixee.security.BoundedLineReader;

import stirling.software.SPDF.model.ApplicationProperties;

public class ProcessExecutor {

    private static final Logger logger = LoggerFactory.getLogger(ProcessExecutor.class);

    private static ApplicationProperties applicationProperties = new ApplicationProperties();

    public enum Processes {
        LIBRE_OFFICE,
        PDFTOHTML,
        OCR_MY_PDF,
        PYTHON_OPENCV,
        GHOSTSCRIPT,
        WEASYPRINT,
        INSTALL_APP,
        CALIBRE
    }

    private static final Map<Processes, ProcessExecutor> instances = new ConcurrentHashMap<>();

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
                                                .getSemaphoreLimit()
                                                .getLibreOfficeSemaphoreLimit();
                                case PDFTOHTML ->
                                        applicationProperties
                                                .getSemaphoreLimit()
                                                .getPdfToHtmlSemaphoreLimit();
                                case OCR_MY_PDF ->
                                        applicationProperties
                                                .getSemaphoreLimit()
                                                .getOcrMyPdfSemaphoreLimit();
                                case PYTHON_OPENCV ->
                                        applicationProperties
                                                .getSemaphoreLimit()
                                                .getPythonOpenCvSemaphoreLimit();
                                case GHOSTSCRIPT ->
                                        applicationProperties
                                                .getSemaphoreLimit()
                                                .getGhostScriptSemaphoreLimit();
                                case WEASYPRINT ->
                                        applicationProperties
                                                .getSemaphoreLimit()
                                                .getWeasyPrintSemaphoreLimit();
                                case INSTALL_APP ->
                                        applicationProperties
                                                .getSemaphoreLimit()
                                                .getInstallAppSemaphoreLimit();
                                case CALIBRE ->
                                        applicationProperties
                                                .getSemaphoreLimit()
                                                .getCalibreSemaphoreLimit();
                            };

                    long timeoutMinutes =
                            switch (key) {
                                case LIBRE_OFFICE ->
                                        applicationProperties
                                                .getTimeoutMinutes()
                                                .getLibreOfficeTimeoutMinutes();
                                case PDFTOHTML ->
                                        applicationProperties
                                                .getTimeoutMinutes()
                                                .getPdfToHtmlTimeoutMinutes();
                                case OCR_MY_PDF ->
                                        applicationProperties
                                                .getTimeoutMinutes()
                                                .getOcrMyPdfTimeoutMinutes();
                                case PYTHON_OPENCV ->
                                        applicationProperties
                                                .getTimeoutMinutes()
                                                .getPythonOpenCvTimeoutMinutes();
                                case GHOSTSCRIPT ->
                                        applicationProperties
                                                .getTimeoutMinutes()
                                                .getGhostScriptTimeoutMinutes();
                                case WEASYPRINT ->
                                        applicationProperties
                                                .getTimeoutMinutes()
                                                .getWeasyPrintTimeoutMinutes();
                                case INSTALL_APP ->
                                        applicationProperties
                                                .getTimeoutMinutes()
                                                .getInstallAppTimeoutMinutes();
                                case CALIBRE ->
                                        applicationProperties
                                                .getTimeoutMinutes()
                                                .getCalibreTimeoutMinutes();
                            };
                    return new ProcessExecutor(semaphoreLimit, liveUpdates, timeoutMinutes);
                });
    }

    private final Semaphore semaphore;
    private final boolean liveUpdates;
    private long timeoutDuration;

    private ProcessExecutor(int semaphoreLimit, boolean liveUpdates, long timeout) {
        this.semaphore = new Semaphore(semaphoreLimit);
        this.liveUpdates = liveUpdates;
        this.timeoutDuration = timeout;
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

            logger.info("Running command: " + String.join(" ", command));
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
                                        if (liveUpdates) logger.info(line);
                                    }
                                } catch (InterruptedIOException e) {
                                    logger.warn(
                                            "Error reader thread was interrupted due to timeout.");
                                } catch (IOException e) {
                                    logger.error("exception", e);
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
                                        if (liveUpdates) logger.info(line);
                                    }
                                } catch (InterruptedIOException e) {
                                    logger.warn(
                                            "Error reader thread was interrupted due to timeout.");
                                } catch (IOException e) {
                                    logger.error("exception", e);
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

            if (outputLines.size() > 0) {
                String outputMessage = String.join("\n", outputLines);
                messages += outputMessage;
                if (!liveUpdates) {
                    logger.info("Command output:\n" + outputMessage);
                }
            }

            if (errorLines.size() > 0) {
                String errorMessage = String.join("\n", errorLines);
                messages += errorMessage;
                if (!liveUpdates) {
                    logger.warn("Command error output:\n" + errorMessage);
                }
                if (exitCode != 0) {
                    throw new IOException(
                            "Command process failed with exit code "
                                    + exitCode
                                    + ". Error message: "
                                    + errorMessage);
                }
            }

            if (exitCode != 0) {
                throw new IOException(
                        "Command process failed with exit code "
                                + exitCode
                                + "\nLogs: "
                                + messages);
            }
        } finally {
            semaphore.release();
        }
        return new ProcessExecutorResult(exitCode, messages);
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
