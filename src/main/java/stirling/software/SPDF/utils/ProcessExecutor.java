package stirling.software.SPDF.utils;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import io.github.pixee.security.BoundedLineReader;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;

@Slf4j
@Component
public class ProcessExecutor {

    private static final Map<Processes, ProcessExecutor> instances = new ConcurrentHashMap<>();
    private static ApplicationProperties applicationProperties;
    private Semaphore semaphore;
    private boolean liveUpdates = true;
    private long timeoutDuration = 10; // Default timeout of 10 minutes

    @Autowired
    public void setApplicationProperties(ApplicationProperties applicationProperties) {
        ProcessExecutor.applicationProperties = applicationProperties;
        // Initialize instances if not already done
        initializeExecutorInstances();
    }

    /**
     * Initialize all executor instances with the application properties This ensures that the
     * static instances are correctly configured after application startup
     */
    private void initializeExecutorInstances() {
        if (applicationProperties != null) {
            // Pre-initialize all process types
            for (Processes type : Processes.values()) {
                getInstance(type);
            }
            log.info("Initialized ProcessExecutor instances for all process types");
        }
    }

    @Autowired
    public ProcessExecutor() {
        this.processType = null; // This instance is just for Spring DI
        this.semaphore = new Semaphore(1); // Default to 1 permit
    }

    private ProcessExecutor(
            Processes processType, int semaphoreLimit, boolean liveUpdates, long timeout) {
        this.processType = processType;
        this.semaphore = new Semaphore(semaphoreLimit);
        this.liveUpdates = liveUpdates;
        this.timeoutDuration = timeout;
    }

    // Task tracking
    private Processes processType;
    private final Queue<ConversionTask> queuedTasks = new ConcurrentLinkedQueue<>();
    private final Map<String, ConversionTask> activeTasks = new ConcurrentHashMap<>();
    private final Map<String, ConversionTask> completedTasks = new ConcurrentHashMap<>();
    private static final int MAX_COMPLETED_TASKS = 100; // Maximum number of completed tasks to keep

    // Metrics
    private final AtomicInteger totalTasksProcessed = new AtomicInteger(0);
    private final AtomicInteger failedTasks = new AtomicInteger(0);
    private final AtomicInteger totalQueueTime = new AtomicInteger(0);
    private final AtomicInteger totalProcessTime = new AtomicInteger(0);

    // For testing - allows injecting a mock
    private static ProcessExecutor mockInstance;

    public static void setStaticMockInstance(ProcessExecutor mock) {
        mockInstance = mock;
    }

    public static ProcessExecutor getInstance(Processes processType) {
        return getInstance(processType, true);
    }

    public static ProcessExecutor getInstance(Processes processType, boolean liveUpdates) {
        // For testing - return the mock if set
        if (mockInstance != null) {
            return mockInstance;
        }

        return instances.computeIfAbsent(
                processType,
                key -> {
                    int semaphoreLimit = 1; // Default if applicationProperties is null
                    long timeoutMinutes = 10; // Default if applicationProperties is null

                    if (applicationProperties != null) {
                        semaphoreLimit =
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

                        timeoutMinutes =
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
                    }
                    return new ProcessExecutor(key, semaphoreLimit, liveUpdates, timeoutMinutes);
                });
    }

    /**
     * Creates a new conversion task and adds it to the queue
     *
     * @param taskName A descriptive name for the task
     * @return The created conversion task
     */
    public ConversionTask createTask(String taskName) {
        ConversionTask task = new ConversionTask(taskName, this.processType);
        queuedTasks.add(task);
        updateQueuePositions();
        log.debug(
                "Created new task {} for {} process, queue position: {}",
                task.getId(),
                processType,
                task.getQueuePosition());
        return task;
    }

    /**
     * Gets a task by its ID
     *
     * @param taskId The task ID
     * @return The task or null if not found
     */
    public ConversionTask getTask(String taskId) {
        // Check active tasks first
        ConversionTask task = activeTasks.get(taskId);
        if (task != null) {
            return task;
        }

        // Check queued tasks
        for (ConversionTask queuedTask : queuedTasks) {
            if (queuedTask.getId().equals(taskId)) {
                return queuedTask;
            }
        }

        // Check completed tasks
        return completedTasks.get(taskId);
    }

    /**
     * Gets all tasks for this process type
     *
     * @return List of all tasks
     */
    public List<ConversionTask> getAllTasks() {
        List<ConversionTask> allTasks = new ArrayList<>();
        allTasks.addAll(queuedTasks);
        allTasks.addAll(activeTasks.values());
        allTasks.addAll(completedTasks.values());
        return allTasks;
    }

    /**
     * Gets all active tasks for this process type
     *
     * @return List of active tasks
     */
    public List<ConversionTask> getActiveTasks() {
        return new ArrayList<>(activeTasks.values());
    }

    /**
     * Gets all queued tasks for this process type
     *
     * @return List of queued tasks
     */
    public List<ConversionTask> getQueuedTasks() {
        return new ArrayList<>(queuedTasks);
    }

    /**
     * Gets the current queue length
     *
     * @return Number of tasks in queue
     */
    public int getQueueLength() {
        return queuedTasks.size();
    }

    /**
     * Gets the number of active tasks
     *
     * @return Number of tasks currently running
     */
    public int getActiveTaskCount() {
        return activeTasks.size();
    }

    /**
     * Gets the maximum number of concurrent tasks
     *
     * @return Maximum concurrent tasks
     */
    public int getMaxConcurrentTasks() {
        return semaphore.availablePermits() + semaphore.getQueueLength();
    }

    /**
     * Gets the estimated wait time based on current queue and average processing time
     *
     * @return Estimated wait time in milliseconds
     */
    public long getEstimatedWaitTimeMs() {
        if (queuedTasks.isEmpty()) {
            return 0;
        }

        int processed = totalTasksProcessed.get();
        if (processed == 0) {
            return 30000; // Default 30 seconds if no data
        }

        double avgProcessTime = totalProcessTime.get() / (double) processed;
        int activeCount = activeTasks.size();
        int maxConcurrent = semaphore.availablePermits() + semaphore.getQueueLength();
        int queueLength = queuedTasks.size();

        // Calculate how many queue cycles are needed
        double cycles = Math.ceil(queueLength / (double) maxConcurrent);

        // Estimate wait time
        return (long) (avgProcessTime * cycles);
    }

    /** Updates the queue positions for all queued tasks */
    private synchronized void updateQueuePositions() {
        int position = 0;
        for (ConversionTask task : queuedTasks) {
            task.setQueuePosition(++position);
        }
    }

    /**
     * Run a command with a task for queue tracking
     *
     * @param command The command to execute
     * @param taskName A descriptive name for the task
     * @return The result of the execution
     */
    public ProcessExecutorResult runCommandWithTask(List<String> command, String taskName)
            throws IOException, InterruptedException {
        return runCommandWithTask(command, null, taskName);
    }

    /**
     * Run a command without creating a task (direct execution)
     *
     * @param command The command to execute
     * @return The result of the execution
     */
    public ProcessExecutorResult runCommand(List<String> command)
            throws IOException, InterruptedException {
        return runCommandWithTask(command, "Unnamed command");
    }

    /**
     * Run a command with a task for queue tracking
     *
     * @param command The command to execute
     * @param workingDirectory The working directory
     * @param taskName A descriptive name for the task
     * @return The result of the execution
     */
    public ProcessExecutorResult runCommandWithTask(
            List<String> command, File workingDirectory, String taskName)
            throws IOException, InterruptedException {
        // Create and track the task
        ConversionTask task = createTask(taskName);
        try {
            return runCommandWithOutputHandling(command, workingDirectory, task);
        } catch (Exception e) {
            task.fail(e.getMessage());
            throw e;
        }
    }

    /** Legacy method for backwards compatibility */
    public ProcessExecutorResult runCommandWithOutputHandling(List<String> command)
            throws IOException, InterruptedException {
        return runCommandWithOutputHandling(command, null);
    }

    /** Legacy method for backwards compatibility */
    public ProcessExecutorResult runCommandWithOutputHandling(
            List<String> command, File workingDirectory) throws IOException, InterruptedException {
        return runCommandWithOutputHandling(command, workingDirectory, null);
    }

    /** Main method to run a command and handle its output */
    private ProcessExecutorResult runCommandWithOutputHandling(
            List<String> command, File workingDirectory, ConversionTask task)
            throws IOException, InterruptedException {

        String messages = "";
        int exitCode = 1;

        // If no task was provided, create an anonymous one
        boolean createdTask = false;
        if (task == null) {
            task = createTask("Anonymous " + processType + " task");
            createdTask = true;
        }

        // Wait for a permit from the semaphore (this is where queuing happens)
        semaphore.acquire();

        // Task is now running
        task.start(Thread.currentThread());
        queuedTasks.remove(task);
        activeTasks.put(task.getId(), task);
        updateQueuePositions(); // Update queue positions for remaining tasks

        try {
            log.info("Running command for task {}: {}", task.getId(), String.join(" ", command));
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

            // Task completed successfully
            task.complete();
            totalTasksProcessed.incrementAndGet();
            totalProcessTime.addAndGet((int) task.getProcessingTimeMs());
            totalQueueTime.addAndGet((int) task.getQueueTimeMs());

            // Move from active to completed
            activeTasks.remove(task.getId());
            addToCompletedTasks(task);

            log.debug(
                    "Task {} completed in {}ms (queue: {}ms, processing: {}ms)",
                    task.getId(),
                    task.getTotalTimeMs(),
                    task.getQueueTimeMs(),
                    task.getProcessingTimeMs());

        } catch (Exception e) {
            // Task failed
            task.fail(e.getMessage());
            failedTasks.incrementAndGet();

            // Move from active to completed
            activeTasks.remove(task.getId());
            addToCompletedTasks(task);

            log.error(
                    "Task {} failed after {}ms (queue: {}ms, processing: {}ms): {}",
                    task.getId(),
                    task.getTotalTimeMs(),
                    task.getQueueTimeMs(),
                    task.getProcessingTimeMs(),
                    e.getMessage());

            throw e;
        } finally {
            semaphore.release();

            // For anonymous tasks, don't keep them in completed tasks
            if (createdTask) {
                completedTasks.remove(task.getId());
            }
        }
        return new ProcessExecutorResult(exitCode, messages, task.getId());
    }

    /** Adds a task to the completed tasks map, maintaining size limit */
    private synchronized void addToCompletedTasks(ConversionTask task) {
        // Add the task to completed tasks
        completedTasks.put(task.getId(), task);

        // If we exceed the limit, remove oldest completed tasks
        if (completedTasks.size() > MAX_COMPLETED_TASKS) {
            List<ConversionTask> oldestTasks =
                    completedTasks.values().stream()
                            .sorted(Comparator.comparing(ConversionTask::getEndTime))
                            .limit(completedTasks.size() - MAX_COMPLETED_TASKS)
                            .collect(Collectors.toList());

            for (ConversionTask oldTask : oldestTasks) {
                completedTasks.remove(oldTask.getId());
            }
        }
    }

    /** Periodically log queue statistics (once per minute) */
    @Scheduled(fixedRate = 60000)
    public void logQueueStatistics() {
        if (!queuedTasks.isEmpty() || !activeTasks.isEmpty()) {
            int total = totalTasksProcessed.get();
            int failed = failedTasks.get();
            float successRate = total > 0 ? (float) (total - failed) / total * 100 : 0;
            float avgQueueTime = total > 0 ? (float) totalQueueTime.get() / total : 0;
            float avgProcessTime = total > 0 ? (float) totalProcessTime.get() / total : 0;

            log.info(
                    "{} queue status: Active={}, Queued={}, Completed={}, AvgQueue={}ms, AvgProcess={}ms, SuccessRate={:.2f}%",
                    processType,
                    activeTasks.size(),
                    queuedTasks.size(),
                    total,
                    avgQueueTime,
                    avgProcessTime,
                    successRate);
        }
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

    @Getter
    public class ProcessExecutorResult {
        private final int rc;
        private final String messages;
        private final String taskId;

        public ProcessExecutorResult(int rc, String messages) {
            this(rc, messages, null);
        }

        public ProcessExecutorResult(int rc, String messages, String taskId) {
            this.rc = rc;
            this.messages = messages;
            this.taskId = taskId;
        }
    }
}
